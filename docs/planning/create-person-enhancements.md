# Create Person Enhancements

Planning document for enhancing person creation and editing workflows.

**Status:** Planning
**GitHub Issue:** #TBD
**Created:** 2025-12-18
**Updated:** 2025-12-26

---

## Overview

The core problem: **Building a family tree from scratch requires constant jumping in and out of modals.**

A new user scenario illustrates this:
> "I know my wife, I know my kids, I know my parents. Who should I create first? I was hoping to start with anyone and create additional parents/kids up and down the tree without having to save and exit out of the screen for the person you are editing/creating, click another edit/create button, look up another person, edit them, jump out of that screen to go look up another person, jumping round and round."

The current workflow forces users into a tedious loop:
1. Create Person A → Save → Close
2. Create Person B → Save → Close
3. Edit Person A to link B as spouse → Save → Close
4. Create Child C → Save → Close
5. Edit Child C to set parents → Save → Close
6. ...repeat endlessly

**Goal:** Enable continuous family creation without leaving the modal flow.

---

## Phase 1: Inline Person Creation ✅ Planned

Allow creating new family members directly from within the Create/Edit Person modal.

### Core Feature: "Create New" in Person Pickers

When selecting a father, mother, spouse, or child, offer a "Create new person" option that:
1. Opens a sub-modal to create the new person
2. Automatically creates the note
3. Returns to the parent modal with the new person linked
4. User never loses context of who they're editing

### Scope

1. **Inline creation for all relationship fields**
   - Father picker: "Create new father" option
   - Mother picker: "Create new mother" option
   - Spouse picker: "Create new spouse" option
   - Children picker: "Create new child" option

2. **Smart defaults for new inline persons**
   - Creating a father → pre-fill `sex: male`
   - Creating a mother → pre-fill `sex: female`
   - Creating a child → pre-fill parent link back to current person
   - Creating a spouse → pre-fill spouse link back to current person

3. **Streamlined sub-modal**
   - Minimal fields: name, sex (pre-filled where applicable), birth date (optional)
   - "Create and link" button returns to parent modal
   - Skip the full modal complexity for quick inline creation

### Implementation Notes

- Extend PersonPickerModal to include "Create new..." option at top/bottom
- Sub-modal can be a simplified version of CreatePersonModal
- On sub-modal completion, refresh the picker and auto-select the new person
- Bidirectional linking happens automatically via existing linker

### Open Questions

1. Should the sub-modal be a full CreatePersonModal or a simplified "quick create" version?
2. How deep should nesting go? (Creating a child, then creating that child's spouse, etc.)
3. Should we show a "recent creations" section in the picker for easy access to just-created people?

---

## Phase 2: Add Children Section to Edit Modal

Add the ability to view and manage children directly from the Edit Person modal.

### Context

- The plugin already has `child` frontmatter property and bidirectional linking
- Setting `father: [[John]]` on Jane's note automatically adds `[[Jane]]` to John's `child` array
- Users want to link existing children from the parent's perspective (batch operation)
- Combined with Phase 1, this enables creating new children inline

### Scope

1. **Children section in Edit mode**
   - Add "Children" section with multi-select person picker
   - Display currently linked children (from `child` array)
   - Allow adding existing children or creating new ones (via Phase 1)
   - Consider showing in Create mode too for "create whole family" workflow

2. **Parent field auto-detection**
   - When adding children, auto-detect which parent field to set based on parent's `sex` field
   - Male → set child's `father` field
   - Female → set child's `mother` field
   - Unknown/other → prompt user to choose

3. **Bidirectional sync**
   - Adding child to parent's `child` array triggers bidirectional linker
   - Child's `father`/`mother` field updated automatically
   - Removing child updates both directions

### Implementation Notes

- Reuse existing PersonPickerModal with multi-select support
- Similar pattern to existing spouses field
- Consider filtering candidates (people without this person as parent already)

### Open Questions

1. Should we filter candidate children to exclude people already linked to another parent of the same type?
2. Should there be a confirmation when adding many children at once?

---

## Phase 3: "Add Another" Flow (Future)

After creating a person, offer quick actions to continue building the family.

### Concept

When user clicks "Create" (not "Create and Close"), show options:
- **Add spouse** → Opens spouse picker/creator, then returns
- **Add child** → Opens child picker/creator, then returns
- **Add parent** → Opens parent picker/creator, then returns
- **Done** → Closes modal

This keeps the user in a "family building" flow without requiring them to navigate back to find the person they just created.

### Benefits

- Natural workflow: "I just created John, now let me add his wife and kids"
- Reduces navigation and context-switching
- Builds on Phase 1 and 2 infrastructure

---

## Phase 4: Family Creation Wizard (Future)

A dedicated wizard for creating an entire nuclear family at once.

### Motivation

For users starting completely fresh, a guided flow could be faster:
1. **Step 1:** Create yourself (or central person)
2. **Step 2:** Add spouse(s)
3. **Step 3:** Add children
4. **Step 4:** Add parents
5. **Review:** See the family structure, confirm and create all notes

### Alternative: Tabbed Modal

Instead of a full wizard, consider a tabbed modal for the Create/Edit Person form:
- Keeps everything in one place
- Organized into collapsible/tabbed sections
- Less disruptive than step-by-step wizard
- Better for quick edits

### Proposed Sections (if tabbed)

| Section | Fields |
|---------|--------|
| **Basic** | Name, sex, nicknames, cr_id |
| **Dates & Places** | Birth date + place, death date + place, living status |
| **Family** | Father, mother, spouses, children |
| **Extended** | Occupations, custom relationships, sources |
| **Options** | Target folder, filename format, dynamic blocks |

### When to Implement

This becomes valuable when:
- Modal complexity continues to grow
- Users report feeling overwhelmed by the form
- Need to add more relationship types or source linking
- Mobile users need simplified entry flow

---

## Completed Enhancements

### Place Picker Integration ✅ (v0.14.x)

- Added place picker for birth/death places
- Link button opens place picker modal
- Create new place inline if none exists
- Dual storage: wikilink in `birth_place`, cr_id in `birth_place_id`

### Field Reordering ✅ (v0.14.x)

- Grouped related fields logically:
  - Birth date + Birth place
  - Death date + Death place

---

## Related Documents

- [Frontmatter Reference](../../wiki-content/Frontmatter-Reference.md) - Property documentation
- [Data Entry](../../wiki-content/Data-Entry.md) - Current documentation
- [Bidirectional Linking](../../wiki-content/Relationship-Tools.md) - How relationships sync
