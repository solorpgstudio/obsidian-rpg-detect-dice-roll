import {
	ItemView,
	Menu,
	Notice,
	Plugin,
	setIcon,
	WorkspaceLeaf,
} from "obsidian";
import { BUILT_IN_DICE_BUTTONS, DEFAULT_SETTINGS, TtrpgDetectRollSettingTab } from "./settings";
import type { CustomNarrativeDie, RpgDetectDiceRollSettings, ThemeMode, ToastPlacement } from "./settings";

const VIEW_TYPE_ROLL_HISTORY = "ttrpg-detect-roll-history";
const DICE_PATTERN = /\b(?:\d*)d\d+(?:(?:kh|kl|dh|dl)\d+)?(?:\s*[+-]\s*\d+)?\b/gi;
const DICE_TERM_PATTERN = /^(?:(\d*)d(\d+))(?:(kh|kl|dh|dl)(\d+))?$/i;
const NUMBER_TERM_PATTERN = /^\d+$/;
const KEEP_DROP_SUFFIX_PATTERN = /^(kh|kl|dh|dl)\d+$/i;
const SKIP_SELECTOR = "code, pre, a, button, input, textarea, select, .ttrpg-detect-roll-formula";

type AdvantageMode = "normal" | "advantage" | "disadvantage";
type Operator = "+" | "-";

interface ParsedDice {
	count: number;
	sides: number;
	keepDrop?: "kh" | "kl" | "dh" | "dl";
	keepDropCount: number;
}

interface ParsedTerm {
	operator: Operator;
	dice?: ParsedDice;
	constant?: number;
}

interface RollAttempt {
	total: number;
	breakdown: string;
	rollDetail: string;
}

export interface RollResult {
	type: "formula" | "narrative";
	formula: string;
	total: number | null;
	timestamp: number;
	breakdown: string;
	resultLine: string;
	detail: string;
	attempts: RollAttempt[];
	mode: AdvantageMode;
}

interface RollOptions {
	mode?: AdvantageMode;
	attempts?: number;
	enforceOperatorSettings?: boolean;
}

export default class TtrpgDetectRollPlugin extends Plugin {
	settings: RpgDetectDiceRollSettings;
	history: RollResult[] = [];
	private themeObserver: MutationObserver | null = null;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.applyStyleVariables();
		this.watchThemeChanges();

		this.registerView(
			VIEW_TYPE_ROLL_HISTORY,
			(leaf) => new RollHistoryView(leaf, this),
		);

		this.addRibbonIcon("dice", "Open roll history", () => {
			void this.activateRollHistoryView();
		});

		this.addCommand({
			id: "open-roll-history",
			name: "Open roll history",
			callback: () => {
				void this.activateRollHistoryView();
			},
		});

		this.registerMarkdownPostProcessor((el) => {
			this.processDiceFormulas(el);
		});

		this.addSettingTab(new TtrpgDetectRollSettingTab(this.app, this));
	}

	onunload(): void {
		this.themeObserver?.disconnect();
		this.clearStyleVariables();
	}

	async loadSettings(): Promise<void> {
		const savedSettings = await this.loadData() as Partial<RpgDetectDiceRollSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...savedSettings,
			formulaColors: {
				light: {
					...DEFAULT_SETTINGS.formulaColors.light,
					...savedSettings?.formulaColors?.light,
				},
				dark: {
					...DEFAULT_SETTINGS.formulaColors.dark,
					...savedSettings?.formulaColors?.dark,
				},
			},
			toastColors: {
				light: {
					...DEFAULT_SETTINGS.toastColors.light,
					...savedSettings?.toastColors?.light,
				},
				dark: {
					...DEFAULT_SETTINGS.toastColors.dark,
					...savedSettings?.toastColors?.dark,
				},
			},
			clearHistoryButtonColors: {
				light: {
					...DEFAULT_SETTINGS.clearHistoryButtonColors.light,
					...savedSettings?.clearHistoryButtonColors?.light,
				},
				dark: {
					...DEFAULT_SETTINGS.clearHistoryButtonColors.dark,
					...savedSettings?.clearHistoryButtonColors?.dark,
				},
			},
			enabledDiceButtons: {
				...DEFAULT_SETTINGS.enabledDiceButtons,
				...savedSettings?.enabledDiceButtons,
			},
			customFormulaDice: savedSettings?.customFormulaDice ?? DEFAULT_SETTINGS.customFormulaDice,
			customNarrativeDice: savedSettings?.customNarrativeDice ?? DEFAULT_SETTINGS.customNarrativeDice,
		};
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
		this.applyStyleVariables();
		this.refreshRollHistoryViews();
	}

	async activateRollHistoryView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_ROLL_HISTORY)[0];

		if (!leaf) {
			leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf("split");
			await leaf.setViewState({ type: VIEW_TYPE_ROLL_HISTORY, active: true });
		}

		await this.app.workspace.revealLeaf(leaf);
	}

	rollAndRecord(formula: string, options: RollOptions = {}): RollResult | null {
		const result = this.rollFormula(formula, options);

		if (!result) {
			this.showNotice(`Invalid dice formula: ${formula}`, true);
			return null;
		}

		this.history.push(result);
		this.pruneHistory();
		this.showNotice(this.createRollNoticeFragment(result), false);
		this.refreshRollHistoryViews();
		return result;
	}

	rollNarrativeAndRecord(die: CustomNarrativeDie): RollResult | null {
		const result = this.rollNarrativeDie(die);

		if (!result) {
			this.showNotice(`Invalid narrative die: ${die.label || "Untitled"}`, true);
			return null;
		}

		this.history.push(result);
		this.pruneHistory();
		this.showNotice(this.createRollNoticeFragment(result), false);
		this.refreshRollHistoryViews();
		return result;
	}

	clearHistory(): void {
		this.history = [];
		this.refreshRollHistoryViews();
	}

	private processDiceFormulas(el: HTMLElement): void {
		const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
			acceptNode: (node) => {
				const parent = node.parentElement;

				if (!parent || parent.closest(SKIP_SELECTOR)) {
					return NodeFilter.FILTER_REJECT;
				}

				DICE_PATTERN.lastIndex = 0;
				return DICE_PATTERN.test(node.nodeValue ?? "")
					? NodeFilter.FILTER_ACCEPT
					: NodeFilter.FILTER_REJECT;
			},
		});
		const textNodes: Text[] = [];
		let currentNode = walker.nextNode();

		while (currentNode) {
			textNodes.push(currentNode as Text);
			currentNode = walker.nextNode();
		}

		for (const textNode of textNodes) {
			const fragment = this.createFormulaFragment(textNode.nodeValue ?? "");
			if (fragment) {
				textNode.replaceWith(fragment);
			}
		}
	}

	private createFormulaFragment(text: string): DocumentFragment | null {
		DICE_PATTERN.lastIndex = 0;
		let match = DICE_PATTERN.exec(text);

		if (!match) {
			return null;
		}

		const fragment = document.createDocumentFragment();
		let lastIndex = 0;

		while (match) {
			const formula = match[0];
			fragment.appendText(text.slice(lastIndex, match.index));
			fragment.appendChild(this.createFormulaElement(formula));
			lastIndex = match.index + formula.length;
			match = DICE_PATTERN.exec(text);
		}

		fragment.appendText(text.slice(lastIndex));
		return fragment;
	}

	private createFormulaElement(formula: string): HTMLElement {
		const formulaEl = document.createElement("span");
		formulaEl.addClass("ttrpg-detect-roll-formula");
		formulaEl.addClass(`ttrpg-detect-roll-formula-${this.settings.formulaStyle}`);
		formulaEl.setAttr("role", "button");
		formulaEl.setAttr("tabindex", "0");
		formulaEl.setAttr("aria-label", `Roll ${formula}`);
		formulaEl.setText(formula);

		const rollFormula = (evt: Event) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.rollAndRecord(formula);
		};

		formulaEl.addEventListener("click", rollFormula);
		formulaEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter" || evt.key === " ") {
				rollFormula(evt);
			}
		});
		formulaEl.addEventListener("contextmenu", (evt: MouseEvent) => {
			evt.preventDefault();
			evt.stopPropagation();
			this.openFormulaMenu(evt, formula);
		});

		return formulaEl;
	}

	private openFormulaMenu(evt: MouseEvent, formula: string): void {
		const menu = new Menu();
		menu.addItem((item) => item
			.setTitle("Roll normally")
			.setIcon("dice")
			.onClick(() => {
				this.rollAndRecord(formula);
			}));
		menu.addItem((item) => item
			.setTitle("Roll with advantage")
			.setIcon("arrow-up")
			.onClick(() => {
				this.rollAndRecord(this.applyAdvantageNotation(formula, "advantage", 2), { mode: "advantage", attempts: 2 });
			}));
		menu.addItem((item) => item
			.setTitle("Roll with disadvantage")
			.setIcon("arrow-down")
			.onClick(() => {
				this.rollAndRecord(this.applyAdvantageNotation(formula, "disadvantage", 2), { mode: "disadvantage", attempts: 2 });
			}));
		menu.showAtMouseEvent(evt);
	}

	private rollFormula(rawFormula: string, options: RollOptions): RollResult | null {
		const mode = options.mode ?? "normal";
		const effectiveFormula = rawFormula;
		const parsedTerms = this.parseExpression(effectiveFormula, options.enforceOperatorSettings ?? false);

		if (!parsedTerms) {
			return null;
		}

		const chosenAttempt = this.rollExpression(parsedTerms, mode, Math.max(1, options.attempts ?? 1));

		return {
			type: "formula",
			formula: effectiveFormula.trim(),
			total: chosenAttempt.total,
			timestamp: Date.now(),
			breakdown: chosenAttempt.breakdown,
			resultLine: `${chosenAttempt.breakdown} = ${chosenAttempt.total}`,
			detail: this.formatResultDetail(effectiveFormula, mode, chosenAttempt.rollDetail),
			attempts: [chosenAttempt],
			mode,
		};
	}

	isValidFormula(formula: string): boolean {
		return this.parseExpression(formula, false) !== null || KEEP_DROP_SUFFIX_PATTERN.test(formula.trim());
	}

	applyAdvantageNotation(rawFormula: string, mode: Exclude<AdvantageMode, "normal">, attempts: number): string {
		const keepDrop = mode === "advantage" ? "kh" : "kl";
		const keepDropCount = Math.max(1, attempts - 1);

		return rawFormula.replace(/(\d*)d(\d+)(?:(kh|kl|dh|dl)(\d+))?/gi, (_match, count: string, sides: string) => {
			return `${count || "1"}d${sides}${keepDrop}${keepDropCount}`;
		});
	}

	private parseExpression(rawFormula: string, enforceOperatorSettings: boolean): ParsedTerm[] | null {
		const expression = rawFormula.replace(/\s+/g, "");

		if (!expression) {
			return null;
		}

		const hasLeadingOperator = /^[+-]/.test(expression);
		const normalizedExpression = hasLeadingOperator ? expression : `+${expression}`;
		const tokenPattern = /([+-])([^+-]+)/g;
		const terms: ParsedTerm[] = [];
		let lastIndex = 0;
		let match = tokenPattern.exec(normalizedExpression);

		while (match) {
			if (match.index !== lastIndex) {
				return null;
			}

			const operator = match[1] as Operator;
			const rawTerm = match[2] ?? "";

			if (enforceOperatorSettings && (hasLeadingOperator || terms.length > 0) && !this.settings.showOperatorButtons) {
				return null;
			}

			const parsedTerm = this.parseTerm(operator, rawTerm);
			if (!parsedTerm) {
				return null;
			}

			terms.push(parsedTerm);
			lastIndex = match.index + match[0].length;
			match = tokenPattern.exec(normalizedExpression);
		}

		return lastIndex === normalizedExpression.length && terms.length > 0 ? terms : null;
	}

	private parseTerm(operator: Operator, rawTerm: string): ParsedTerm | null {
		if (NUMBER_TERM_PATTERN.test(rawTerm)) {
			return {
				operator,
				constant: Number(rawTerm),
			};
		}

		const dice = this.parseDice(rawTerm);
		return dice ? { operator, dice } : null;
	}

	private parseDice(rawDice: string): ParsedDice | null {
		const match = DICE_TERM_PATTERN.exec(rawDice);

		if (!match) {
			return null;
		}

		const count = match[1] ? Number(match[1]) : 1;
		const sides = Number(match[2]);
		const keepDrop = match[3]?.toLowerCase() as ParsedDice["keepDrop"];
		const keepDropCount = match[4] ? Number(match[4]) : 0;

		if (count < 1 || count > 100 || sides < 1 || (keepDrop && keepDropCount < 1)) {
			return null;
		}

		return {
			count,
			sides,
			keepDrop,
			keepDropCount,
		};
	}

	private rollExpression(terms: ParsedTerm[], mode: AdvantageMode, attempts: number): RollAttempt {
		let total = 0;
		const breakdownParts: string[] = [];
		const rollDetails: string[] = [];

		for (const term of terms) {
			const rolledTerm = this.rollTerm(term, mode, attempts);
			total += term.operator === "-" ? -rolledTerm.total : rolledTerm.total;
			breakdownParts.push(this.formatBreakdownPart(term.operator, rolledTerm.breakdown, breakdownParts.length === 0));
			if (rolledTerm.rollDetail) {
				rollDetails.push(rolledTerm.rollDetail);
			}
		}

		return {
			total,
			breakdown: breakdownParts.join(" "),
			rollDetail: rollDetails.join("; "),
		};
	}

	private rollTerm(term: ParsedTerm, mode: AdvantageMode, attempts: number): RollAttempt {
		if (term.constant !== undefined) {
			return {
				total: term.constant,
				breakdown: String(term.constant),
				rollDetail: "",
			};
		}

		if (!term.dice) {
			return {
				total: 0,
				breakdown: "0",
				rollDetail: "",
			};
		}

		const dice = term.dice;

		if (this.shouldRollStackedGroups(dice, mode, attempts)) {
			return this.rollStackedDiceTerm(dice, mode as Exclude<AdvantageMode, "normal">, attempts);
		}

		const rolls = Array.from({ length: dice.count }, () => Math.floor(Math.random() * dice.sides) + 1);
		const keptRolls = this.getKeptRolls(rolls, dice);

		return {
			total: keptRolls.reduce((sum, roll) => sum + roll, 0),
			breakdown: keptRolls.join(" + "),
			rollDetail: this.formatDiceRollDetail(rolls, dice),
		};
	}

	private shouldRollStackedGroups(dice: ParsedDice, mode: AdvantageMode, _attempts: number): boolean {
		return (mode === "advantage" && dice.keepDrop === "kh")
			|| (mode === "disadvantage" && dice.keepDrop === "kl");
	}

	private rollStackedDiceTerm(dice: ParsedDice, mode: Exclude<AdvantageMode, "normal">, attempts: number): RollAttempt {
		const keepDrop = mode === "advantage" ? "kh" : "kl";
		const groupCount = Math.max(2, attempts);
		const groups = Array.from({ length: groupCount }, () => {
			const rolls = Array.from({ length: dice.count }, () => Math.floor(Math.random() * dice.sides) + 1);
			return {
				rolls,
				total: rolls.reduce((sum, roll) => sum + roll, 0),
				breakdown: rolls.join(" + "),
			};
		});
		const selectedGroup = mode === "advantage"
			? groups.reduce((best, group) => group.total > best.total ? group : best)
			: groups.reduce((worst, group) => group.total < worst.total ? group : worst);

		return {
			total: selectedGroup.total,
			breakdown: selectedGroup.breakdown,
			rollDetail: `${keepDrop}${Math.max(1, attempts - 1)}: ${groups.map((group) => `[${group.rolls.join(", ")}]`).join(", ")}`,
		};
	}

	private formatDiceRollDetail(rolls: number[], dice: ParsedDice): string {
		if (!dice.keepDrop) {
			return "";
		}

		return `${dice.keepDrop}${dice.keepDropCount}: ${rolls.join(", ")}`;
	}

	private getKeptRolls(rolls: number[], parsed: ParsedDice): number[] {
		if (!parsed.keepDrop) {
			return rolls;
		}

		const sorted = [...rolls].sort((a, b) => a - b);

		switch (parsed.keepDrop) {
			case "kh":
				return sorted.slice(-parsed.keepDropCount);
			case "kl":
				return sorted.slice(0, parsed.keepDropCount);
			case "dh":
				return sorted.slice(0, rolls.length - parsed.keepDropCount);
			case "dl":
				return sorted.slice(parsed.keepDropCount);
		}
	}

	private formatBreakdownPart(operator: Operator, breakdown: string, isFirst: boolean): string {
		if (isFirst) {
			return operator === "-" ? `- ${breakdown}` : breakdown;
		}

		return `${operator} ${breakdown}`;
	}

	private formatResultDetail(rawFormula: string, mode: AdvantageMode, rollDetail: string): string {
		const detailSuffix = rollDetail ? ` (${rollDetail})` : "";

		if (mode === "normal") {
			return `${rawFormula.trim()}${detailSuffix}`;
		}

		const modeLabel = mode === "advantage" ? "Advantage" : "Disadvantage";
		return `${rawFormula.trim()} | ${modeLabel}${detailSuffix}`;
	}

	private rollNarrativeDie(die: CustomNarrativeDie): RollResult | null {
		const outcomes = die.outcomes
			.map((outcome) => ({
				label: outcome.label.trim(),
				weight: Number(outcome.weight),
			}))
			.filter((outcome) => outcome.label);

		if (outcomes.length === 0) {
			return null;
		}

		const hasWeightedOutcomes = outcomes.some((outcome) => Number.isFinite(outcome.weight) && outcome.weight > 0);
		const weightedOutcomes = outcomes.map((outcome) => ({
			label: outcome.label,
			weight: hasWeightedOutcomes && Number.isFinite(outcome.weight) && outcome.weight > 0 ? outcome.weight : 1,
		}));
		const totalWeight = weightedOutcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
		let threshold = Math.random() * totalWeight;
		const selectedOutcome = weightedOutcomes.find((outcome) => {
			threshold -= outcome.weight;
			return threshold <= 0;
		}) ?? weightedOutcomes[weightedOutcomes.length - 1];

		if (!selectedOutcome) {
			return null;
		}

		const label = die.label.trim() || "Narrative die";
		const oddsDetail = hasWeightedOutcomes ? ` (${selectedOutcome.weight}/${totalWeight} ${selectedOutcome.label})` : "";

		return {
			type: "narrative",
			formula: label,
			total: null,
			timestamp: Date.now(),
			breakdown: selectedOutcome.label,
			resultLine: selectedOutcome.label,
			detail: `${label}${oddsDetail}`,
			attempts: [],
			mode: "normal",
		};
	}

	private createRollNoticeFragment(result: RollResult): DocumentFragment {
		const fragment = document.createDocumentFragment();
		fragment.createDiv({
			text: result.resultLine,
			cls: "ttrpg-detect-roll-notice-total",
		});
		fragment.createDiv({
			text: result.detail,
			cls: "ttrpg-detect-roll-notice-detail",
		});
		return fragment;
	}

	private showNotice(message: string | DocumentFragment, isError: boolean): void {
		const notice = new Notice(message, isError ? 5000 : 7000);
		notice.containerEl.addClass("ttrpg-detect-roll-notice");
		this.addToastPlacementClass(notice.containerEl, this.settings.toastPlacement);

		if (isError) {
			notice.containerEl.addClass("ttrpg-detect-roll-notice-error");
		}
	}

	private addToastPlacementClass(noticeEl: HTMLElement, placement: ToastPlacement): void {
		if (placement !== "default") {
			noticeEl.addClass(`ttrpg-detect-roll-notice-${placement}`);
		}
	}

	private pruneHistory(): void {
		this.history = this.history.slice(-this.settings.historyLimit);
	}

	private refreshRollHistoryViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_ROLL_HISTORY)) {
			const view = leaf.view;

			if (view instanceof RollHistoryView) {
				view.render();
			}
		}
	}

	private applyStyleVariables(): void {
		const theme = this.getCurrentTheme();
		const formulaColors = this.settings.formulaColors[theme];
		const toastColors = this.settings.toastColors[theme];
		const clearHistoryButtonColors = this.settings.clearHistoryButtonColors[theme];

		this.setStyleVariable("--ttrpg-detect-roll-formula-text", formulaColors.text);
		this.setStyleVariable("--ttrpg-detect-roll-formula-background", formulaColors.background);
		this.setStyleVariable("--ttrpg-detect-roll-formula-border", formulaColors.border);
		this.setStyleVariable("--ttrpg-detect-roll-toast-text", toastColors.text);
		this.setStyleVariable("--ttrpg-detect-roll-toast-background", toastColors.background);
		this.setStyleVariable("--ttrpg-detect-roll-clear-text", clearHistoryButtonColors.text);
		this.setStyleVariable("--ttrpg-detect-roll-clear-background", clearHistoryButtonColors.background);
		this.setStyleVariable("--ttrpg-detect-roll-clear-border", clearHistoryButtonColors.border);
	}

	private clearStyleVariables(): void {
		for (const name of [
			"--ttrpg-detect-roll-formula-text",
			"--ttrpg-detect-roll-formula-background",
			"--ttrpg-detect-roll-formula-border",
			"--ttrpg-detect-roll-toast-text",
			"--ttrpg-detect-roll-toast-background",
			"--ttrpg-detect-roll-clear-text",
			"--ttrpg-detect-roll-clear-background",
			"--ttrpg-detect-roll-clear-border",
		]) {
			document.body.style.removeProperty(name);
		}
	}

	private setStyleVariable(name: string, value: string): void {
		if (value.trim()) {
			document.body.style.setProperty(name, value.trim());
			return;
		}

		document.body.style.removeProperty(name);
	}

	private getCurrentTheme(): ThemeMode {
		return document.body.classList.contains("theme-dark") ? "dark" : "light";
	}

	private watchThemeChanges(): void {
		this.themeObserver = new MutationObserver(() => {
			this.applyStyleVariables();
		});
		this.themeObserver.observe(document.body, {
			attributeFilter: ["class"],
			attributes: true,
		});
		this.register(() => this.themeObserver?.disconnect());
	}
}

class RollHistoryView extends ItemView {
	private plugin: TtrpgDetectRollPlugin;
	private inputEl: HTMLInputElement | null = null;
	private selectedOperator: Operator = "+";
	private advantageMode: AdvantageMode = "normal";
	private advantageStacks = 0;

	constructor(leaf: WorkspaceLeaf, plugin: TtrpgDetectRollPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_ROLL_HISTORY;
	}

	getDisplayText(): string {
		return "Roll history";
	}

	getIcon(): string {
		return "dice";
	}

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const previousHistoryEl = this.contentEl.querySelector(".ttrpg-detect-roll-history");
		const previousScrollTop = previousHistoryEl?.scrollTop ?? 0;
		const wasNearBottom = previousHistoryEl
			? previousHistoryEl.scrollHeight - previousHistoryEl.scrollTop - previousHistoryEl.clientHeight < 24
			: true;
		const previousInputValue = this.inputEl?.value ?? "";

		this.contentEl.empty();
		this.contentEl.addClass("ttrpg-detect-roll-view");

		const historyEl = this.contentEl.createDiv({ cls: "ttrpg-detect-roll-history" });
		this.renderHistory(historyEl);
		this.renderControls(previousInputValue);

		requestAnimationFrame(() => {
			if (wasNearBottom) {
				historyEl.scrollTop = historyEl.scrollHeight;
				return;
			}

			historyEl.scrollTop = previousScrollTop;
		});
	}

	private renderHistory(historyEl: HTMLElement): void {
		if (this.plugin.history.length === 0) {
			historyEl.createDiv({ text: "No rolls yet.", cls: "ttrpg-detect-roll-empty" });
			return;
		}

		for (const result of this.plugin.history) {
			const entryEl = historyEl.createDiv({ cls: "ttrpg-detect-roll-entry" });
			const headerEl = entryEl.createDiv({ cls: "ttrpg-detect-roll-entry-header" });
			headerEl.createSpan({ text: result.resultLine, cls: "ttrpg-detect-roll-entry-total" });
			headerEl.createSpan({
				text: new Date(result.timestamp).toLocaleTimeString(),
				cls: "ttrpg-detect-roll-entry-time",
			});
			entryEl.createDiv({ text: result.detail, cls: "ttrpg-detect-roll-entry-detail" });
		}
	}

	private renderControls(inputValue: string): void {
		this.normalizeSelectedOperator();
		const controlsEl = this.contentEl.createDiv({ cls: "ttrpg-detect-roll-controls" });
		const quickDiceEl = controlsEl.createDiv({ cls: "ttrpg-detect-roll-quick-dice" });

		for (const dice of BUILT_IN_DICE_BUTTONS.filter((item) => this.plugin.settings.enabledDiceButtons[item])) {
			const buttonEl = quickDiceEl.createEl("button", { text: dice, cls: "clickable-icon" });
			buttonEl.setAttr("type", "button");
			buttonEl.addEventListener("click", () => {
				this.appendDiceTerm(dice);
			});
			buttonEl.addEventListener("contextmenu", (evt: MouseEvent) => {
				evt.preventDefault();
				this.decrementDiceTerm(dice);
			});
		}

		for (const die of this.plugin.settings.customFormulaDice) {
			const label = die.label.trim();

			if (!label) {
				continue;
			}

			const buttonEl = quickDiceEl.createEl("button", { text: label, cls: "clickable-icon" });
			buttonEl.setAttr("type", "button");
			buttonEl.addEventListener("click", () => {
				this.appendCustomFormulaDie(die.formula);
			});
		}

		for (const die of this.plugin.settings.customNarrativeDice) {
			const label = die.label.trim();

			if (!label) {
				continue;
			}

			const buttonEl = quickDiceEl.createEl("button", { text: label, cls: "clickable-icon" });
			buttonEl.setAttr("type", "button");
			buttonEl.addEventListener("click", () => {
				this.plugin.rollNarrativeAndRecord(die);
			});
		}

		if (this.plugin.settings.showOperatorButtons) {
			this.renderRollModeButtons(controlsEl);
		} else if (this.plugin.settings.showAdvantageButtons) {
			this.renderRollModeButtons(controlsEl);
		}

		const inputRowEl = controlsEl.createDiv({ cls: "ttrpg-detect-roll-input-row" });
		this.inputEl = inputRowEl.createEl("input", {
			attr: {
				placeholder: "1d20 + 4",
				type: "text",
			},
		});
		this.inputEl.value = inputValue;

		const rollButtonEl = inputRowEl.createEl("button", { text: "Roll" });
		rollButtonEl.setAttr("type", "button");

		const submitRoll = () => {
			const formula = this.inputEl?.value.trim() ?? "";

			if (!formula) {
				return;
			}

			if (this.plugin.rollAndRecord(formula, {
				mode: this.advantageMode,
				attempts: this.advantageStacks + 1,
				enforceOperatorSettings: true,
			})) {
				this.resetManualInputState();
				this.render();
			}
		};

		rollButtonEl.addEventListener("click", submitRoll);
		this.inputEl.addEventListener("keydown", (evt: KeyboardEvent) => {
			if (evt.key === "Enter") {
				submitRoll();
			}
		});
	}

	private renderRollModeButtons(controlsEl: HTMLElement): void {
		const modesEl = controlsEl.createDiv({ cls: "ttrpg-detect-roll-modes" });

		if (this.plugin.settings.showOperatorButtons) {
			modesEl.appendChild(this.createOperatorButton("+"));
			modesEl.appendChild(this.createOperatorButton("-"));
		}

		if (this.plugin.settings.showAdvantageButtons) {
			modesEl.appendChild(this.createAdvantageButton("advantage", "Advantage"));
			modesEl.appendChild(this.createAdvantageButton("disadvantage", "Disadvantage"));
		}

		if (this.plugin.settings.showClearHistoryButton) {
			const clearEl = controlsEl.createDiv({ cls: "ttrpg-detect-roll-clear-row" });
			clearEl.appendChild(this.createClearHistoryButton());
		}
	}

	private createOperatorButton(operator: Operator): HTMLButtonElement {
		const buttonEl = document.createElement("button");
		buttonEl.setText(operator);
		buttonEl.setAttr("type", "button");

		if (this.selectedOperator === operator) {
			buttonEl.addClass("ttrpg-detect-roll-active-mode");
		}

		buttonEl.addEventListener("click", () => {
			this.selectedOperator = operator;
			this.render();
			this.inputEl?.focus();
		});

		return buttonEl;
	}

	private createClearHistoryButton(): HTMLButtonElement {
		const buttonEl = document.createElement("button");
		buttonEl.setAttr("type", "button");
		buttonEl.setAttr("aria-label", "Clear roll history");
		buttonEl.setAttr("title", "Clear roll history");
		buttonEl.createSpan({ text: "Clear logs history" });
		setIcon(buttonEl, "trash-2");
		buttonEl.addClass("ttrpg-detect-roll-clear-button");
		buttonEl.addEventListener("click", () => {
			this.plugin.clearHistory();
		});
		return buttonEl;
	}

	private createAdvantageButton(mode: Exclude<AdvantageMode, "normal">, label: string): HTMLButtonElement {
		const buttonEl = document.createElement("button");
		const stackLabel = this.advantageMode === mode && this.advantageStacks > 0 ? ` x${this.advantageStacks}` : "";
		buttonEl.setText(`${label}${stackLabel}`);
		buttonEl.setAttr("type", "button");

		if (this.advantageMode === mode) {
			buttonEl.addClass("ttrpg-detect-roll-active-mode");
		}

		buttonEl.addEventListener("click", () => {
			if (!this.inputHasDice()) {
				return;
			}

			if (this.advantageMode !== mode) {
				this.advantageMode = mode;
				this.advantageStacks = 1;
			} else if (this.plugin.settings.allowAdvantageStacking) {
				this.advantageStacks += 1;
			} else {
				this.advantageStacks = 1;
			}

			this.applyAdvantageToInput(mode);
			this.render();
			this.inputEl?.focus();
		});
		buttonEl.addEventListener("contextmenu", (evt: MouseEvent) => {
			evt.preventDefault();

			if (this.advantageMode !== mode || !this.inputHasDice()) {
				return;
			}

			this.advantageStacks = Math.max(0, this.advantageStacks - 1);
			this.updateAdvantageInput(mode);

			if (this.advantageStacks === 0) {
				this.advantageMode = "normal";
			}

			this.render();
			this.inputEl?.focus();
		});

		return buttonEl;
	}

	private inputHasDice(): boolean {
		return /\d*d\d+/i.test(this.inputEl?.value ?? "");
	}

	private applyAdvantageToInput(mode: Exclude<AdvantageMode, "normal">): void {
		if (!this.inputEl) {
			return;
		}

		this.inputEl.value = this.plugin.applyAdvantageNotation(this.inputEl.value, mode, this.advantageStacks + 1);
	}

	private updateAdvantageInput(mode: Exclude<AdvantageMode, "normal">): void {
		if (!this.inputEl) {
			return;
		}

		const keepDrop = mode === "advantage" ? "kh" : "kl";
		this.inputEl.value = this.inputEl.value.replace(
			new RegExp(`((?:\\d*)d\\d+)${keepDrop}\\d+`, "gi"),
			(_match, dice: string) => this.advantageStacks > 0 ? `${dice}${keepDrop}${this.advantageStacks}` : dice,
		);
	}

	private appendCustomFormulaDie(formula: string): void {
		if (!this.inputEl) {
			return;
		}

		const trimmedFormula = formula.trim();

		if (!this.plugin.isValidFormula(trimmedFormula)) {
			new Notice(`Invalid dice formula: ${formula}`, 5000);
			return;
		}

		if (KEEP_DROP_SUFFIX_PATTERN.test(trimmedFormula)) {
			const suffixedValue = this.appendKeepDropSuffix(this.inputEl.value.trim(), trimmedFormula);

			if (!suffixedValue) {
				new Notice(`Add a dice formula before ${trimmedFormula}`, 5000);
				return;
			}

			this.inputEl.value = suffixedValue;
			this.inputEl.focus();
			return;
		}

		this.inputEl.value = this.appendFormulaToInput(this.inputEl.value.trim(), trimmedFormula);
		this.inputEl.focus();
	}

	private appendKeepDropSuffix(value: string, suffix: string): string | null {
		const match = /(\d*d\d+)(?:(kh|kl|dh|dl)\d+)?$/i.exec(value);

		if (!match) {
			return null;
		}

		return `${value.slice(0, match.index)}${match[1]}${suffix}`;
	}

	private appendDiceTerm(dice: string): void {
		if (!this.inputEl) {
			return;
		}

		const value = this.inputEl.value.trim();
		const incrementedValue = this.incrementLastDiceTerm(value, dice);
		this.inputEl.value = incrementedValue ?? this.appendNewDiceTerm(value, dice);
		this.inputEl.focus();
	}

	private decrementDiceTerm(dice: string): void {
		if (!this.inputEl) {
			return;
		}

		const value = this.inputEl.value.trim();
		this.inputEl.value = this.decrementLastDiceTerm(value, dice) ?? this.appendSubtractedDiceTerm(value, dice);
		this.inputEl.focus();
	}

	private incrementLastDiceTerm(value: string, dice: string): string | null {
		const escapedDice = dice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const lastTermPattern = new RegExp(`(^|\\s[+-]\\s)(\\d*)${escapedDice}$`, "i");
		const match = lastTermPattern.exec(value);

		if (!match || !match[0].toLowerCase().endsWith(dice.toLowerCase())) {
			return null;
		}

		const prefix = match[1] ?? "";
		const count = match[2] ? Number(match[2]) : 1;
		const replacement = `${prefix}${count + 1}${dice}`;
		return `${value.slice(0, match.index)}${replacement}`;
	}

	private decrementLastDiceTerm(value: string, dice: string): string | null {
		const escapedDice = dice.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const lastTermPattern = new RegExp(`(^|\\s[+-]\\s)(\\d*)${escapedDice}$`, "i");
		const match = lastTermPattern.exec(value);

		if (!match || !match[0].toLowerCase().endsWith(dice.toLowerCase())) {
			return null;
		}

		const prefix = match[1] ?? "";
		const count = match[2] ? Number(match[2]) : 1;

		if (count > 1) {
			return `${value.slice(0, match.index)}${prefix}${count - 1}${dice}`;
		}

		return value.slice(0, match.index).trimEnd();
	}

	private appendNewDiceTerm(value: string, dice: string): string {
		const term = `1${dice}`;

		if (!value) {
			return term;
		}

		return `${value} ${this.selectedOperator} ${term}`;
	}

	private appendFormulaToInput(value: string, formula: string): string {
		if (!value) {
			return formula;
		}

		return `${value} ${this.selectedOperator} ${formula}`;
	}

	private appendSubtractedDiceTerm(value: string, dice: string): string {
		const term = `1${dice}`;

		if (!value) {
			return `-${term}`;
		}

		return `${value} - ${term}`;
	}

	private resetManualInputState(): void {
		if (this.inputEl) {
			this.inputEl.value = "";
		}

		this.advantageMode = "normal";
		this.advantageStacks = 0;
	}

	private normalizeSelectedOperator(): void {
		if (!this.plugin.settings.showOperatorButtons) {
			this.selectedOperator = "+";
		}
	}
}
