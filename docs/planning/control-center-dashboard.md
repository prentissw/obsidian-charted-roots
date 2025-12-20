# Control Center Dashboard

Planning document for adding a tile-based Dashboard to the Control Center, replacing the Status tab with a more action-oriented interface.

- **Status:** Planning
- **Priority:** Medium
- **GitHub Issue:** #TBD
- **Created:** 2025-12-20

---

## Overview

Transform the Control Center's Status tab into a Dashboard with quick-action tiles, providing mobile-friendly access to common operations. The current Status tab shows metrics but lacks actionable shortcuts. A tile-based interface surfaces high-frequency actions that are currently buried in menus or require multiple clicks.

---

## Problem Statement

**Current State:**
- Status tab displays entity counts and vault health metrics
- Common actions require navigating to other tabs or using Command Palette
- Mobile users face extra friction due to limited screen space and touch navigation
- No quick access to frequently-used operations

**Pain Points:**
1. **Mobile UX** — Small screens make menu navigation tedious
2. **Action discovery** — New users don't know what operations are available
3. **Context switching** — Must leave Control Center to perform common tasks
4. **Repetitive navigation** — Power users repeat the same clicks frequently

---

## Proposed Solution

Rename "Status" tab to "Dashboard" and add a tile grid of quick actions above the existing metrics. The tiles provide one-tap access to common operations while preserving the health overview.

### Design Principles

1. **Fixed, curated tile set** — Start with a well-chosen set rather than configurable tiles
2. **Mobile-first** — Larger tap targets, responsive grid layout
3. **Preserve existing content** — Vault health metrics remain, reorganized below tiles
4. **Progressive enhancement** — Can add configurability in future releases

---

## Dashboard Layout

```
┌─ DASHBOARD TAB ─────────────────────────────────────────┐
│                                                          │
│  QUICK ACTIONS                                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │  👤      │ │  📅      │ │  📄      │                 │
│  │  Person  │ │  Event   │ │  Source  │                 │
│  └──────────┘ └──────────┘ └──────────┘                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                 │
│  │  📊      │ │  📈      │ │  📥      │                 │
│  │  Report  │ │  Stats   │ │  Import  │                 │
│  └──────────┘ └──────────┘ └──────────┘                 │
│                                                          │
│  ▼ VAULT HEALTH                                         │
│  ┌────────────────────────────────────────────────────┐ │
│  │  1,234 People  │  456 Events  │  89 Sources        │ │
│  │  12 Issues     │  89% Complete                     │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ▼ RECENT                                               │
│  ┌────────────────────────────────────────────────────┐ │
│  │  • John Smith (Person)           2 min ago        │ │
│  │  • Birth of Mary (Event)         1 hour ago       │ │
│  │  • 1850 Census (Source)          Yesterday        │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Tile Categories & Actions

### Core Tiles (Always Visible)

| Tile | Icon | Action | Description |
|------|------|--------|-------------|
| **Person** | 👤 | Create Person | Opens person creation modal |
| **Event** | 📅 | Create Event | Opens event creation modal |
| **Source** | 📄 | Create Source | Opens source creation modal |
| **Report** | 📊 | Generate Report | Opens Report Generator modal |
| **Statistics** | 📈 | Open Dashboard | Opens Statistics Dashboard view |
| **Import** | 📥 | Import Data | Opens Import Wizard |

### Secondary Tiles (Collapsible or Row 2)

| Tile | Icon | Action | Description |
|------|------|--------|-------------|
| **Place** | 📍 | Create Place | Opens place creation modal |
| **Organization** | 🏛️ | Create Organization | Opens organization creation modal |
| **Canvas** | 🎨 | New Canvas | Creates new canvas file |
| **Search** | 🔍 | Search Vault | Opens CR-aware search or Obsidian search |
| **Validate** | ✓ | Validate Data | Runs data quality checks |
| **Batch** | ⚡ | Batch Operations | Opens batch operations modal |

### Tile Selection Rationale

**Included:**
- Create Person/Event/Source — Most frequent operations for genealogists
- Generate Report — Key feature, currently requires navigating to Statistics Dashboard
- Statistics Dashboard — Central hub for analysis
- Import — Common entry point for new data

**Deferred:**
- Universe/Collection creation — Less frequent, available via other tabs
- Export — Less urgent than import, available in Import/Export tab
- Settings — Already accessible via gear icon

---

## Responsive Grid Layout

### Desktop (>800px width)
- 3-column grid
- 6 tiles visible (2 rows)
- Comfortable spacing

### Tablet (500-800px)
- 3-column grid
- Slightly smaller tiles
- Same layout as desktop

### Mobile (<500px)
- 2-column grid
- Larger tap targets (min 48px)
- May show 4-6 tiles based on viewport

```css
/* Conceptual responsive breakpoints */
.cr-dashboard-tiles {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, 1fr);
}

@media (max-width: 500px) {
  .cr-dashboard-tiles {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

---

## Vault Health Section

Preserve existing Status tab content in a collapsible section:

| Metric | Description |
|--------|-------------|
| **Entity counts** | People, Events, Sources, Places, Organizations, Canvases |
| **Completeness** | % of people with key data (birth, death, parents, sources) |
| **Issues** | Count of data quality warnings/errors |
| **Date range** | Earliest to latest dates in vault |

**Interaction:**
- Collapsed by default after first use (remembers state)
- Click to expand/collapse
- "View Details" link opens Statistics Dashboard

---

## Recent Section

Track recently accessed genealogical files:

| Field | Description |
|-------|-------------|
| **File name** | Display name of the note |
| **Entity type** | Person, Event, Source, Place, etc. |
| **Timestamp** | Relative time (2 min ago, Yesterday, etc.) |

**Behavior:**
- Shows last 5 accessed files
- Click to open file
- Right-click for context menu
- Excludes non-CR files (regular notes, settings, etc.)

**Storage:**
```typescript
interface RecentFileEntry {
  path: string;
  name: string;
  entityType: 'person' | 'event' | 'source' | 'place' | 'organization' | 'canvas';
  accessedAt: number;
}

// Stored in plugin settings
recentFiles: RecentFileEntry[];  // Max 10, shown 5
```

---

## Implementation Architecture

### Component Structure

```
src/ui/control-center/
├── tabs/
│   ├── dashboard-tab.ts          # New: replaces status-tab.ts
│   ├── status-tab.ts             # Deprecated or removed
│   └── ...
├── components/
│   ├── dashboard-tiles.ts        # Tile grid component
│   ├── dashboard-tile.ts         # Individual tile
│   ├── vault-health-section.ts   # Collapsible metrics
│   └── recent-files-section.ts   # Recent files list
```

### Tab Registration

```typescript
// In control-center.ts
this.registerTab('dashboard', {
  id: 'dashboard',
  name: 'Dashboard',
  icon: 'layout-dashboard',
  component: DashboardTab
});
```

### Tile Configuration

```typescript
interface DashboardTile {
  id: string;
  label: string;
  icon: string;           // Lucide icon name
  action: () => void;     // Click handler
  description?: string;   // Tooltip text
}

const DASHBOARD_TILES: DashboardTile[] = [
  { id: 'create-person', label: 'Person', icon: 'user', action: () => createPerson() },
  { id: 'create-event', label: 'Event', icon: 'calendar', action: () => createEvent() },
  // ...
];
```

---

## Phased Implementation

### Phase 1: Foundation
- Create `DashboardTab` component
- Implement tile grid with 6 core tiles
- Wire up tile actions to existing modals/commands
- Rename tab from "Status" to "Dashboard"

### Phase 2: Sections
- Add collapsible Vault Health section
- Migrate existing Status tab metrics
- Add expand/collapse state persistence

### Phase 3: Recent Files
- Implement recent file tracking
- Add Recent section to Dashboard
- File access listener integration

### Phase 4: Polish
- Responsive grid refinement
- Mobile-specific optimizations
- Accessibility (keyboard navigation, ARIA labels)
- Tooltip/description support

---

## Future Enhancements (Not in Scope)

These ideas are interesting but deferred to keep initial scope manageable:

| Enhancement | Description |
|-------------|-------------|
| **Configurable tiles** | User chooses which tiles to show |
| **Reorderable tiles** | Drag-drop to rearrange |
| **Custom quick actions** | User-defined tiles with custom commands |
| **Tile badges** | Notification counts (e.g., "12 issues") |
| **Favorite entities** | Pin frequently-accessed files |
| **Compact mode** | Icons only, no labels (for very small screens) |

---

## Open Questions

1. **Icon style:** Use emoji (👤) or Lucide icons? Lucide is more consistent with Obsidian, but emoji may be more visually distinct on small screens.

2. **Tile count:** 6 tiles (2 rows of 3) or 9 tiles (3 rows of 3)? More tiles = more options but more scrolling on mobile.

3. **Recent tracking scope:** Track all file opens, or only opens via Canvas Roots features? The latter is cleaner but misses direct file navigation.

4. **Tab icon:** What icon for "Dashboard" tab? Current "Status" uses a bar chart. Options: `layout-dashboard`, `grid`, `home`.

---

## Alternatives Considered

### Command Palette Only
- Pros: No UI changes needed
- Cons: Doesn't help mobile users, requires knowing command names

### Floating Action Button (FAB)
- Pros: Always accessible, mobile-friendly pattern
- Cons: Obscures content, not standard in Obsidian, single action focus

### Toolbar Extension
- Pros: Persistent access
- Cons: Limited space, not visible in all views

### Sidebar Widget
- Pros: Always visible
- Cons: Takes permanent space, competes with other sidebar content

**Decision:** Dashboard tab is the best fit because:
- Control Center is already the hub for CR operations
- Tab pattern is familiar to users
- Doesn't require new UI paradigms
- Mobile users already know to open Control Center

---

## Related Documents

- [Report Wizard Enhancements](report-wizard-enhancements.md) — Report Generator improvements
- [Statistics and Reports](../../wiki-content/Statistics-And-Reports.md) — Statistics Dashboard documentation
- [Control Center](../../wiki-content/Control-Center.md) — Current Control Center documentation

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2025-12-20 | Created planning document | Mobile UX improvement opportunity |
| 2025-12-20 | Fixed tile set over configurable | Simpler implementation, better defaults matter more |
| 2025-12-20 | Preserve existing metrics in collapsible section | Don't lose existing functionality |
| 2025-12-20 | 4-phase implementation | Incremental delivery with foundation first |
| | | |
