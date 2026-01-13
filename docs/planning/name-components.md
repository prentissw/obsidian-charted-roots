# Plan: Name Components Support

- **Status:** Planning
- **GitHub Issues:** [#174](https://github.com/banisterious/obsidian-charted-roots/issues/174), [#192](https://github.com/banisterious/obsidian-charted-roots/issues/192)
- **GitHub Discussion:** [#171](https://github.com/banisterious/obsidian-charted-roots/discussions/171), [#190](https://github.com/banisterious/obsidian-charted-roots/discussions/190)

---

## Overview

Support explicit name component properties in frontmatter to handle:

1. **Multiple surnames** (#174): Hispanic, Portuguese, and other multi-surname naming conventions
2. **Maiden/married names** (#190): Tracking birth surnames and married surnames separately

These features share common infrastructure (property definitions, statistics, Split Wizard, GEDCOM) and should be implemented together for consistency.

## Current Behavior

### Surname Extraction

**File:** `src/statistics/services/statistics-service.ts:471-487`

```typescript
private computeTopSurnames(people: PersonNode[], limit: number): TopListItem[] {
    const surnameCount = new Map<string, number>();
    for (const person of people) {
        if (!person.name) continue;
        const parts = person.name.trim().split(/\s+/);
        if (parts.length > 1) {
            const surname = parts[parts.length - 1];  // Only last word
            surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1);
        }
    }
    // ...
}
```

**Problem:** "José García López" → only "López" counted, "García" ignored.

### Maiden Name

**File:** `src/core/property-alias-service.ts:324`

The `maiden_name` property exists with aliases (`birth_name`, `birth_surname`, `née`), but:
- Not included in `PersonData` interface or Create Person modal
- Only used by Split Wizard for surname matching
- No corresponding `married_name` property exists

### GEDCOM Import

**File:** `src/gedcom/gedcom-parser-v2.ts:660-661`

The `SURN` and `GIVN` tags are parsed but **not written to frontmatter** - only used internally.

## Proposed Solution

### New Frontmatter Properties

| Property | Type | Description | Use Case |
|----------|------|-------------|----------|
| `given_name` | string | First/given name(s) | GEDCOM GIVN tag |
| `surname` | string | Primary surname | Western names, compound surnames |
| `surnames` | string[] | Multiple surnames | Hispanic, Portuguese conventions |
| `maiden_name` | string | Birth surname | Already exists as alias |
| `married_name` | string | Married surname | Single marriage |
| `married_names` | string[] | Multiple married surnames | Multiple marriages |

### Naming Convention Flexibility

Users can choose their preferred primary name convention:

**Convention A: Married name as primary (traditional)**
```yaml
name: "Jane Smith"           # Current/married name
maiden_name: "Jones"         # Birth surname
```

**Convention B: Maiden name as primary (stable identifier)**
```yaml
name: "Jane Jones"           # Birth name (stable)
married_name: "Smith"        # Married surname
married_names:               # Or multiple marriages
  - "Smith"
  - "Williams"
```

**Convention C: Hispanic dual surnames**
```yaml
name: "José García López"
surnames:
  - García                   # Paternal surname
  - López                    # Maternal surname
```

**Convention D: Compound surname**
```yaml
name: "Maria da Silva"
surname: "da Silva"          # Explicit to avoid parsing errors
```

### Property Priority for Statistics

When computing surname statistics:

1. If `surnames` array exists → count each surname
2. Else if `surname` string exists → count that surname
3. Else if `maiden_name` exists → count that (for maiden-name-primary users)
4. Else → fall back to parsing last word from `name`

## Implementation Plan

### Phase 1: Core Properties & Statistics

#### 1.1 Add Property Aliases

**File:** `src/core/property-alias-service.ts`

Add to `CANONICAL_PROPERTIES` and `PROPERTY_DEFINITIONS`:
- `given_name` (aliases: `first_name`, `forename`)
- `surname` (aliases: `last_name`, `family_name`)
- `surnames` (no aliases)
- `married_name` (aliases: `married_surname`)
- `married_names` (no aliases)

Note: `maiden_name` already exists with aliases.

#### 1.2 Create Name Utilities

**New file:** `src/utils/name-utils.ts`

```typescript
/**
 * Extract surnames from a person for statistics and grouping
 */
export function extractSurnames(person: PersonNode): string[] {
    // Priority 1: Explicit surnames array
    if (person.surnames?.length) {
        return person.surnames;
    }

    // Priority 2: Explicit surname string
    if (person.surname) {
        return [person.surname];
    }

    // Priority 3: Maiden name (for users who use maiden name as primary)
    if (person.maidenName) {
        return [person.maidenName];
    }

    // Priority 4: Parse from name (last word)
    if (person.name) {
        const parts = person.name.trim().split(/\s+/);
        if (parts.length > 1) {
            return [parts[parts.length - 1]];
        }
    }

    return [];
}

/**
 * Extract all name variants for a person (for comprehensive matching)
 */
export function extractAllSurnames(person: PersonNode): string[] {
    const surnames = new Set<string>();

    // Add explicit surnames
    if (person.surnames?.length) {
        person.surnames.forEach(s => surnames.add(s));
    }
    if (person.surname) {
        surnames.add(person.surname);
    }

    // Add maiden name
    if (person.maidenName) {
        surnames.add(person.maidenName);
    }

    // Add married names
    if (person.marriedNames?.length) {
        person.marriedNames.forEach(s => surnames.add(s));
    }
    if (person.marriedName) {
        surnames.add(person.marriedName);
    }

    // Fallback: parse from name
    if (surnames.size === 0 && person.name) {
        const parts = person.name.trim().split(/\s+/);
        if (parts.length > 1) {
            surnames.add(parts[parts.length - 1]);
        }
    }

    return Array.from(surnames);
}
```

#### 1.3 Update Statistics Service

**File:** `src/statistics/services/statistics-service.ts`

Replace inline surname parsing with `extractSurnames()` from name-utils.

#### 1.4 Update PersonNode Type

**File:** `src/models/person.ts`

```typescript
interface PersonNode {
    // ... existing properties

    // Name components
    givenName?: string;
    surname?: string;
    surnames?: string[];
    maidenName?: string;      // Already may exist
    marriedName?: string;
    marriedNames?: string[];
}
```

#### 1.5 Update Family Graph Service

**File:** `src/core/family-graph.ts`

Parse new properties from frontmatter in `extractPersonNode()`.

### Phase 2: Split Wizard Integration

#### 2.1 Update Surname Matching

**File:** `src/ui/split-wizard-modal.ts`

The Split Wizard currently uses maiden_name for matching. Update to use `extractAllSurnames()` for more comprehensive matching:

```typescript
// Before: Only checked maiden_name
if (person.maidenName === targetSurname) { ... }

// After: Check all surname variants
const surnames = extractAllSurnames(person);
if (surnames.includes(targetSurname)) { ... }
```

#### 2.2 Surname Split Preview

Update the surname split preview to show all surname variants, not just parsed surnames.

### Phase 3: GEDCOM Import

#### 3.1 Write Name Components to Frontmatter

**File:** `src/gedcom/gedcom-importer-v2.ts`

When creating PersonData, include parsed name components:

```typescript
const personData: PersonData = {
    // ... existing fields
    surname: individual.surname,      // From GEDCOM SURN tag
    givenName: individual.givenName,  // From GEDCOM GIVN tag
};
```

#### 3.2 Update Person Note Writer

**File:** `src/core/person-note-writer.ts`

Add `surname`, `given_name`, `married_name`, `married_names` to PersonData interface and write to frontmatter when present.

### Phase 4: UI Modals

#### 4.1 Create Person Modal

**File:** `src/ui/create-person-modal.ts`

Add optional fields:
- Given name (text input)
- Surname (text input)
- Additional surnames (for multi-surname cultures, optional)

#### 4.2 Edit Person Modal

**File:** `src/ui/edit-person-modal.ts`

Display and allow editing of all name component properties.

### Phase 5: Export

#### 5.1 GEDCOM Export

**File:** `src/gedcom/gedcom-exporter.ts`

Write name components to appropriate GEDCOM tags:

```gedcom
1 NAME José /García López/
2 GIVN José
2 SURN García López
```

#### 5.2 Other Exporters

Review Gramps, CSV, GedcomX exporters for name component handling.

## Test Cases

### Statistics

| Person Name | surname | surnames | maiden_name | Expected Counts |
|-------------|---------|----------|-------------|-----------------|
| José García López | - | ["García", "López"] | - | García +1, López +1 |
| Maria da Silva | "da Silva" | - | - | da Silva +1 |
| John Smith | - | - | - | Smith +1 (parsed) |
| Jane Smith | - | - | "Jones" | Jones +1 (maiden primary) |
| Jane Jones | "Smith" | - | - | Smith +1 (explicit) |

### Split Wizard Surname Matching

| Person | surname | maiden_name | married_name | Matches "Jones"? |
|--------|---------|-------------|--------------|------------------|
| Jane Smith | - | "Jones" | - | Yes |
| Jane Jones | - | - | "Smith" | Yes |
| Jane Jones-Smith | "Jones-Smith" | - | - | No (exact match) |

### GEDCOM Import

```gedcom
1 NAME José /García López/
2 GIVN José
2 SURN García López
```

Should produce:
```yaml
name: "José García López"
given_name: "José"
surname: "García López"
```

## Edge Cases

1. **Compound surnames with particles**: "da Silva", "van der Berg", "de la Cruz" - should not be split
2. **Hyphenated surnames**: "García-López" - treat as single surname unless explicit `surnames` array
3. **Empty surname**: Some cultures use single names - handle gracefully
4. **Mixed data**: Some people have explicit surnames, others don't - both should work
5. **Case sensitivity**: "Smith" vs "smith" in statistics - normalize for counting
6. **Conflicting properties**: If both `surname` and `surnames` exist, `surnames` takes priority

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/utils/name-utils.ts` | Create | Shared surname extraction utilities |
| `src/statistics/services/statistics-service.ts` | Modify | Use extractSurnames() |
| `src/core/property-alias-service.ts` | Modify | Add new property aliases |
| `src/core/family-graph.ts` | Modify | Parse name components from frontmatter |
| `src/models/person.ts` | Modify | Add name component properties to PersonNode |
| `src/ui/split-wizard-modal.ts` | Modify | Use extractAllSurnames() for matching |
| `src/gedcom/gedcom-importer-v2.ts` | Modify | Write name components to frontmatter |
| `src/core/person-note-writer.ts` | Modify | Support writing name components |
| `src/ui/create-person-modal.ts` | Modify | Add name component input fields |
| `src/ui/edit-person-modal.ts` | Modify | Add name component editing |
| `src/gedcom/gedcom-exporter.ts` | Modify | Export name components to GEDCOM |

## Future Considerations

- **Naming convention setting**: Default parsing behavior (Western, Hispanic, etc.)
- **Patronymic systems**: Icelandic, Russian - different patterns entirely
- **Display preferences**: "García López, José" vs "José García López"
- **Name change timeline**: Track when names changed (marriage dates, etc.)
- **Prefix/suffix support**: "Dr.", "Jr.", "III", etc.

## References

- [World naming conventions map](https://github.com/banisterious/obsidian-charted-roots/discussions/171) (attached to discussion)
- [Discussion #190: Naming conventions for married women](https://github.com/banisterious/obsidian-charted-roots/discussions/190)
- GEDCOM 5.5.1: NAME structure with GIVN and SURN subtags
- Statistics service: `src/statistics/services/statistics-service.ts`
- Split Wizard: `src/ui/split-wizard-modal.ts`
