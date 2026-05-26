# Contributing

Thanks for helping improve RPG Detect Dice Roll.

## Getting started

Install dependencies:

```bash
npm install
```

Run a development build in watch mode:

```bash
npm run dev
```

Create a production build before opening a pull request:

```bash
npm run build
```

## Development workflow

- Keep changes focused and scoped to one bug fix or feature.
- Put feature logic in `src/` and keep plugin lifecycle code in `src/main.ts` easy to follow.
- Prefer small, browser-compatible code over new dependencies.
- Do not commit `node_modules/` or generated release artifacts unless a maintainer explicitly asks for them.
- Keep user-facing text short, clear, and sentence case.

## Testing

Before submitting a change:

1. Run `npm run build`.
2. Test the plugin manually in an Obsidian vault when the change affects UI or rolling behavior.
3. Check reading view, the roll history panel, and relevant settings.
4. Confirm the plugin still unloads/reloads cleanly.

## Privacy and security

This plugin should remain local-first and offline by default.

- Do not add telemetry, analytics, or network requests without a clear user-facing reason and explicit maintainer approval.
- Do not collect or transmit vault contents, filenames, or personal information.
- Do not execute remote code or fetch scripts dynamically.
- Use Obsidian registration helpers for events, DOM listeners, and intervals so cleanup works on unload.

## Pull requests

Please include:

- A short summary of the change.
- Manual test notes.
- Screenshots or short recordings for visible UI changes, when helpful.
- Any release-note text that should be included in the changelog.

## Releases

Maintainers prepare releases by:

1. Updating `manifest.json` with a Semantic Versioning value in `x.y.z` format.
2. Updating `versions.json` for the same plugin version.
3. Running `npm run build`.
4. Creating a GitHub release whose tag exactly matches `manifest.json`.
5. Uploading `main.js`, `manifest.json`, and `styles.css` as release assets.
