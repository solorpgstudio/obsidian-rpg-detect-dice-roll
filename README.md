# RPG Detect Dice Roll

RPG Detect Dice Roll is an Obsidian plugin for tabletop role-playing notes. It detects dice formulas in reading view, turns them into clickable roll controls, and keeps recent results in a roll history panel.

Use it for session notes, solo RPG journals, encounter prep, oracle tables, random events, and any note where you want `1d20 + 4` or `2d6` to roll directly from the page.

## Features

- Detects dice formulas in reading view and makes them clickable.
- Supports formulas such as `d20`, `1d20 + 4`, `2d6 - 1`, `4d6kh3`, `2d20kl1`, `4d6dl1`, and `4d6dh1`.
- Shows roll results in Obsidian notices with the total, formula, and roll details.
- Adds a roll history side panel with recent results and timestamps.
- Provides quick buttons for common dice: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, and `d100`.
- Supports advantage and disadvantage rolls.
- Lets you create custom formula dice buttons.
- Lets you create custom narrative dice that choose from text outcomes, with optional weighting.
- Includes display, color, toast placement, history, and control visibility settings.
- Works offline and stores settings locally in your vault.

## How to use

Write dice formulas naturally in your notes, then switch to reading view. Detected formulas are styled as interactive text or buttons, depending on your settings.

- Select a detected formula to roll it normally.
- Right-click a detected formula to roll normally, with advantage, or with disadvantage.
- Select the dice ribbon icon or run **Open roll history** from the command palette to open the roll history panel.
- Use the roll history panel to build manual formulas with quick dice buttons, operators, advantage controls, and custom dice.
- Press **Roll** or Enter in the manual input to roll the typed formula.

## Formula support

The plugin supports standard dice terms with optional modifiers:

```text
d20
1d20 + 4
2d6 - 1
4d6kh3
2d20kl1
4d6dl1
4d6dh1
```

Keep/drop suffixes mean:

- `kh`: keep highest
- `kl`: keep lowest
- `dh`: drop highest
- `dl`: drop lowest

For example, `4d6kh3` rolls four six-sided dice and keeps the highest three.

## Settings

Open **Settings → Community plugins → RPG Detect Dice Roll** to configure the plugin.

- **Formula display**: choose inline styling or button styling for detected formulas.
- **History limit**: choose how many recent rolls are kept in the roll history panel.
- **Toast placement**: choose where roll notices appear.
- **Manual roll controls**: show or hide advantage, operator, and clear-history controls.
- **Dice buttons**: choose which built-in dice buttons appear.
- **Custom dice**: add custom formula buttons or narrative dice.
- **UI and color settings**: customize formula, notice, and clear-history colors separately for light and dark themes.

## Custom dice

Custom formula dice add reusable buttons to the roll history panel. A formula die can be a full formula such as `1d3`, `2d6 + 1`, or a keep/drop suffix such as `kh1`.

Custom narrative dice choose from text outcomes instead of numeric totals. Each outcome can have an optional weight. If no valid weights are provided, each outcome has an equal chance.

## Manual installation

1. Download the latest release files.
2. Create this folder in your vault:

```text
<Vault>/.obsidian/plugins/rpg-detect-dice-roll/
```

3. Copy these files into that folder:

```text
main.js
manifest.json
styles.css
```

4. Reload Obsidian.
5. Enable the plugin in **Settings → Community plugins**.

## Development

This project uses TypeScript, npm, and esbuild.

Install dependencies:

```bash
npm install
```

Start a development build in watch mode:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

The Obsidian release artifact is `main.js`, generated at the plugin root.

## Create a release

Before creating a release, make sure the plugin builds successfully:

```bash
npm run build
```

Then prepare the release:

1. Update `manifest.json` to the new Semantic Versioning value, such as `1.0.0` for the initial release. Obsidian supports versions only in `x.y.z` format.
2. Update `versions.json` so the plugin version maps to the minimum supported Obsidian version.
3. Create a GitHub release.
4. Set the release tag to exactly match the version in `manifest.json`. Do not add a leading `v`.
5. Enter a release name and description.
6. Upload these release assets as binary attachments:

```text
main.js
manifest.json
styles.css
```

`styles.css` is optional for Obsidian releases, but this plugin uses it, so include it.

## Privacy

RPG Detect Dice Roll runs locally in Obsidian. It does not make network requests, collect analytics, or send vault contents to external services.

## Support

[![Buy me a coffee](https://img.buymeacoffee.com/button-api/?text=Buy%20me%20a%20coffee&emoji=☕&slug=solorpgstudio&button_colour=FFDD00&font_colour=000000&font_family=Lato&outline_colour=000000&coffee_colour=ffffff)](https://www.buymeacoffee.com/solorpgstudio)

## License

This project is licensed under the terms in [LICENSE](LICENSE).
