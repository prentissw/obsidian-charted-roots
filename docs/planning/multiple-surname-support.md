# Plan: Multiple Surname Support (Issue #174)

- **Status:** Planning
- **GitHub Issue:** [#174](https://github.com/banisterious/obsidian-charted-roots/issues/174)
- **GitHub Discussion:** [#171](https://github.com/banisterious/obsidian-charted-roots/discussions/171)

---

## Overview

Support explicit surname properties in frontmatter to handle naming conventions beyond Western "First Last" format. This enables accurate surname statistics for Hispanic, Portuguese, compound, and other multi-surname cultures.

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
            const surname = parts[parts.length - 1];  // ← Only last word
            surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1);
        }
    }
    // ...
}
```

**Problem:** "José García López" → only "López" counted, "García" ignored.

### GEDCOM Import

**File:** `src/gedcom/gedcom-parser-v2.ts:660-661`

```typescript
case 'SURN':
    individual.surname = value;
    break;
```

The `SURN` tag is parsed but **not written to frontmatter** - it's only used internally.

## Proposed Solution

### New Frontmatter Properties

| Property | Type | Description |
|----------|------|-------------|
| `surname` | string | Single surname (Western, compound) |
| `surnames` | string[] | Multiple surnames (Hispanic, Portuguese) |
| `givenName` | string | Given/first name(s) |

**Examples:**

```yaml
# Hispanic (two surnames)
name: "José García López"
surnames:
  - García
  - López

# Compound surname
name: "Maria da Silva"
surname: "da Silva"

# Western (explicit)
name: "John Smith"
surname: "Smith"

# Western (implicit - parsed from name, no property needed)
name: "John Smith"
```

### Property Priority

When computing statistics:

1. If `surnames` array exists → count each surname
2. Else if `surname` string exists → count that surname
3. Else → fall back to parsing last word from `name`

## Implementation Plan

### Phase 1: Frontmatter Properties & Statistics

#### 1.1 Add Property Aliases

**File:** `src/core/property-alias-service.ts`

Add `surname`, `surnames`, `givenName` to recognized properties.

#### 1.2 Update Statistics Service

**File:** `src/statistics/services/statistics-service.ts`

```typescript
private computeTopSurnames(people: PersonNode[], limit: number): TopListItem[] {
    const surnameCount = new Map<string, number>();

    for (const person of people) {
        const surnames = this.extractSurnames(person);
        for (const surname of surnames) {
            surnameCount.set(surname, (surnameCount.get(surname) ?? 0) + 1);
        }
    }

    return Array.from(surnameCount.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);
}

private extractSurnames(person: PersonNode): string[] {
    // Priority 1: Explicit surnames array
    if (person.surnames && Array.isArray(person.surnames) && person.surnames.length > 0) {
        return person.surnames;
    }

    // Priority 2: Explicit surname string
    if (person.surname && typeof person.surname === 'string') {
        return [person.surname];
    }

    // Priority 3: Parse from name (last word)
    if (person.name) {
        const parts = person.name.trim().split(/\s+/);
        if (parts.length > 1) {
            return [parts[parts.length - 1]];
        }
    }

    return [];
}
```

#### 1.3 Update PersonNode Type

**File:** `src/core/family-graph-service.ts` (or types file)

Add optional properties to PersonNode interface:

```typescript
interface PersonNode {
    // ... existing properties
    surname?: string;
    surnames?: string[];
    givenName?: string;
}
```

#### 1.4 Update getPeopleBySurname

**File:** `src/statistics/services/statistics-service.ts:724`

Update to use the same `extractSurnames()` logic for consistency.

### Phase 2: GEDCOM Import

#### 2.1 Write Surname to Frontmatter

**File:** `src/gedcom/gedcom-importer-v2.ts`

When creating PersonData, include surname if parsed:

```typescript
const personData: PersonData = {
    // ... existing fields
    surname: individual.surname,  // From GEDCOM SURN tag
    givenName: individual.givenName,  // From GEDCOM GIVN tag
};
```

#### 2.2 Update Person Note Writer

Ensure `surname` and `givenName` are written to frontmatter when present.

### Phase 3: UI Modals

#### 3.1 Create Person Modal

Add optional surname field(s):

- Single text input for `surname`
- Or: Detect if user enters multiple (comma-separated?) and store as `surnames` array

#### 3.2 Edit Person Modal

Display and allow editing of `surname`/`surnames` properties.

#### 3.3 Family Creation Wizard

Consider adding surname field to person creation steps.

### Phase 4: Export

#### 4.1 GEDCOM Export

Write `surname` back to `SURN` tag:

```gedcom
1 NAME José /García López/
2 GIVN José
2 SURN García López
```

Or for multiple surnames, concatenate with space.

#### 4.2 Other Exporters

Review Gramps, CSV, GedcomX exporters for surname handling.

## Test Cases

### Statistics

| Person Name | surname | surnames | Expected Counts |
|-------------|---------|----------|-----------------|
| José García López | - | ["García", "López"] | García +1, López +1 |
| Maria da Silva | "da Silva" | - | da Silva +1 |
| John Smith | - | - | Smith +1 (parsed) |
| John Smith | "Smith" | - | Smith +1 (explicit) |

### GEDCOM Import

```gedcom
1 NAME José /García López/
2 GIVN José
2 SURN García López
```

Should produce:
```yaml
name: "José García López"
surname: "García López"
givenName: "José"
```

Note: GEDCOM `SURN` is a single field, so multiple surnames would be space-separated. The plugin could optionally split on space, but this risks breaking compound surnames like "da Silva". Consider a setting or leave as single string.

## Edge Cases

1. **Compound surnames with particles**: "da Silva", "van der Berg", "de la Cruz" - should not be split
2. **Hyphenated surnames**: "García-López" - single surname or two?
3. **Empty surname**: Some cultures use single names - handle gracefully
4. **Mixed data**: Some people have explicit surnames, others don't - both should work
5. **Case sensitivity**: "Smith" vs "smith" in statistics - normalize for counting

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/statistics/services/statistics-service.ts` | Modify | Use explicit surnames, add extractSurnames() |
| `src/core/property-alias-service.ts` | Modify | Add surname/surnames/givenName aliases |
| `src/gedcom/gedcom-importer-v2.ts` | Modify | Write surname to frontmatter |
| `src/ui/create-person-modal.ts` | Modify | Add surname input field |
| `src/ui/edit-person-modal.ts` | Modify | Add surname editing |
| `src/gedcom/gedcom-exporter.ts` | Modify | Export surname to SURN tag |

## Future Considerations

- **Naming convention setting**: Could add a setting for default parsing behavior (Western, Hispanic, etc.) for users who don't want to set explicit surnames
- **Maiden/married names**: Related but separate feature - tracking name changes over time
- **Patronymic systems**: Icelandic, Russian - different patterns entirely
- **Display preferences**: Show "García López, José" vs "José García López"

## References

- [World naming conventions map](https://github.com/banisterious/obsidian-charted-roots/discussions/171) (attached to discussion)
- GEDCOM 5.5.1: NAME structure with GIVN and SURN subtags
- Statistics service: `src/statistics/services/statistics-service.ts`
