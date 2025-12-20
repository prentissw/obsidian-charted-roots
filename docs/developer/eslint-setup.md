# ESLint Configuration

## Current Setup

The project uses ESLint v8 with TypeScript ESLint for code linting.

### Configuration File
- [.eslintrc.json](../.eslintrc.json) - Standard TypeScript ESLint configuration

### Available Commands
- `npm run lint` - Check code for linting errors
- `npm run lint:fix` - Automatically fix linting errors where possible

## Obsidian ESLint Plugin Status

The `eslint-plugin-obsidianmd` package is installed but **not currently active** in the configuration.

### Why?
The Obsidian ESLint plugin is ESM-only and requires ESLint v9+ with flat config (`eslint.config.mjs`). However, our current `@typescript-eslint` packages (v6.x) only support ESLint v7-8.

### Future Upgrade Path

When upgrading in the future:

1. Upgrade TypeScript ESLint packages to v8.x:
   ```bash
   npm install --save-dev @typescript-eslint/eslint-plugin@^8.0.0 @typescript-eslint/parser@^8.0.0
   ```

2. Upgrade ESLint to v9:
   ```bash
   npm install --save-dev eslint@^9.0.0
   ```

3. Convert `.eslintrc.json` to `eslint.config.mjs` with flat config format:
   ```javascript
   import tsparser from "@typescript-eslint/parser";
   import obsidianmd from "eslint-plugin-obsidianmd";

   export default [
     ...obsidianmd.configs.recommended,
     {
       files: ["**/*.ts"],
       languageOptions: {
         parser: tsparser,
         parserOptions: { project: "./tsconfig.json" },
       },
     },
   ];
   ```

### Obsidian-Specific Best Practices (Manual)

Until the plugin is active, follow these Obsidian best practices manually:

1. **Never use `workspace.getActiveViewOfType(null)`** - Use `workspace.getActiveFile()` instead
2. **Use `app.fileManager.trashFile()` or `app.vault.trash()`** instead of `app.vault.delete()`
3. **Avoid direct DOM manipulation** - Use Obsidian's API methods
4. **Test in both desktop and mobile** if `isDesktopOnly: false` in manifest

## References
- [Obsidian ESLint Plugin](https://github.com/obsidianmd/eslint-plugin)
- [ESLint v9 Migration Guide](https://eslint.org/docs/latest/use/configure/migration-guide)
