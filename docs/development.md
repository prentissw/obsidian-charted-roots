# Development Guide

This is the main index for Canvas Roots developer documentation. The documentation has been split into focused guides for easier navigation.

## Quick Start

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/canvas-roots/` directory and reload Obsidian.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Getting Started](developer/getting-started.md) | Installation, build commands, testing, debugging |
| [Project Structure](developer/project-structure.md) | Directory layout, component status tables, commands, context menus |
| [Implementation Details](developer/implementation-details.md) | Context menus, canvas generation, dual storage system |
| [Design Decisions](developer/design-decisions.md) | Architecture decision records (ADRs) |
| [Changelog Details](developer/changelog-details.md) | Detailed implementation notes for major features |
| [Coding Standards](developer/coding-standards.md) | TypeScript and CSS style guidelines |

## Architecture Documentation

- [Architecture Overview](architecture/overview.md) - System design and component interactions
- [Collections Architecture](architecture/collections.md) - Family components and user collections ADR

## Related Resources

- [Wiki: Roadmap](../wiki-content/Roadmap.md) - Planned features
- [Wiki: Release History](../wiki-content/Release-History.md) - Completed features documentation
- [CHANGELOG.md](../CHANGELOG.md) - Version history
