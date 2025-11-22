# Collections Architecture Decision Record

**Status:** Approved
**Date:** 2025-11-22
**Decision Makers:** Core development team
**Affects:** v0.2.0+ (Collections Management feature)

---

## Context and Problem Statement

Canvas Roots needs a way to organize and manage multiple family trees or character groups within a single Obsidian vault. Users fall into several categories:

1. **Genealogists** with multiple disconnected family trees
2. **World-builders** tracking fictional dynasties, factions, or organizations
3. **Researchers** organizing by lineage, branch, or time period
4. **Casual users** who don't want complex organization systems

**Key Requirements:**
- Support users who don't use folders
- Support users who don't use tags
- Work with flat vault structures
- Compatible with Obsidian Bases for bulk editing
- Zero configuration for basic use
- Power user features available when needed

**Key Constraints:**
- No required folder structure
- No required tagging system
- Derived data should be computed, not stored
- Must work with existing family detection system

---

## Decision Drivers

1. **User Diversity:** Some users organize with folders, some with tags, some with nothing
2. **Data Integrity:** Stored data can become stale when relationships change
3. **Obsidian Philosophy:** Notes are primary, structure is emergent
4. **Bases Compatibility:** Users need editable properties in table views
5. **World-Building Support:** Collections aren't just families (factions, organizations, etc.)
6. **Maintainability:** Simpler is better for long-term maintenance

---

## Options Considered

### Option A: Folder-Based Collections

**Approach:** Each top-level folder becomes a collection

```
vault/
  Smith Family/        ← Collection
    John Smith.md
  Jones Family/        ← Collection
    Mary Jones.md
```

**Pros:**
- ✅ Visual organization in file tree
- ✅ Natural grouping
- ✅ Works with existing folder workflows

**Cons:**
- ❌ Requires folder structure (excludes flat vault users)
- ❌ Brittle (moving files breaks collections)
- ❌ Doesn't match how relationships actually work
- ❌ Violates "no folder requirements" constraint

**Verdict:** ❌ Rejected

---

### Option B: Tag-Based Collections

**Approach:** Use tags to assign collection membership

```yaml
---
cr_id: abc-123
name: John Smith
tags:
  - person
  - collection/smith-family
---
```

**Pros:**
- ✅ Flexible (works with any vault structure)
- ✅ Multiple collections per person possible
- ✅ Searchable via Obsidian tag system

**Cons:**
- ❌ Requires tagging (many users don't use tags)
- ❌ Manual maintenance
- ❌ Not visible/editable in Bases
- ❌ Violates "no tag requirements" constraint

**Verdict:** ❌ Rejected

---

### Option C: Smart Hybrid (SELECTED)

**Approach:** Two parallel collection systems

#### 1. **Detected Components (Auto, Zero-Config)**
- Computed from relationship graph via `findAllFamilyComponents()`
- Always accurate, never stale
- Used for "Generate all trees" command
- Display as "Family 1", "Family 2", etc.
- Optional `collection_name` property for custom labels

```yaml
---
cr_id: abc-123
name: John Smith
collection_name: "Smith Family Tree"  # Optional, sets display name
---
```

#### 2. **User Collections (Manual, Optional)**
- Stored in YAML: `collection: "Paternal Line"`
- Editable in Bases
- Used for filtering, organizing, custom groupings
- Can represent anything: lineages, factions, time periods

```yaml
---
cr_id: abc-123
name: John Smith
collection: "Paternal Line"  # User-assigned, editable
---
```

**Pros:**
- ✅ Zero configuration for basic users (detected components)
- ✅ Power user features for advanced users (user collections)
- ✅ Works with flat vaults (no folders required)
- ✅ No tags required
- ✅ Editable in Bases
- ✅ Derived data (components) always accurate
- ✅ User data (collections) fully controllable
- ✅ Supports world-building use cases

**Cons:**
- ⚠️ Two concepts (but this is actually a feature)
- ⚠️ Slightly more complex to explain

**Verdict:** ✅ **SELECTED**

---

## Detailed Design: Option C

### Core Principle

> **Collections = User Organization**
> **Components = Graph Reality**

- **Detected Components:** What the relationship graph tells us
- **User Collections:** How the user wants to organize/filter

These coexist peacefully:
- Casual users: Use detected components (zero config)
- Power users: Use user collections (flexible organization)
- Both work simultaneously

---

### Data Storage Strategy

#### **Computed Data (NOT Stored):**

**Family Component Membership**
- Determined by graph traversal (BFS on relationship edges)
- Recomputed on-demand when UI loads
- Always reflects current relationships
- Self-healing (add marriage → components merge automatically)

**Why Not Stored:**
```yaml
# ❌ BAD - Component IDs in YAML
family_component_id: "component-1"  # What happens when relationships change?
```

**Problems:**
1. Stale data when relationships change
2. Sync complexity (update multiple files on one relationship change)
3. Conflict between stored value and graph reality
4. Manual maintenance burden

**Why Computed:**
1. ✅ Always accurate
2. ✅ Zero maintenance
3. ✅ Self-healing
4. ✅ Single source of truth (relationships)

---

#### **Stored Data (User Intent):**

**Optional Component Names**
```yaml
collection_name: "Smith Family Tree"
```

- Any person in a component can set this
- Used as display label for that component
- If multiple people have different names, use most common (or alphabetically first)
- Defaults to "Family 1", "Family 2", etc. if not set

**Optional User Collections**
```yaml
collection: "Paternal Line"
```

- User-assigned organizational category
- Completely independent of detected components
- Editable in Obsidian Bases
- Can represent anything: lineages, factions, branches, time periods
- Optional (defaults to nothing)

---

### Implementation Details

#### **Interface Definitions**

```typescript
// Detected family component (computed)
interface FamilyComponent {
  index: number;              // 0, 1, 2... (sorted by size, largest first)
  displayName: string;        // From collection_name or "Family 1"
  size: number;               // Person count
  people: PersonNode[];       // All members
  representative: PersonNode; // Oldest by birth or first alphabetically
}

// User-defined collection (stored)
interface UserCollection {
  name: string;               // From 'collection' property
  people: PersonNode[];       // People with this collection value
}

// Person node with collection data
interface PersonNode {
  crId: string;
  name: string;
  // ... existing fields ...

  // Optional user-assigned collection
  userCollection?: string;    // From 'collection' property
}
```

#### **Detection Algorithm**

```typescript
class FamilyGraphService {
  async getFamilyComponents(): Promise<FamilyComponent[]> {
    // Use existing findAllFamilyComponents()
    const components = await this.findAllFamilyComponents();

    return components.map((comp, index) => {
      // Look for user-provided name in any component member
      const customName = this.findCollectionName(comp.people);

      return {
        index,
        displayName: customName || `Family ${index + 1}`,
        size: comp.size,
        people: comp.people,
        representative: comp.representative
      };
    });
  }

  private findCollectionName(people: PersonNode[]): string | null {
    // Scan frontmatter for collection_name property
    const names = people
      .map(p => this.getPropertyFromFrontmatter(p.file, 'collection_name'))
      .filter(n => n);

    if (names.length === 0) return null;
    if (names.length === 1) return names[0];

    // Multiple names - pick most common or first alphabetically
    const counts = names.reduce((acc, name) => {
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {});

    return Object.keys(counts)
      .sort((a, b) => counts[b] - counts[a] || a.localeCompare(b))[0];
  }

  async getUserCollections(): Promise<UserCollection[]> {
    const peopleByCollection = new Map<string, PersonNode[]>();

    for (const person of this.getAllPeople()) {
      if (person.userCollection) {
        if (!peopleByCollection.has(person.userCollection)) {
          peopleByCollection.set(person.userCollection, []);
        }
        peopleByCollection.get(person.userCollection)!.push(person);
      }
    }

    return Array.from(peopleByCollection.entries()).map(([name, people]) => ({
      name,
      people
    }));
  }
}
```

---

### UI Integration

#### **Tree Generation Tab**

```
Browse by:
┌─────────────────────────────────┐
│ ○ All people                    │
│ ● Detected families (3 groups)  │  ← Auto from graph, zero config
│ ○ My collections (2 groups)     │  ← User-defined, optional
└─────────────────────────────────┘

[When "Detected families" selected]
Sidebar shows:
  ✓ All families (80 people)
  ✓ Smith Family (45 people)      ← Custom name from collection_name
  ✓ Family 2 (20 people)           ← Default name
  ✓ Family 3 (15 people)

[When "My collections" selected]
Sidebar shows:
  ✓ All collections (80 people)
  ✓ Paternal Line (40 people)
  ✓ Maternal Line (35 people)
  ✓ My Generation (5 people)
```

#### **Obsidian Bases Integration**

```yaml
# In family-members.base template
properties:
  collection:
    displayName: "Collection"
    type: text  # Or dropdown with autocomplete

  collection_name:
    displayName: "Family Name"
    type: text
    help: "Sets display name for detected family group"

views:
  # View grouped by user collections
  - type: table
    name: "By Collection"
    group_by: collection
    order:
      - collection
      - note.born
```

---

### Inter-Collection Connections

#### **For Detected Components: No Connections**

Components are *by definition* disconnected groups.

If two components connect via a relationship, they automatically merge:

```
Before: Component 1 (Smith) + Component 2 (Jones)
John Smith marries Mary Jones
After: Component 1 (Smith-Jones) [merged]
```

#### **For User Collections: Implicit Bridge Detection**

User collections are arbitrary, so they CAN have connections:

```typescript
interface CollectionConnection {
  fromCollection: string;
  toCollection: string;
  bridgePeople: PersonNode[];  // People with relationships across collections
  relationshipCount: number;
}

async detectCollectionConnections(): Promise<CollectionConnection[]> {
  // For each person, check if they have relationships
  // to people in different user collections
  // Return list of bridge people and connection counts
}
```

**Example:**
```
User Collections:
  "Paternal Line" (40 people)
  "Maternal Line" (35 people)

You (cr_id: abc-123):
  father: [[John Smith]]    # In Paternal Line
  mother: [[Mary Jones]]    # In Maternal Line
  collection: "My Generation"

Result: You bridge Paternal ↔ Maternal
```

**UI Feature: Cross-Collection Trees**
```
Generate Tree:
☑ Include connected collections

Collections included:
  • My Generation (root)
  • Paternal Line (via father)
  • Maternal Line (via mother)

Total: 3 collections, 115 people
```

Color-code nodes by collection in generated canvas.

---

## World-Building Support

### Current Support (Phase 1)

Collections work excellently for world-building **right now**:

```yaml
# Game of Thrones example
---
name: Sansa Stark
collection: "House Stark"

father: "[[Eddard Stark]]"
spouse1: "[[Tyrion Lannister]]"
spouse1_marriage_status: "annulled"
---

**Other Relationships:**
- Mentor: Littlefinger
- Protector: The Hound
- Rival: Cersei Lannister
```

**What Works:**
- ✅ Collections = Houses/Factions/Organizations
- ✅ Multiple marriages = Political alliances
- ✅ Cross-collection trees = Inter-faction visualization
- ✅ User collections = Custom groupings (protagonists, antagonists, etc.)

**Limitations:**
- ❌ Non-biological relationships (mentor, rival) don't show in trees
- ❌ Only parent-child-spouse relationships visualized

**Workaround:** Document other relationships in note body (Phase 1)

### Future Support (Phase 2+)

**Extended Relationships** (from specification.md §7):

```yaml
# Biological relationships (existing)
father: "[[Eddard Stark]]"

# Extended relationships (future)
extendedRelationships:
  - type: mentor
    person: "[[Varys]]"
    strength: 8
  - type: rival
    person: "[[Cersei Lannister]]"
    strength: 9
```

**Tree Generation Modes:**
- Biological family tree (default)
- Political alliance network
- Mentor-apprentice chains
- Faction loyalty map
- Custom: all relationships

**When to Implement:** Based on user demand, after core features stabilize.

---

## Implementation Phases

### **Phase 1: Collection Naming (Minimal)**

**Scope:** Support `collection_name` property for detected components

**Implementation:**
1. Modify `getFamilyComponents()` to check for `collection_name`
2. Use as display label in sidebar
3. Update documentation

**Result:**
- "Family 1" → "Smith Family" (if anyone sets collection_name)
- Zero new code beyond name lookup
- Works with existing UI

**Effort:** Low (few hours)

---

### **Phase 2: User Collections (Power Users)**

**Scope:** Add `collection` property + UI

**Implementation:**
1. Add `collection` property support to PersonNode
2. Create `getUserCollections()` method
3. Add "My collections" option to tree generation UI
4. Update Bases template with collection property
5. Add collection filtering to person browser

**Result:**
- Users can assign custom collections
- Browse/filter by user collections
- Editable in Bases
- Works alongside detected components

**Effort:** Medium (1-2 days)

---

### **Phase 3: Cross-Collection Features (Advanced)**

**Scope:** Connection detection, dashboards, multi-collection trees

**Implementation:**
1. Implement `detectCollectionConnections()`
2. Create collection dashboard view
3. Add "Include connected collections" option to tree generation
4. Color-code multi-collection canvases
5. Show bridge people in UI

**Result:**
- Visual connection maps
- Cross-collection tree generation
- Bridge person indicators
- Collection analytics

**Effort:** High (3-5 days)

---

## Edge Cases and Solutions

### **Case 1: Person in Multiple User Collections?**

**Question:** Allow `collection: ["Paternal", "Notable Figures"]`?

**Decision:** Keep simple - single collection per person (Phase 1-2)

**Rationale:**
- Simpler mental model
- Easier Bases editing
- Can add array support later if needed

---

### **Case 2: Component Name Conflicts**

**Scenario:** Multiple people set different `collection_name` values

**Solution:** Use most common name, or alphabetically first if tie

```typescript
// If 3 people say "Smith Family" and 1 says "Smith Clan"
displayName = "Smith Family"  // Most common wins
```

---

### **Case 3: User Collection Has No Detected Component**

**Scenario:** Fictional characters not in user's family tree

```yaml
collection: "Tudor Dynasty"  # Historical figures, not user's family
```

**Solution:** Works fine! User collections are independent of components.

---

### **Case 4: Cross-Collection Link Breaks**

**Scenario:** Delete relationship connecting two collections

**Solution:** Self-healing (connections are recomputed)

```
Before: You connect Paternal ↔ Maternal via parents
Delete father relationship
After: Connection Paternal ↔ You broken (only Maternal remains)
```

No stored data to update - just recompute.

---

## Testing Strategy

### **Unit Tests**

- Component detection with various graph topologies
- Name resolution with conflicts
- User collection filtering
- Connection detection

### **Integration Tests**

- Component detection in full vault
- UI updates when relationships change
- Bases editing of collection property
- Cross-collection tree generation

### **User Acceptance Tests**

- Zero-config user: Can generate trees without setting anything
- Folder user: Collections auto-named from folder hints (optional enhancement)
- Power user: Can assign custom collections and filter effectively
- World-builder: Can organize factions and generate cross-faction trees

---

## Alternatives Not Chosen

### **Automatic Folder Detection**

We could auto-detect collections from folder structure:

```typescript
// If all people in component share a top-level folder
Collection 1 auto-named: "Smith Family" (from folder Smith\ Family/)
```

**Why Not (Yet):**
- Violates "no folder requirements"
- Breaks for flat vaults
- Can be added as *optional enhancement* later

### **Tag-Based User Collections**

We could use `#collection/name` tags instead of `collection` property.

**Why Not:**
- Not visible/editable in Bases
- Many users don't use tags
- Property is cleaner for structured data

---

## References

- [Specification §3.4 Collections and Dataset Management](../specification.md#34-collections-and-dataset-management)
- [Specification §7 World-Building Features](../specification.md#7-world-building-features)
- [Development Guide](../development.md)
- [Bases Integration Guide](../bases-integration.md)

---

## Consequences

### **Positive**

- ✅ Zero configuration for basic users
- ✅ Powerful organization for advanced users
- ✅ Works with any vault structure
- ✅ Compatible with Obsidian Bases
- ✅ Self-healing (derived data always accurate)
- ✅ Supports both genealogy and world-building
- ✅ Simple mental model (relationships → components, user → collections)

### **Negative**

- ⚠️ Two concepts to explain (components vs collections)
- ⚠️ Phase 1 doesn't include full user collection UI (but works)
- ⚠️ World-building users need Phase 2+ for extended relationships

### **Neutral**

- Component detection requires graph traversal (already implemented)
- User collections are optional (users choose complexity level)

---

## Decision Outcome

**Chosen Option:** Option C - Smart Hybrid

**Rationale:**
1. Meets all requirements (no folders, no tags, zero config)
2. Supports both casual and power users
3. Preserves data integrity (computed > stored)
4. Compatible with Bases for bulk editing
5. Extensible for world-building use cases
6. Aligns with Obsidian's philosophy (notes first, structure emergent)

**Implementation Priority:**
- Phase 1: Ship with v0.2.0 (collection naming)
- Phase 2: v0.3.0 (user collections)
- Phase 3: v0.4.0+ (cross-collection features)

**Next Steps:**
1. Update specification.md §3.4 with user-facing design
2. Update development.md with implementation notes
3. Implement Phase 1 when ready
4. Gather user feedback before Phase 2

---

**Document Version:** 1.0
**Last Updated:** 2025-11-22
**Status:** Approved ✅
