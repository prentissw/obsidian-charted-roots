# Development Guide

This is the main index for Canvas Roots developer documentation.

## Quick Start

```bash
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/canvas-roots/` directory and reload Obsidian.

## Documentation Index

### Getting Started

| Document | Description |
|----------|-------------|
| [Getting Started](developer/getting-started.md) | Development environment setup, build commands, testing, debugging |
| [Project Structure](developer/project-structure.md) | Directory layout, component status tables, commands, context menus |
| [Coding Standards](developer/coding-standards.md) | TypeScript and CSS style guidelines |

### Technical Reference

| Document | Description |
|----------|-------------|
| [Implementation Details](developer/implementation-details.md) | Comprehensive technical documentation covering all major features: entity system, canvas generation, maps, import/export, data quality, Control Center, schemas, relationships, collections, fictional dates, and more |
| [Styling Guide](developer/styling.md) | CSS architecture, BEM naming, theming, mobile adaptations |
| [Design Decisions](developer/design-decisions.md) | Architecture decision records (ADRs) |

### Supporting Documentation

| Document | Description |
|----------|-------------|
| [Changelog Details](developer/changelog-details.md) | Detailed implementation notes for major features |
| [CSS System](css-system.md) | CSS variables, component styling, theme integration |
| [ESLint Setup](eslint-setup.md) | Linting configuration and rules |

## Architecture Documentation

- [Architecture Overview](architecture/overview.md) - System design and component interactions
- [Collections Architecture](architecture/collections.md) - Family components and user collections ADR

## Related Resources

- [Wiki: Roadmap](https://github.com/banisterious/obsidian-canvas-roots/wiki/Roadmap) - Planned features
- [Wiki: Release History](https://github.com/banisterious/obsidian-canvas-roots/wiki/Release-History) - Completed features documentation
- [CHANGELOG.md](../CHANGELOG.md) - Version history
- [CONTRIBUTING.md](../CONTRIBUTING.md) - How to contribute
