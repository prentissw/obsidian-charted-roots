# Development Guide

## Project Setup

### Installation
```bash
npm install
```

### Build Commands

- `npm run dev` - Start development mode with watch (builds to local main.js)
- `npm run build` - Production build with type checking
- `npm run lint` - Check code for linting errors
- `npm run lint:fix` - Auto-fix linting errors

## Deployment to Obsidian Vault

### Quick Deploy
Deploy the built plugin to your Obsidian vault:

```bash
npm run deploy
```

This will:
1. Build the plugin (`npm run build`)
2. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin directory
3. You'll need to reload Obsidian to see changes (Ctrl+R or Cmd+R)

### Development with Auto-Deploy
For active development with automatic deployment on file changes:

```bash
npm run dev:deploy
```

**Note:** This requires `inotify-tools` to be installed:
```bash
sudo apt-get install inotify-tools
```

The script will:
- Watch for TypeScript file changes
- Automatically rebuild
- Auto-deploy to vault
- Show build status and timestamp

### Vault Path Configuration

The deployment scripts target:
```
/mnt/d/Vaults/Banister/.obsidian/plugins/canvas-roots
```

To change this, edit the `VAULT_PATH` variable in:
- [deploy.sh](../deploy.sh)
- [dev-deploy.sh](../dev-deploy.sh)

## Project Structure

```
canvas-roots/
├── main.ts                 # Plugin entry point
├── src/
│   ├── settings.ts         # Plugin settings
│   ├── models/             # Data models
│   │   ├── person.ts       # Person/family data structures
│   │   └── canvas.ts       # Canvas node/edge types
│   ├── canvas/             # Canvas manipulation (to be implemented)
│   ├── layout/             # D3 layout algorithms (to be implemented)
│   ├── utils/              # Utility functions (to be implemented)
│   └── gedcom/             # GEDCOM import/export (to be implemented)
├── docs/                   # Documentation
├── manifest.json           # Obsidian plugin metadata
├── package.json            # NPM configuration
├── tsconfig.json           # TypeScript configuration
├── esbuild.config.mjs      # Build configuration
├── .eslintrc.json          # ESLint configuration
└── styles.css              # Optional plugin styles
```

## Testing in Obsidian

1. Build and deploy the plugin: `npm run deploy`
2. Open Obsidian
3. Go to Settings → Community plugins
4. Enable "Canvas Roots"
5. The plugin commands will be available in the Command Palette (Ctrl/Cmd+P):
   - "Canvas Roots: Generate Tree for Current Note"
   - "Canvas Roots: Re-Layout Current Canvas"

### Reloading After Changes

After deploying changes, reload Obsidian:
- **Quick reload**: Press Ctrl+R (Windows/Linux) or Cmd+R (Mac)
- **Full reload**: Settings → Community plugins → Toggle plugin off/on

## Hot Reload (Advanced)

For instant plugin reloading without restarting Obsidian:

1. Install the [Hot Reload](https://github.com/pjeby/hot-reload) plugin
2. It will automatically detect changes to `main.js` in your vault's plugin directory
3. Use `npm run dev:deploy` to build and deploy on file changes
4. Hot Reload will automatically reload the plugin

## Debugging

### Console Logs
Open the Developer Console in Obsidian:
- Windows/Linux: Ctrl+Shift+I
- Mac: Cmd+Option+I

Look for:
- "Loading Canvas Roots plugin" when the plugin loads
- Any error messages or console logs

### TypeScript Errors
The build command includes type checking:
```bash
npm run build
```

This will show any TypeScript errors before building.

## Version Management

When ready to release a new version:

1. Update the version in `package.json`
2. Run the version bump script:
   ```bash
   npm version patch  # or minor, or major
   ```

This will automatically update `manifest.json` and `versions.json`.
