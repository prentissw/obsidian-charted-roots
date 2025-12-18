# Universe Setup Wizard - Planning Document

## Overview

A guided wizard for setting up fictional universes. Currently, setting up a new world requires discovering and navigating multiple disconnected features. This wizard consolidates universe creation into a single, guided flow.

## Problem

When setting up a new fictional world (e.g., Middle-earth, Westeros), users currently need to:

1. Discover that date systems exist and create one
2. Find the maps feature and create a custom map
3. Learn about schemas and create validation rules
4. Remember to use the same universe string everywhere

These features are spread across different parts of the plugin. New users feel confused and overwhelmed.

## Solution

A "Create Universe" wizard accessible from Control Center that guides users through setting up all universe-related features in one place.

## Wizard Flow

### Step 1: Name Your Universe
- Universe name (required) - e.g., "Westeros", "Middle-earth"
- Description (optional)

### Step 2: Calendar System
"Would you like a custom calendar for this universe?"
- Yes → Opens date system creation with universe pre-filled
- Skip → Continue without calendar

### Step 3: Custom Map
"Would you like a custom map for this universe?"
- Yes → Opens map note creation with universe pre-filled
- Skip → Continue without map

### Step 4: Validation Rules
"Would you like custom validation rules (schema) for this universe?"
- Yes → Opens schema creation scoped to universe
- Skip → Continue without schema

### Step 5: Summary
Shows what was created with links to each:
- ✓ Universe: Westeros
- ✓ Date system: Westerosi Calendar
- ✓ Map: Westeros Map
- ○ Schema: (skipped)

Optionally generates a universe note as a landing page linking to everything.

## Technical Approach

### No New Entity Type Required

The wizard creates existing entity types with the `universe` field pre-populated:
- Date system notes (`cr_type: date_system`)
- Map notes (`cr_type: map`)
- Schema notes (`cr_type: schema`)

The universe itself remains a string value - no new `cr_type: universe` needed for MVP.

### Optional Universe Note

At the end, optionally create a simple markdown note (not a new cr_type) that serves as documentation:

```markdown
# Westeros

## Created Entities
- [[Westerosi Calendar]] - Date system
- [[Westeros Map]] - Custom map

## Notes
(User can add their own notes about the universe here)
```

## UI Location

- **Control Center > Actions tab**: "Create universe" button
- Opens multi-step modal wizard

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/ui/universe-wizard.ts` | New wizard modal |
| `src/ui/control-center.ts` | Add "Create universe" button |

## Implementation Notes

- Reuse existing creation modals/forms for each step where possible
- Each step should be skippable
- Back navigation to previous steps
- Progress indicator showing current step

## Future Enhancements (Out of Scope for MVP)

- Universe dashboard with entity counts
- Universe-scoped quick switcher filtering
- Batch operations scoped to universe
- Universe hierarchy (sub-universes)

## Related Features

- [Date Systems](../user-guide/date-systems.md)
- [Custom Maps](../user-guide/maps.md)
- [Schema Validation](../user-guide/schemas.md)

## Status

**📋 Draft** - Initial planning, not yet scheduled
