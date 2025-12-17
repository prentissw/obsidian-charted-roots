# Universe Management - Planning Document

## Overview

A dedicated modal/wizard for creating and managing fictional universes. Currently, universes are implicit - they exist as string values on places, maps, people, date systems, and schemas. This feature would formalize universes as first-class entities with their own configuration.

## Motivation

When setting up a new fictional world (e.g., Middle-earth, Westeros), users currently need to:

1. Create places with a `universe` field
2. Create a custom map with a `universe` field
3. Create a date system with a `universe` field
4. Optionally create a schema scoped to the universe
5. Remember to use the same universe string everywhere

A Universe modal would streamline this into a guided setup flow.

## Proposed Features

### Phase 1: Universe Notes

Introduce a new note type `cr_type: universe` that stores universe-level configuration:

```yaml
---
cr_type: universe
cr_id: universe-westeros
name: Westeros
description: The world of A Song of Ice and Fire
genre: fantasy
---

# Westeros

Configuration and overview for the Westeros universe.
```

**Benefits:**
- Universe becomes a linkable entity (`[[Westeros]]`)
- Central place for universe description/notes
- Foundation for future features

### Phase 2: Create Universe Modal

A modal for creating new universes with:

- **Basic info**: Name, description, genre/type
- **Quick links**: After creation, offer to create:
  - A custom map for this universe
  - A date system for this universe
  - A schema for this universe

### Phase 3: Universe Dashboard

Extend the modal to show universe statistics:

- People count in this universe
- Places count
- Maps count
- Events count
- Date systems
- Schemas

Possibly as a dedicated "Universes" tab in Control Center.

### Phase 4: Universe Setup Wizard

A multi-step wizard for comprehensive universe setup:

1. **Basic info** - Name, description, genre
2. **Calendar** - Create or link a date system
3. **Geography** - Create initial map note
4. **Schema** - Configure custom validation rules
5. **Defaults** - Set default values for new entities in this universe

## Technical Considerations

### Universe Note Schema

```typescript
interface UniverseNote {
  cr_type: 'universe';
  cr_id: string;
  name: string;
  description?: string;
  genre?: string; // fantasy, sci-fi, historical, etc.

  // Optional linked entities
  default_date_system?: string; // cr_id of date system
  default_map?: string; // cr_id of map
  default_schema?: string; // cr_id of schema
}
```

### Service Layer

New `UniverseService` to:
- Parse universe notes
- Aggregate entities by universe (people, places, maps, etc.)
- Provide universe statistics
- Validate universe consistency

### Migration

Existing universes (string values on entities) would continue to work. Universe notes are optional - they formalize and enhance but don't replace the current approach.

## UI Locations

- **Control Center > Actions**: "Create universe" button
- **Control Center**: New "Universes" tab (Phase 3)
- **Quick Switcher**: Filter by universe
- **Various dropdowns**: Universe selector could link to universe note

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `src/universe/types/universe-types.ts` | Type definitions |
| `src/universe/services/universe-service.ts` | Service layer |
| `src/universe/ui/create-universe-modal.ts` | Create/edit modal |
| `src/ui/control-center.ts` | Add button and optional tab |

## Open Questions

1. Should universe notes be required, or remain optional enhancement?
2. How to handle universe renaming (update all references)?
3. Should universes support hierarchy (sub-universes, e.g., "Star Wars > Old Republic")?
4. Integration with folder structure (universe-specific folders)?

## Related Features

- [Calendarium Integration](archive/calendarium-integration.md) - Date systems per universe
- [Schema Validation](../Release-History.md#schema-validation-v063) - Universe-scoped schemas
- [Custom Relationship Types](../Release-History.md#custom-relationship-types-v070) - Universe-specific relationships

## Status

**📋 Draft** - Initial planning, not yet scheduled
