# Control Center Modularization

Planning document for [#239](https://github.com/banisterious/obsidian-charted-roots/discussions/239).

**Status:** 📋 Planning

---

## Overview

Migrate the Control Center from a single ~13,760-line modal (`control-center.ts`) into modular, independently dockable workspace views. This is a two-phase effort: first extract each tab into its own component file (still hosted by the modal), then migrate each component to a standalone `ItemView`.

**Motivation:**
- The Control Center modal has grown to 16 tabs and ~13,760 lines — maintaining it as a monolith is increasingly difficult
- Users have requested persistent, dockable views that can stay open alongside notes (see #239)
- The existing Statistics, Family Chart, and Map views already demonstrate the ItemView pattern successfully

---

## Current State

### Control Center Tabs (16 total)

| Tab | Lines | Extraction Status | Notes |
|-----|-------|-------------------|-------|
| Dashboard | ~14 | ✅ Extracted to `dashboard-tab.ts` (794 lines) | Delegates via `renderDashboardTab()` |
| People | ~265 | ❌ Embedded | Has filter/sort state, relationship field UI |
| Events | ~13 | ✅ Extracted | Delegates to external renderer |
| Places | ~16 | ✅ Extracted to `places-tab.ts` (1,720 lines) | Delegates via `renderPlacesTab()` |
| Sources | ~13 | ✅ Extracted | Delegates to external renderer |
| Organizations | ~13 | ✅ Extracted | Delegates to external renderer |
| Universes | ~310 | ❌ Embedded | Has filter/sort state, embedded table renderer |
| Collections | ~74 | ❌ Embedded | Uses cached services |
| Data Quality | ~325 | ❌ Embedded | Multiple embedded helper classes and modals |
| Schemas | ~178 | ❌ Embedded | Delegates to helpers from `../schemas` |
| Relationships | ~13 | ✅ Extracted | Delegates to external renderer |
| Trees & Reports | ~254 | ❌ Embedded | Complex wizard logic |
| Maps | ~194 | ❌ Embedded | Uses PlaceGraphService |
| Status | ~394 | 🗑️ Legacy (redirects to Dashboard) | Can be removed |
| Guide | ~650 | 🗑️ Legacy (redirects to Dashboard) | Can be removed |
| Statistics | ~14 | 🗑️ Legacy (redirects to Dashboard) | Can be removed |

### Embedded Helper Classes

The following classes are currently defined inside `control-center.ts` and would need to be extracted alongside their parent tabs:

- `PersonTableRenderer` — People tab
- `UniverseTableRenderer` — Universes tab
- `DataQualityAnalyzer` — Data Quality tab
- `ResearchGapsRenderer` — Data Quality tab
- `BidirectionalLinksModal` — Data Quality tab
- `ImpossibleDatesModal` — Data Quality tab
- `OrphanedParentReferencesModal` — Data Quality tab
- `InvalidSexValuesModal` — Data Quality tab
- `MissingCRIDsModal` — Data Quality tab
- `ConfirmationDialog` — shared

### Shared Infrastructure

These remain in `control-center.ts` (or a shared utility) across both phases:

- **Modal shell:** Header, drawer, content container, tab switching
- **`createCard()`** — Card component used by all tabs
- **Cache management:** `getCachedFamilyGraph()`, `getCachedPlaceGraph()`, `getCachedUniverses()`, `invalidateCaches()`
- **Public API:** `openToTab()`, `openWithPerson()`, `openAndGenerateAllTrees()`

### Cross-Tab Navigation

Some tabs navigate to other tabs:

- Data Quality → People, Places, Schemas
- Universes → Events, Places

In Phase 1 (component extraction), these remain as callbacks. In Phase 2 (ItemViews), they would become command invocations or workspace navigation.

---

## Phase 1: Component Extraction

**Goal:** Extract each embedded tab into its own file, following the existing pattern established by `dashboard-tab.ts` and `places-tab.ts`. The Control Center modal remains the host — no user-facing changes.

### Extraction Pattern

Each extracted tab follows the existing convention:

```typescript
// src/ui/tabs/people-tab.ts
export interface PeopleTabOptions {
    container: HTMLElement;
    plugin: CanvasRootsPlugin;
    app: App;
    createCard: (options: CardOptions) => HTMLElement;
    switchTab: (tabId: string) => void;
    closeModal: () => void;
}

export function renderPeopleTab(options: PeopleTabOptions): void {
    // All rendering logic extracted here
}
```

The modal's `showTab()` dispatcher calls the extracted function:

```typescript
private showPeopleTab(): void {
    renderPeopleTab({
        container: this.contentContainer,
        plugin: this.plugin,
        app: this.app,
        createCard: this.createCard.bind(this),
        switchTab: this.switchTab.bind(this),
        closeModal: () => this.close()
    });
}
```

### File Structure

```
src/ui/
├── control-center.ts            (modal shell + tab switching, greatly reduced)
├── tabs/
│   ├── dashboard-tab.ts         (existing, move from ui/)
│   ├── people-tab.ts
│   ├── events-tab.ts            (existing, consolidate)
│   ├── places-tab.ts            (existing, move from ui/)
│   ├── sources-tab.ts           (existing, consolidate)
│   ├── organizations-tab.ts     (existing, consolidate)
│   ├── universes-tab.ts
│   ├── collections-tab.ts
│   ├── data-quality-tab.ts
│   ├── schemas-tab.ts
│   ├── relationships-tab.ts     (existing, consolidate)
│   ├── tree-generation-tab.ts
│   └── maps-tab.ts
└── shared/
    ├── card-component.ts        (createCard, createStatRow, etc.)
    └── confirmation-dialog.ts
```

### Extraction Order

Ordered by complexity (simplest first):

1. **Schemas** — Already delegates to helpers in `../schemas`, minimal state
2. **Collections** — Small (74 lines), uses cached services
3. **Maps** — Moderate (194 lines), uses PlaceGraphService
4. **Trees & Reports** — Moderate (254 lines), self-contained wizard logic
5. **People** — Moderate (265 lines), has filter/sort state and relationship fields
6. **Universes** — Higher (310 lines), has filter/sort state and embedded table renderer
7. **Data Quality** — Highest (325 lines), multiple embedded helper classes and modals

### Cleanup

- Remove legacy tabs (Status, Guide, Statistics redirects) — dead code
- Extract `createCard()` and shared UI helpers to `shared/card-component.ts`
- Extract `ConfirmationDialog` to `shared/confirmation-dialog.ts`
- Move existing extracted tabs (`dashboard-tab.ts`, `places-tab.ts`) into `tabs/` directory

---

## Phase 2: ItemView Migration

**Goal:** Each tab component becomes an independent `ItemView` that can be docked, pinned, and used alongside notes. The Control Center modal is either retired or becomes a lightweight launcher.

### ItemView Pattern

Each view follows the existing Statistics/Family Chart/Map convention:

```typescript
// src/ui/views/people-view.ts
export const VIEW_TYPE_PEOPLE = 'canvas-roots-people';

export class PeopleView extends ItemView {
    getViewType(): string { return VIEW_TYPE_PEOPLE; }
    getDisplayText(): string { return 'People'; }
    getIcon(): string { return 'users'; }

    async onOpen(): Promise<void> {
        const container = this.containerEl.children[1];
        container.empty();
        renderPeopleTab({
            container: container as HTMLElement,
            plugin: this.plugin,
            app: this.app,
            // ... adapted options
        });
    }
}
```

### Registration & Commands

Each view gets registered in `main.ts`:

```typescript
this.registerView(VIEW_TYPE_PEOPLE, (leaf) => new PeopleView(leaf, this));
this.addCommand({
    id: 'show-people-view',
    name: 'Show people',
    callback: () => this.activatePeopleView()
});
```

### Cross-Tab Navigation

In Phase 1, tabs navigate via `switchTab('places')` callback. In Phase 2, this becomes workspace navigation:

```typescript
// Open the Places view in the workspace
await this.plugin.activatePlacesView();
```

### Coexistence with Control Center Modal

The Control Center modal is **not deprecated**. Both the modal and ItemViews share the same extracted tab components (from Phase 1), so there is no maintenance overhead from supporting both. The modal remains available for users who prefer quick, transient access — open, act, close — while ItemViews serve users who want persistent, dockable views for extended sessions.

- The modal hosts components in a drawer layout with tab switching
- ItemViews host the same components as standalone workspace tabs
- Same rendering code, two different shells

### Migration Order

Same order as Phase 1 extraction. Each tab can be migrated independently once its component is extracted.

---

## Open Questions

1. **Workspace layout presets** — Should we provide a "Control Center layout" command that opens all views in a predefined arrangement?
2. **State persistence** — Each ItemView should persist its filter/sort state via `getState()`/`setState()`. What state should persist across sessions?
3. **Auto-refresh** — Should entity views auto-refresh when vault files change (like Statistics does), or require manual refresh?
4. **Navigation hub** — Should Dashboard become a lightweight "home" view that links to all other views?
