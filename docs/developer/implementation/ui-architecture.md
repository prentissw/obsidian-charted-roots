# UI Architecture

This document covers the user interface implementation including context menus, Control Center, and settings.

## Table of Contents

- [Context Menu Implementation](#context-menu-implementation)
  - [File Menu Integration](#file-menu-integration)
  - [Mobile Adaptations](#mobile-adaptations)
- [Control Center Architecture](#control-center-architecture)
  - [Modal Structure](#modal-structure)
  - [Tab System](#tab-system)
  - [Navigation and Routing](#navigation-and-routing)
  - [Public API](#public-api)
  - [Mobile Adaptations](#mobile-adaptations-1)
- [Settings and Configuration](#settings-and-configuration)
  - [Settings Interface](#settings-interface)
  - [Type Definitions](#type-definitions)
  - [Settings Tab vs Preferences Tab](#settings-tab-vs-preferences-tab)
  - [Default Values](#default-values)

---

## Context Menu Implementation

### File Menu Integration

The plugin adds context menu items when right-clicking on files. The implementation uses nested submenus on desktop and flat menus on mobile for better UX.

**Basic Pattern in main.ts:**

```typescript
this.registerEvent(
  this.app.workspace.on('file-menu', (menu, file) => {
    // Desktop: use nested submenus; Mobile: use flat menu with prefixes
    const useSubmenu = Platform.isDesktop && !Platform.isMobile;

    if (file instanceof TFile && file.extension === 'md') {
      const cache = this.app.metadataCache.getFileCache(file);
      const hasCrId = !!cache?.frontmatter?.cr_id;

      if (hasCrId) {
        menu.addSeparator();

        if (useSubmenu) {
          menu.addItem((item) => {
            const submenu: Menu = item
              .setTitle('Canvas Roots')
              .setIcon('git-fork')
              .setSubmenu();

            // Add submenu items...
            submenu.addItem((subItem) => {
              subItem
                .setTitle('Generate Canvas tree')
                .setIcon('layout')
                .onClick(() => {
                  const modal = new ControlCenterModal(this.app, this);
                  modal.openWithPerson(file);
                });
            });
          });
        } else {
          // Mobile: flat menu with prefix
          menu.addItem((item) => {
            item
              .setTitle('Canvas Roots: Generate family tree')
              .setIcon('git-fork')
              .onClick(() => {
                const modal = new ControlCenterModal(this.app, this);
                modal.openWithPerson(file);
              });
          });
        }
      }
    }
  })
);
```

**ControlCenterModal.openWithPerson() in control-center.ts:**

```typescript
public openWithPerson(file: TFile): void {
  const cache = this.app.metadataCache.getFileCache(file);
  if (!cache?.frontmatter?.cr_id) {
    new Notice('This note does not have a cr_id field');
    return;
  }

  const crId = cache.frontmatter.cr_id;
  const name = cache.frontmatter.name || file.basename;

  // Store person info for the tab to use when it renders
  this.pendingRootPerson = {
    name,
    crId,
    birthDate: cache.frontmatter.born,
    deathDate: cache.frontmatter.died,
    file
  };

  // Open to Tree Output tab (combines open + tab switch)
  this.openToTab('tree-generation');
}
```

**Note:** The actual implementation in main.ts is more comprehensive, with separate handling for:
- Canvas files (regenerate, export, statistics)
- Person notes (generate tree, add relationships, reference numbers)
- Place notes (geocode, view on map)
- Source/Event/Organization notes
- Schema notes
- Folders (import/export, statistics)

### Mobile Adaptations

On mobile devices, the plugin adapts its UI patterns for touch interaction:

**Context Menus:**
- Desktop: Nested submenus under a "Canvas Roots" parent item
- Mobile: Flat menu with prefixed items (e.g., "Canvas Roots: Generate family tree")

**Control Center Modal:**
- Desktop: Fixed sidebar with navigation drawer always visible
- Mobile: Full-screen modal with slide-in drawer navigation

```typescript
// Mobile detection in control-center.ts
private isMobileMode(): boolean {
  return Platform.isMobile || document.body.classList.contains('is-mobile');
}

// Apply mobile classes for CSS targeting
if (this.isMobileMode()) {
  this.drawer.addClass('crc-drawer--mobile');
  this.modalEl.addClass('crc-mobile-mode');
}
```

**Mobile-specific behaviors:**
- Navigation drawer slides in from left, with backdrop overlay
- Drawer auto-closes after tab selection
- Mobile menu toggle button in header
- Touch-friendly tap targets (44px minimum)
- Form inputs use 16px font to prevent iOS zoom

See [Mobile Styling](../styling.md#mobile-styling) for CSS implementation details.

---

## Control Center Architecture

The Control Center (`src/ui/control-center.ts`) is the primary user interface for Canvas Roots, providing a centralized modal with 17 tabs covering all plugin functionality. At 17,000+ lines, it's the largest file in the codebase.

### Modal Structure

```
┌─────────────────────────────────────────────────────────────┐
│  [≡]  Canvas Roots Control Center            [Tab Title]   │  ← Sticky Header
├─────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌─────────────────────────────────────────┐  │
│  │ Status   │  │                                         │  │
│  │ Guide    │  │                                         │  │
│  │ Import   │  │         Content Area                    │  │
│  │ People   │  │                                         │  │
│  │ Events   │  │         (Tab-specific content)          │  │
│  │ Places   │  │                                         │  │
│  │ Maps     │  │                                         │  │
│  │ Sources  │  │                                         │  │
│  │ ...      │  │                                         │  │
│  └──────────┘  └─────────────────────────────────────────┘  │
│   Drawer              Content Container                      │
└─────────────────────────────────────────────────────────────┘
```

**Key DOM elements:**

```typescript
class ControlCenterModal extends Modal {
  private drawer: HTMLElement;           // Navigation sidebar
  private contentContainer: HTMLElement; // Tab content area
  private appBar: HTMLElement;           // Sticky header
  private drawerBackdrop: HTMLElement;   // Mobile overlay

  private activeTab: string = 'status';  // Current tab ID
}
```

**CSS class convention:** All Control Center classes use the `crc-` prefix (Canvas Roots Control center).

### Tab System

Tabs are defined in `src/ui/lucide-icons.ts`:

```typescript
interface TabConfig {
  id: string;         // URL-safe identifier
  name: string;       // Display name
  icon: LucideIconName;
  description: string;
}

export const TAB_CONFIGS: TabConfig[] = [
  { id: 'status', name: 'Status', icon: 'activity', description: '...' },
  { id: 'guide', name: 'Guide', icon: 'book-open', description: '...' },
  // ... 15 more tabs
];
```

**All 17 tabs:**

| Tab ID | Name | Purpose |
|--------|------|---------|
| `dashboard` | Dashboard | Quick-action tiles, vault health, recent files |
| `guide` | Guide | Getting started documentation |
| `import-export` | Import/Export | GEDCOM, Gramps, CSV import/export |
| `people` | People | Person notes list, batch operations |
| `events` | Events | Event notes, date systems, timelines |
| `places` | Places | Place notes, geocoding, hierarchy |
| `maps` | Maps | Map views, custom image maps |
| `sources` | Sources | Source notes, citations, media |
| `schemas` | Schemas | Validation schemas |
| `relationships` | Relationships | Custom relationship types |
| `organizations` | Organizations | Organization notes |
| `universes` | Universes | Fictional universe management |
| `collections` | Collections | Family groups, custom collections |
| `data-quality` | Data Quality | Issue detection, batch fixes |
| `statistics` | Statistics | Vault analytics, reports |
| `tree-generation` | Tree Output | Canvas/chart generation |
| `preferences` | Preferences | Aliases, folders, display settings |

**Dashboard tiles:**

The Dashboard tab displays quick-action tiles organized in a responsive grid:

| Tile | Icon | Description |
|------|------|-------------|
| Create Person | `user-plus` | Opens Create Person modal |
| Import Data | `download` | Opens Import/Export tab |
| Generate Tree | `git-fork` | Opens Tree Output tab |
| Family Chart | `users` | Opens interactive chart (requires people) |
| Geocode Places | `map-pin` | Batch geocode place notes |
| View Map | `map` | Opens map view (requires places with coords) |
| Find Unlinked Media | `image` | Opens unlinked media finder modal |
| Run Data Quality | `check-circle` | Opens Data Quality tab |

Tiles are conditionally shown based on vault state (e.g., "Family Chart" requires person notes to exist).

### Navigation and Routing

**Tab switching:**

```typescript
private showTab(tabId: string): void {
  this.contentContainer.empty();

  switch (tabId) {
    case 'status':
      void this.showStatusTab();
      break;
    case 'people':
      void this.showPeopleTab();
      break;
    // ... 15 more cases
    default:
      this.showPlaceholderTab(tabId);
  }
}
```

**Drawer navigation:**

```typescript
private createNavigationDrawer(container: HTMLElement): void {
  this.drawer = container.createDiv({ cls: 'crc-drawer' });

  for (const tab of TAB_CONFIGS) {
    const navItem = this.drawer.createDiv({ cls: 'crc-nav-item' });
    setLucideIcon(navItem.createSpan(), tab.icon);
    navItem.createSpan({ text: tab.name });

    navItem.addEventListener('click', () => {
      this.activeTab = tab.id;
      this.updateActiveNavItem();
      this.showTab(tab.id);
    });
  }
}
```

**Active state management:**

```typescript
private updateActiveNavItem(): void {
  const navItems = this.drawer.querySelectorAll('.crc-nav-item');
  navItems.forEach((item, index) => {
    item.toggleClass('crc-nav-item--active', TAB_CONFIGS[index].id === this.activeTab);
  });
}
```

### Public API

The Control Center exposes methods for programmatic access:

```typescript
// Open to a specific tab
public openToTab(tabId: string): void {
  this.activeTab = tabId;
  this.open();
}

// Open with a person pre-selected for tree generation
public openWithPerson(file: TFile): void {
  const cache = this.app.metadataCache.getFileCache(file);
  const crId = cache?.frontmatter?.cr_id;

  this.pendingRootPerson = {
    name: cache.frontmatter.name || file.basename,
    crId,
    birthDate: cache.frontmatter.born,
    deathDate: cache.frontmatter.died,
    file
  };

  this.openToTab('tree-generation');
}

// Generate trees for all disconnected family components
public async openAndGenerateAllTrees(): Promise<void> {
  const components = graphService.findAllFamilyComponents();
  // Creates separate canvases for each family group
}
```

**Usage from main.ts:**

```typescript
// Context menu integration
menu.addItem((item) => {
  item.setTitle('Generate Canvas tree')
      .onClick(() => {
        const modal = new ControlCenterModal(this.app, this);
        modal.openWithPerson(file);
      });
});

// Command palette
this.addCommand({
  id: 'open-control-center',
  name: 'Open Control Center',
  callback: () => new ControlCenterModal(this.app, this).open()
});
```

### Mobile Adaptations

The Control Center adapts its layout for mobile devices:

```typescript
private isMobileMode(): boolean {
  return Platform.isMobile || document.body.classList.contains('is-mobile');
}

// Applied during modal creation
if (this.isMobileMode()) {
  this.drawer.addClass('crc-drawer--mobile');
  this.modalEl.addClass('crc-mobile-mode');
}
```

**Mobile-specific behaviors:**

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Drawer | Always visible sidebar | Slide-in overlay with backdrop |
| Modal size | 90vw × 85vh | Full screen (100vw × 100vh) |
| Tab selection | Click shows content | Click shows content + auto-closes drawer |
| Menu toggle | Hidden | Visible hamburger button |

**Drawer toggle:**

```typescript
private openMobileDrawer(): void {
  this.drawer.addClass('crc-drawer--open');
  this.drawerBackdrop.addClass('crc-backdrop--visible');
}

private closeMobileDrawer(): void {
  this.drawer.removeClass('crc-drawer--open');
  this.drawerBackdrop.removeClass('crc-backdrop--visible');
}

// Auto-close after tab selection on mobile
if (Platform.isMobile) {
  this.closeMobileDrawer();
}
```

---

## Settings and Configuration

Plugin settings are managed through `src/settings.ts`, which defines the settings interface, type definitions, and the Obsidian Settings tab.

### Settings Interface

`CanvasRootsSettings` contains 150+ properties organized by category:

```typescript
export interface CanvasRootsSettings {
  // === Layout & Sizing ===
  defaultNodeWidth: number;
  defaultNodeHeight: number;
  horizontalSpacing: number;
  verticalSpacing: number;

  // === Folder Locations ===
  peopleFolder: string;
  placesFolder: string;
  eventsFolder: string;
  sourcesFolder: string;
  organizationsFolder: string;
  universesFolder: string;
  mapsFolder: string;
  schemasFolder: string;
  canvasesFolder: string;
  reportsFolder: string;
  timelinesFolder: string;
  basesFolder: string;
  stagingFolder: string;

  // === Canvas Styling ===
  parentChildArrowStyle: ArrowStyle;
  spouseArrowStyle: ArrowStyle;
  nodeColorScheme: ColorScheme;
  parentChildEdgeColor: CanvasColor;
  spouseEdgeColor: CanvasColor;
  showSpouseEdges: boolean;
  spouseEdgeLabelFormat: SpouseEdgeLabelFormat;
  defaultLayoutType: LayoutType;

  // === Data Sync ===
  enableBidirectionalSync: boolean;
  syncOnFileModify: boolean;
  autoGenerateCrId: boolean;

  // === Privacy ===
  enablePrivacyProtection: boolean;
  livingPersonAgeThreshold: number;
  privacyDisplayFormat: 'living' | 'private' | 'initials' | 'hidden';
  hideDetailsForLiving: boolean;

  // === Import/Export ===
  exportFilenamePattern: string;
  preferredGedcomVersion: '5.5.1' | '7.0';
  lastGedcomExport?: LastExportInfo;
  // ... more export tracking

  // === Folder Filtering ===
  folderFilterMode: FolderFilterMode;
  excludedFolders: string[];
  includedFolders: string[];
  enableStagingIsolation: boolean;

  // === Type Management ===
  customRelationshipTypes: RelationshipTypeDefinition[];
  customEventTypes: EventTypeDefinition[];
  customSourceTypes: SourceTypeDefinition[];
  customOrganizationTypes: OrganizationTypeDefinition[];
  customPlaceTypes: PlaceTypeDefinition[];
  // ... show/hide built-ins, customizations, hidden items

  // === Aliases ===
  propertyAliases: Record<string, string>;
  valueAliases: ValueAliasSettings;

  // === Logging ===
  logLevel: LogLevel;
  logExportPath: string;
  obfuscateLogExports: boolean;

  // === Feature Flags ===
  enableFictionalDates: boolean;
  enableRelationshipHistory: boolean;
  trackFactSourcing: boolean;
  showResearchGapsInStatus: boolean;

  // === Media ===
  mediaFolders: string[];           // Folders to scan for media files
  enableMediaFolderFilter: boolean; // Whether to limit scanning to specified folders
  frozenGalleryCalloutType: string; // Callout type for frozen galleries (default: 'info')

  // === Note Detection ===
  noteTypeDetection: NoteTypeDetectionSettings;

  // === Data Quality ===
  sexNormalizationMode: SexNormalizationMode;
  dateFormatStandard: 'iso8601' | 'gedcom' | 'flexible';
  allowPartialDates: boolean;
  allowCircaDates: boolean;
  allowDateRanges: boolean;

  // === History ===
  recentTrees: RecentTreeInfo[];
  recentImports: RecentImportInfo[];
  historyRetentionDays: number;
}
```

### Type Definitions

Settings use TypeScript union types for constrained options:

```typescript
// Arrow styling
export type ArrowStyle = 'directed' | 'bidirectional' | 'undirected';

// Node coloring schemes
export type ColorScheme = 'sex' | 'generation' | 'collection' | 'monochrome';

// Obsidian's 6 canvas colors
export type CanvasColor = '1' | '2' | '3' | '4' | '5' | '6' | 'none';

// Layout algorithms
export type LayoutType = 'standard' | 'compact' | 'timeline' | 'hourglass';

// Folder scanning modes
export type FolderFilterMode = 'disabled' | 'exclude' | 'include';

// Sex value normalization
export type SexNormalizationMode = 'standard' | 'schema-aware' | 'disabled';

// Spouse edge labels
export type SpouseEdgeLabelFormat = 'none' | 'date-only' | 'date-location' | 'full';
```

**Tracking interfaces:**

```typescript
interface RecentTreeInfo {
  canvasPath: string;
  canvasName: string;
  peopleCount: number;
  edgeCount: number;
  rootPerson: string;
  timestamp: number;
}

interface LastExportInfo {
  timestamp: number;
  peopleCount: number;
  destination: 'download' | 'vault';
  filePath?: string;
  privacyExcluded?: number;
}
```

### Settings Tab vs Preferences Tab

Canvas Roots has two places for configuration:

**Obsidian Settings Tab** (`CanvasRootsSettingTab`):
- Accessed via Settings → Community Plugins → Canvas Roots
- Contains: Logging level, log export path, log obfuscation toggle
- Minimal surface area—most settings moved to Preferences tab

```typescript
export class CanvasRootsSettingTab extends PluginSettingTab {
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Canvas Roots Settings' });

    // Logging settings only
    new Setting(containerEl)
      .setName('Log level')
      .addDropdown(dropdown => {
        dropdown.addOption('debug', 'Debug');
        dropdown.addOption('info', 'Info');
        // ...
      });
  }
}
```

**Control Center Preferences Tab** (`preferences-tab.ts`):
- Accessed via Control Center → Preferences
- Contains: All other settings organized in cards
- Provides richer UI with previews, inline help, and grouped controls

```typescript
export function renderPreferencesTab(
  container: HTMLElement,
  plugin: CanvasRootsPlugin,
  showTab: (tabId: string) => void
): void {
  // Cards for: Folders, Property Aliases, Value Aliases,
  // Canvas Styling, Privacy, Date Validation, Type Management, etc.
}
```

**Rationale:** The Obsidian Settings tab is limited to simple controls. Complex settings like type customization, alias editing, and folder configuration work better in the Control Center's card-based UI.

### Default Values

`DEFAULT_SETTINGS` provides initial values for all settings:

```typescript
export const DEFAULT_SETTINGS: CanvasRootsSettings = {
  // Layout
  defaultNodeWidth: 250,
  defaultNodeHeight: 120,
  horizontalSpacing: 300,
  verticalSpacing: 200,

  // Folders
  peopleFolder: 'People',
  placesFolder: 'Places',
  eventsFolder: 'Events',
  sourcesFolder: 'Sources',
  organizationsFolder: 'Organizations',
  universesFolder: 'Universes',
  mapsFolder: 'Maps',
  schemasFolder: 'Schemas',
  canvasesFolder: 'Canvas Roots',
  reportsFolder: 'Reports',
  timelinesFolder: 'Timelines',
  basesFolder: 'Canvas Roots/Bases',
  stagingFolder: 'Staging',

  // Styling
  parentChildArrowStyle: 'directed',
  spouseArrowStyle: 'undirected',
  nodeColorScheme: 'sex',
  defaultLayoutType: 'standard',

  // Sync
  enableBidirectionalSync: true,
  syncOnFileModify: true,
  autoGenerateCrId: true,

  // Privacy
  enablePrivacyProtection: true,
  livingPersonAgeThreshold: 100,
  privacyDisplayFormat: 'living',
  hideDetailsForLiving: true,

  // Logging
  logLevel: 'info',
  obfuscateLogExports: true,

  // Media
  mediaFolders: [],                // Empty = scan entire vault
  enableMediaFolderFilter: false,  // Disabled by default
  frozenGalleryCalloutType: 'info',

  // Type management
  customRelationshipTypes: [],
  customEventTypes: [],
  showBuiltInRelationshipTypes: true,
  showBuiltInEventTypes: true,
  // ... all empty/true defaults for type management
};
```

**Settings persistence:**

```typescript
// In main.ts
async loadSettings() {
  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
}

async saveSettings() {
  await this.saveData(this.settings);
}
```
