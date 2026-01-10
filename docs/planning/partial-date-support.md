# Plan: Partial Date Support (Issue #172)

- **Status:** Planning
- **GitHub Issue:** [#172](https://github.com/banisterious/obsidian-charted-roots/issues/172)
- **GitHub Discussion:** [#170](https://github.com/banisterious/obsidian-charted-roots/discussions/170)

---

## Overview

Preserve date precision throughout the plugin instead of normalizing partial dates to full ISO format. Currently `1850` becomes `1850-01-01`, adding false precision. Users need to distinguish between "born January 1, 1850" and "born sometime in 1850".

## Current Behavior

### Normalization Points

| Location | File | Function | Behavior |
|----------|------|----------|----------|
| GEDCOM import | `gedcom-parser.ts:443` | `gedcomDateToISO()` | `1850` → `1850-01-01` |
| Event edit modal | `edit-event-modal.ts` | date field save | Re-normalizes on save |
| Person modals | Various | date field save | Likely same issue |

### GEDCOM Date Formats

| Format | Example | Current Storage | Desired Storage |
|--------|---------|-----------------|-----------------|
| Year only | `1850` | `1850-01-01` | `1850` |
| Month + year | `MAR 1855` | `1855-03-01` | `1855-03` or `MAR 1855` |
| Full date | `15 MAR 1855` | `1855-03-15` | `1855-03-15` |
| Approximate | `ABT 1878` | `1878-01-01` | `ABT 1878` |
| Before | `BEF 1950` | `1950-01-01` | `BEF 1950` |
| After | `AFT 1880` | `1880-01-01` | `AFT 1880` |
| Range | `BET 1882 AND 1885` | unclear | `BET 1882 AND 1885` |
| Calculated | `CAL 1945` | `1945-01-01` | `CAL 1945` |
| Estimated | `EST 1880` | `1880-01-01` | `EST 1880` |

### Downstream Handling

`DateService.extractStandardYear()` already handles partial dates correctly:
- Extracts year from `1850`, `ABT 1878`, `BET 1882 AND 1885`, etc.
- Sets `isApproximate` flag for qualified dates
- Used by age calculation, timeline sorting, display

The problem is upstream (storage), not downstream (usage).

## Proposed Solution

### Storage Format Decision

**Option A: Preserve raw strings (Recommended)**

Store dates exactly as entered/imported:

```yaml
born: "1850"
died: "MAR 1920"
married: "ABT 1875"
```

**Pros:**
- Preserves user intent and source fidelity
- DateService already handles these formats
- GEDCOM round-trip works naturally
- Simple to implement

**Cons:**
- Less consistent frontmatter format
- External tools expecting ISO may not parse

**Option B: Hybrid ISO with precision suffix**

```yaml
born: "1850"           # Year only (no suffix needed)
died: "1920-03"        # Month + year (ISO partial)
married: "~1875"       # Approximate
```

**Pros:**
- Closer to ISO standard
- More parseable by external tools

**Cons:**
- Loses GEDCOM qualifier vocabulary (ABT vs EST vs CAL)
- Requires mapping logic

**Decision: Option A** - Preserve raw strings. Matches GEDCOM vocabulary, simplest implementation, DateService already supports it.

## Implementation Plan

### Phase 1: GEDCOM Import

#### 1.1 Modify `gedcomDateToISO()`

**File:** `src/gedcom/gedcom-parser.ts`

Current behavior:
```typescript
// Year only → fabricates month/day
if (match3) {
    return `${match3[1]}-01-01`;
}
```

New behavior:
```typescript
// Year only → preserve as-is
if (match3) {
    return match3[1];
}
```

Full changes:
- Year only (`1850`) → return `1850`
- Month + year (`MAR 1855`) → return `1855-03` (ISO partial) or `MAR 1855` (raw)
- Full date (`15 MAR 1855`) → return `1855-03-15` (unchanged)
- Qualifiers (`ABT`, `BEF`, `AFT`, `CAL`, `EST`) → preserve prefix

#### 1.2 Rename Function

Consider renaming `gedcomDateToISO()` to `normalizeGedcomDate()` since output is no longer strictly ISO.

#### 1.3 Update Importer

**File:** `src/gedcom/gedcom-importer-v2.ts:688`

No changes needed if `gedcomDateToISO()` returns appropriate format.

### Phase 2: UI Modals

#### 2.1 Audit Date Fields

Identify all modals that save date fields:
- [ ] `create-person-modal.ts`
- [ ] `quick-create-person-modal.ts`
- [ ] `edit-person-modal.ts`
- [ ] `create-event-modal.ts`
- [ ] `edit-event-modal.ts`
- [ ] `family-creation-wizard.ts`
- [ ] `extract-events-modal.ts`

#### 2.2 Remove Normalization

For each modal:
- Remove any date normalization/conversion on save
- Store the raw user input
- Validate only that DateService can extract a year (for required fields)

#### 2.3 Update Placeholders

Update placeholder text to indicate accepted formats:
```
"YYYY, YYYY-MM, YYYY-MM-DD, or ABT/BEF/AFT YYYY"
```

### Phase 3: Display Formatting

#### 3.1 Review Display Points

Check how dates are displayed throughout UI:
- Person cards/lists
- Event lists
- Timeline blocks
- Interactive family chart
- Statistics/reports

#### 3.2 Format for Display

`DateService.formatDate()` already returns raw string for standard dates. May want to prettify:
- `ABT 1878` → "c. 1878" or "about 1878"
- `BEF 1950` → "before 1950"
- `AFT 1880` → "after 1880"
- `BET 1882 AND 1885` → "1882–1885"

This is optional polish - raw strings are acceptable.

### Phase 4: Export Round-Trip

#### 4.1 GEDCOM Export

Verify dates export correctly:
- `1850` → `2 DATE 1850`
- `ABT 1878` → `2 DATE ABT 1878`
- `1855-03-15` → `2 DATE 15 MAR 1855`

#### 4.2 Other Exporters

Review Gramps, CSV, GedcomX exporters for date handling.

## Test Cases

### Test File

`tests/fixtures/gedcom/gedcom-sample-small-year-only.ged`

### Expected Results After Import

| Person | GEDCOM Date | Expected Frontmatter |
|--------|-------------|----------------------|
| John Smith | `1850` | `born: "1850"` |
| Mary Jones | `MAR 1855` | `born: "1855-03"` or `born: "MAR 1855"` |
| William Smith | `ABT 1878` | `born: "ABT 1878"` |
| Elizabeth Smith | `AFT 1880` | `born: "AFT 1880"` |
| Thomas Smith | `BET 1882 AND 1885` | `born: "BET 1882 AND 1885"` |
| Sarah Brown | `EST 1880` | `born: "EST 1880"` |
| Robert Smith | `15 JUN 1905` | `born: "1905-06-15"` |
| Margaret Smith | `JUL 1908` | `born: "1908-07"` or `born: "JUL 1908"` |

### Unit Tests

Add tests to verify:
- `DateService.parseDate()` handles all formats
- `DateService.extractStandardYear()` extracts years correctly
- `DateService.isApproximateDate()` detects qualifiers
- Age calculation works with partial dates
- Timeline sorting works with partial dates

## Key Files

| File | Action | Purpose |
|------|--------|---------|
| `src/gedcom/gedcom-parser.ts` | Modify | Change `gedcomDateToISO()` to preserve precision |
| `src/gedcom/gedcom-parser-v2.ts` | Modify | Update if it has its own date handling |
| `src/ui/create-event-modal.ts` | Modify | Remove date normalization |
| `src/ui/edit-event-modal.ts` | Modify | Remove date normalization |
| `src/ui/create-person-modal.ts` | Audit | Check for date normalization |
| `src/dates/services/date-service.ts` | Audit | Verify handles all formats (likely no changes) |
| `tests/fixtures/gedcom/gedcom-sample-small-year-only.ged` | Created | Test file with partial dates |

## Edge Cases

1. **Empty month/day in ISO format**: User enters `1850-00-00` - treat as year-only
2. **Mixed formats in same vault**: Some notes have `1850-01-01`, others have `1850` - both should work
3. **Manual frontmatter edits**: User changes `1850-01-01` to `1850` - should be preserved
4. **BCE dates**: `500 BCE` or `-500` - ensure year extraction works
5. **Date ranges with qualifiers**: `ABT BET 1880 AND 1885` - unlikely but handle gracefully

## Migration Considerations

- No migration needed for existing vaults
- Users who want to clean up fabricated dates can manually edit frontmatter
- Could offer a data quality check: "Dates that may have false precision (January 1)" - but this risks false positives for people actually born on January 1

## Out of Scope

- Date picker UI (complex, would require partial date picker)
- Displaying precision indicators in UI (e.g., "~" icon for approximate dates)
- Automated migration of existing `YYYY-01-01` dates to `YYYY`
- Supporting non-Gregorian calendars (separate feature)

## References

- [GEDCOM 5.5.1 Date Specification](https://www.gedcom.org/gedcom.html)
- DateService: `src/dates/services/date-service.ts`
- Test file: `tests/fixtures/gedcom/gedcom-sample-small-year-only.ged`
