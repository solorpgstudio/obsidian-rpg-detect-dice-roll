import { App, PluginSettingTab, Setting } from "obsidian";
import type RpgDetectDiceRoll from "./main";

export type FormulaStyle = "inline" | "button";
export type ThemeMode = "light" | "dark";
export type ToastPlacement = "default" | "bottom-right" | "bottom-left" | "top-right" | "top-left";
export const BUILT_IN_DICE_BUTTONS = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;
export type BuiltInDiceButton = typeof BUILT_IN_DICE_BUTTONS[number];

export interface FormulaColorSettings {
	text: string;
	background: string;
	border: string;
}

export interface ToastColorSettings {
	text: string;
	background: string;
}

export interface CustomFormulaDie {
	id: string;
	label: string;
	formula: string;
}

export interface NarrativeOutcome {
	id: string;
	label: string;
	weight: string;
}

export interface CustomNarrativeDie {
	id: string;
	label: string;
	outcomes: NarrativeOutcome[];
}

export interface RpgDetectDiceRollSettings {
	formulaStyle: FormulaStyle;
	formulaColors: Record<ThemeMode, FormulaColorSettings>;
	toastColors: Record<ThemeMode, ToastColorSettings>;
	enabledDiceButtons: Record<BuiltInDiceButton, boolean>;
	customFormulaDice: CustomFormulaDie[];
	customNarrativeDice: CustomNarrativeDie[];
	showRollToasts: boolean;
	toastPlacement: ToastPlacement;
	historyLimit: number;
	showAdvantageButtons: boolean;
	allowAdvantageStacking: boolean;
	showOperatorButtons: boolean;
}

export const DEFAULT_SETTINGS: RpgDetectDiceRollSettings = {
	formulaStyle: "inline",
	formulaColors: {
		light: {
			text: "",
			background: "",
			border: "",
		},
		dark: {
			text: "",
			background: "",
			border: "",
		},
	},
	toastColors: {
		light: {
			text: "",
			background: "",
		},
		dark: {
			text: "",
			background: "",
		},
	},
	enabledDiceButtons: {
		d4: true,
		d6: true,
		d8: true,
		d10: true,
		d12: true,
		d20: true,
		d100: true,
	},
	customFormulaDice: [],
	customNarrativeDice: [],
	showRollToasts: true,
	toastPlacement: "default",
	historyLimit: 20,
	showAdvantageButtons: true,
	allowAdvantageStacking: false,
	showOperatorButtons: true,
};

export class TtrpgDetectRollSettingTab extends PluginSettingTab {
	plugin: RpgDetectDiceRoll;

	constructor(app: App, plugin: RpgDetectDiceRoll) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Formula display")
			.setDesc("Choose how detected dice formulas look in reading view.")
			.addDropdown((dropdown) => dropdown
				.addOption("inline", "Inline")
				.addOption("button", "Button")
				.setValue(this.plugin.settings.formulaStyle)
				.onChange(async (value) => {
					this.plugin.settings.formulaStyle = value as FormulaStyle;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("History limit")
			.setDesc("Maximum number of roll results kept in the roll history panel.")
			.addSlider((slider) => slider
				.setLimits(1, 100, 1)
				.setValue(this.plugin.settings.historyLimit)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.historyLimit = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName("Show roll notices")
			.setDesc("Show a toast notice when a roll completes.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showRollToasts)
				.onChange(async (value) => {
					this.plugin.settings.showRollToasts = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.showRollToasts) {
			new Setting(containerEl)
				.setName("Toast placement")
				.setDesc("Choose where plugin roll notices appear.")
				.addDropdown((dropdown) => dropdown
					.addOption("default", "Default")
					.addOption("bottom-right", "Bottom right")
					.addOption("bottom-left", "Bottom left")
					.addOption("top-right", "Top right")
					.addOption("top-left", "Top left")
					.setValue(this.plugin.settings.toastPlacement)
					.onChange(async (value) => {
						this.plugin.settings.toastPlacement = value as ToastPlacement;
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl).setName("Manual roll controls").setHeading();

		new Setting(containerEl)
			.setName("Show advantage buttons")
			.setDesc("Show advantage and disadvantage buttons in the roll history panel.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showAdvantageButtons)
				.onChange(async (value) => {
					this.plugin.settings.showAdvantageButtons = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		if (this.plugin.settings.showAdvantageButtons) {
			new Setting(containerEl)
				.setName("Allow advantage stacking")
				.setDesc("Repeated advantage or disadvantage clicks increase the number of attempts.")
				.addToggle((toggle) => toggle
					.setValue(this.plugin.settings.allowAdvantageStacking)
					.onChange(async (value) => {
						this.plugin.settings.allowAdvantageStacking = value;
						await this.plugin.saveSettings();
					}));
		}

		new Setting(containerEl)
			.setName("Show operator buttons")
			.setDesc("Show plus and minus buttons for composing manual formulas.")
			.addToggle((toggle) => toggle
				.setValue(this.plugin.settings.showOperatorButtons)
				.onChange(async (value) => {
					this.plugin.settings.showOperatorButtons = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl).setName("Dice buttons").setHeading();

		for (const dice of BUILT_IN_DICE_BUTTONS) {
			new Setting(containerEl)
				.setName(dice)
				.setDesc(`Show the ${dice} button in the roll history panel.`)
				.addToggle((toggle) => toggle
					.setValue(this.plugin.settings.enabledDiceButtons[dice])
					.onChange(async (value) => {
						this.plugin.settings.enabledDiceButtons[dice] = value;
						await this.plugin.saveSettings();
					}));
		}

		this.addCustomDiceSettings(containerEl);

		new Setting(containerEl).setName("UI and color settings").setHeading();
		this.addFormulaColorSettings("light");
		this.addFormulaColorSettings("dark");
		this.addToastColorSettings("light");
		this.addToastColorSettings("dark");
	}

	private addCustomDiceSettings(containerEl: HTMLElement): void {
		new Setting(containerEl).setName("Custom dice").setHeading();

		new Setting(containerEl)
			.setName("Formula dice")
			.setDesc("Create buttons that append custom formulas to the manual input.")
			.addButton((button) => button
				.setButtonText("Add formula die")
				.onClick(async () => {
					this.plugin.settings.customFormulaDice.push({
						id: this.createId(),
						label: "d3",
						formula: "1d3",
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		for (const die of this.plugin.settings.customFormulaDice) {
			new Setting(containerEl)
				.setName("Formula die")
				.addText((text) => text
					.setPlaceholder("Label")
					.setValue(die.label)
					.onChange(async (value) => {
						die.label = value;
						await this.plugin.saveSettings();
					}))
				.addText((text) => text
					.setPlaceholder("Formula")
					.setValue(die.formula)
					.onChange(async (value) => {
						die.formula = value;
						await this.plugin.saveSettings();
					}))
				.addExtraButton((button) => button
					.setIcon("trash-2")
					.setTooltip("Delete formula die")
					.onClick(async () => {
						this.plugin.settings.customFormulaDice = this.plugin.settings.customFormulaDice.filter((item) => item.id !== die.id);
						await this.plugin.saveSettings();
						this.display();
					}));
		}

		new Setting(containerEl)
			.setName("Narrative dice")
			.setDesc("Create buttons that immediately choose one text outcome. Odds are optional relative weights; blanks and invalid values use equal odds.")
			.addButton((button) => button
				.setButtonText("Add narrative die")
				.onClick(async () => {
					this.plugin.settings.customNarrativeDice.push({
						id: this.createId(),
						label: "weather",
						outcomes: [
							{ id: this.createId(), label: "clear sky", weight: "" },
							{ id: this.createId(), label: "rain", weight: "" },
						],
					});
					await this.plugin.saveSettings();
					this.display();
				}));

		for (const die of this.plugin.settings.customNarrativeDice) {
			new Setting(containerEl)
				.setName("Narrative die")
				.addText((text) => text
					.setPlaceholder("Label")
					.setValue(die.label)
					.onChange(async (value) => {
						die.label = value;
						await this.plugin.saveSettings();
					}))
				.addButton((button) => button
					.setButtonText("Add outcome")
					.onClick(async () => {
						die.outcomes.push({
							id: this.createId(),
							label: "outcome",
							weight: "",
						});
						await this.plugin.saveSettings();
						this.display();
					}))
				.addExtraButton((button) => button
					.setIcon("trash-2")
					.setTooltip("Delete narrative die")
					.onClick(async () => {
						this.plugin.settings.customNarrativeDice = this.plugin.settings.customNarrativeDice.filter((item) => item.id !== die.id);
						await this.plugin.saveSettings();
						this.display();
					}));

			for (const outcome of die.outcomes) {
				new Setting(containerEl)
					.setName("Outcome")
					.addText((text) => text
						.setPlaceholder("Label")
						.setValue(outcome.label)
						.onChange(async (value) => {
							outcome.label = value;
							await this.plugin.saveSettings();
						}))
					.addText((text) => text
						.setPlaceholder("Odds: 40% or 1/5")
						.setValue(outcome.weight)
						.onChange(async (value) => {
							outcome.weight = value;
							await this.plugin.saveSettings();
						}))
					.addExtraButton((button) => button
						.setIcon("trash-2")
						.setTooltip("Delete outcome")
						.onClick(async () => {
							die.outcomes = die.outcomes.filter((item) => item.id !== outcome.id);
							await this.plugin.saveSettings();
							this.display();
						}));
			}
		}
	}

	private addFormulaColorSettings(theme: ThemeMode): void {
		const label = this.formatThemeLabel(theme);

		const containerEl = this.getColorSettingsContainerEl();

		new Setting(containerEl).setName(`${label} formula colors`).setHeading();

		new Setting(containerEl)
			.setName("Text")
			.setDesc("Leave blank to use the active Obsidian external link color.")
			.addText((text) => text
				.setPlaceholder("Theme default")
				.setValue(this.plugin.settings.formulaColors[theme].text)
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].text = value;
					await this.plugin.saveSettings();
				}))
			.addColorPicker((color) => color
				.setValue(this.getPickerValue(this.plugin.settings.formulaColors[theme].text))
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].text = value;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addExtraButton((button) => button
				.setIcon("refresh-cw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.formulaColors[theme].text = DEFAULT_SETTINGS.formulaColors[theme].text;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName("Background")
			.setDesc("Leave blank for transparent formula background.")
			.addText((text) => text
				.setPlaceholder("Theme default")
				.setValue(this.plugin.settings.formulaColors[theme].background)
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].background = value;
					await this.plugin.saveSettings();
				}))
			.addColorPicker((color) => color
				.setValue(this.getPickerValue(this.plugin.settings.formulaColors[theme].background))
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].background = value;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addExtraButton((button) => button
				.setIcon("refresh-cw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.formulaColors[theme].background = DEFAULT_SETTINGS.formulaColors[theme].background;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName("Border")
			.setDesc("Leave blank to use the active Obsidian theme accent color.")
			.addText((text) => text
				.setPlaceholder("Theme default")
				.setValue(this.plugin.settings.formulaColors[theme].border)
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].border = value;
					await this.plugin.saveSettings();
				}))
			.addColorPicker((color) => color
				.setValue(this.getPickerValue(this.plugin.settings.formulaColors[theme].border))
				.onChange(async (value) => {
					this.plugin.settings.formulaColors[theme].border = value;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addExtraButton((button) => button
				.setIcon("refresh-cw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.formulaColors[theme].border = DEFAULT_SETTINGS.formulaColors[theme].border;
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private addToastColorSettings(theme: ThemeMode): void {
		const label = this.formatThemeLabel(theme);

		const containerEl = this.getColorSettingsContainerEl();

		new Setting(containerEl).setName(`${label} toast colors`).setHeading();

		new Setting(containerEl)
			.setName("Text")
			.setDesc("Leave blank to use the active Obsidian theme text color.")
			.addText((text) => text
				.setPlaceholder("Theme default")
				.setValue(this.plugin.settings.toastColors[theme].text)
				.onChange(async (value) => {
					this.plugin.settings.toastColors[theme].text = value;
					await this.plugin.saveSettings();
				}))
			.addColorPicker((color) => color
				.setValue(this.getPickerValue(this.plugin.settings.toastColors[theme].text))
				.onChange(async (value) => {
					this.plugin.settings.toastColors[theme].text = value;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addExtraButton((button) => button
				.setIcon("refresh-cw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.toastColors[theme].text = DEFAULT_SETTINGS.toastColors[theme].text;
					await this.plugin.saveSettings();
					this.display();
				}));

		new Setting(containerEl)
			.setName("Background")
			.setDesc("Leave blank to use the active Obsidian theme background color.")
			.addText((text) => text
				.setPlaceholder("Theme default")
				.setValue(this.plugin.settings.toastColors[theme].background)
				.onChange(async (value) => {
					this.plugin.settings.toastColors[theme].background = value;
					await this.plugin.saveSettings();
				}))
			.addColorPicker((color) => color
				.setValue(this.getPickerValue(this.plugin.settings.toastColors[theme].background))
				.onChange(async (value) => {
					this.plugin.settings.toastColors[theme].background = value;
					await this.plugin.saveSettings();
					this.display();
				}))
			.addExtraButton((button) => button
				.setIcon("refresh-cw")
				.setTooltip("Reset to default")
				.onClick(async () => {
					this.plugin.settings.toastColors[theme].background = DEFAULT_SETTINGS.toastColors[theme].background;
					await this.plugin.saveSettings();
					this.display();
				}));
	}

	private getPickerValue(value: string): string {
		return value.trim().startsWith("#") ? value : "#000000";
	}

	private createId(): string {
		return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}

	private getColorSettingsContainerEl(): HTMLElement {
		return this.containerEl;
	}

	private formatThemeLabel(theme: ThemeMode): string {
		return theme === "light" ? "Light mode" : "Dark mode";
	}
}
