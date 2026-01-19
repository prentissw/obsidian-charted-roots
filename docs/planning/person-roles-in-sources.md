# Person Roles in Source Notes

- **Status:** Planning
- **GitHub Issue:** [#219](https://github.com/banisterious/obsidian-charted-roots/issues/219)
- **Discussion:** [#189](https://github.com/banisterious/obsidian-charted-roots/discussions/189)
- **Related:** [#123](https://github.com/banisterious/obsidian-charted-roots/issues/123) (Inheritance & Succession Tracking)
- **Created:** 2026-01-19

## Problem Statement

Genealogical source documents name multiple people in different capacities (principal, witness, informant, official, etc.). Currently, Charted Roots has no structured way to track these roles, making it difficult to:

- Assess information quality (who was the informant on a death certificate?)
- Build FAN (Friends, Associates, Neighbors) networks
- Query across sources ("show all documents where Person X was a witness")
- Track enslaved individuals through legal/property records

## Proposed Solution

Add role-based person tracking to source notes with:
1. Recognized role properties in frontmatter
2. Modal UI for assigning roles when linking people
3. Dynamic block for rendering roles
4. Query/filter support

## Design Decisions

Based on discussion in #189:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scope | Source notes only | Sources are where roles are encountered; events are synthesized |
| YAML structure | Inline notation | More readable, easier to maintain than parallel arrays |
| Role vocabulary | Canonical list with freeform details | Balance between structure and flexibility |
| Terminology | "Enslaved Individuals" | Per @ANYroots' guidance |

## Role Categories

Simplified canonical list per @wilbry's proposal:

| Property | Description | Examples |
|----------|-------------|----------|
| `principals` | Subject(s) of the document | Deceased, testator, groom/bride |
| `witnesses` | Named witnesses | Signing witnesses, event witnesses |
| `informants` | Person providing information | Death certificate informant |
| `officials` | Authority figures | Clerks, judges, officiants, physicians |
| `enslaved_individuals` | Persons listed as property | Named in wills, inventories, appraisements |
| `family` | Family members of principals | Named relatives |
| `others` | Catch-all | Any role not fitting above |

## YAML Structure

Inline notation with optional parenthetical details:

```yaml
---
cr_type: source
source_type: probate
title: "Estate Inventory of John Smith Sr."
date: 1817-03-15

# Person roles
principals:
  - "[[John Smith Sr.]] (Decedent)"
officials:
  - "[[Thomas Brown]] (Administrator)"
  - "[[James Wilson]] (Appraiser)"
  - "[[Robert Davis]] (Appraiser)"
enslaved_individuals:
  - "[[Mary]]"
  - "[[Peter]]"
  - "[[Hannah]]"
family:
  - "[[John Smith Jr.]] (Heir - received Mary & Peter)"
  - "[[William Smith]] (Heir - received Hannah)"
---
```

### Parsing Strategy

Role entries follow the pattern: `[[Person Link]] (Optional Details)`

Regex for parsing:
```
^\[\[([^\]]+)\]\](?:\s*\(([^)]+)\))?$
```

- Group 1: Person wikilink target
- Group 2: Optional role details

## Implementation Phases

### Phase 1: Property Recognition

**Effort:** Low
**Scope:** Read-only recognition

- Add role properties to SourceNote interface
- Parse role entries in source note reader
- Display roles in source info panel (if exists)
- Support in Bases/DataView queries

### Phase 2: Dynamic Block Rendering

**Effort:** Medium
**Scope:** Visualization

Add `charted-roots-source-roles` dynamic block:

````markdown
```charted-roots-source-roles
source: "[[Estate Inventory of John Smith Sr.]]"
```
````

Renders as a formatted table:

| Role | Person | Details |
|------|--------|---------|
| Principal | [[John Smith Sr.]] | Decedent |
| Official | [[Thomas Brown]] | Administrator |
| Enslaved Individual | [[Mary]] | — |
| ... | ... | ... |

### Phase 3: Modal UI Integration

**Effort:** Medium-High
**Scope:** Data entry

When linking a person to a source (e.g., via person picker or source linking modal):

1. Show role dropdown/chips after person selection
2. Optional details text field
3. Auto-add to appropriate role array in frontmatter

UI mockup:
```
┌─────────────────────────────────────────┐
│ Link Person to Source                   │
├─────────────────────────────────────────┤
│ Person: [[John Smith Jr.]]              │
│                                         │
│ Role: [Heir ▼]                          │
│       ○ Principal  ○ Witness            │
│       ○ Informant  ○ Official           │
│       ○ Enslaved Individual  ○ Family   │
│       ● Other: [Heir________]           │
│                                         │
│ Details: [received Mary & Peter_______] │
│                                         │
│ [Cancel]                    [Add Link]  │
└─────────────────────────────────────────┘
```

### Phase 4: Query Support

**Effort:** Medium
**Scope:** Research tools

- "Sources by Person Role" report in Control Center
- Filter: "Show sources where [[Person X]] appears as [role]"
- Cross-reference with #123 inheritance tracking

## Files to Modify

### Phase 1
- `src/sources/types/source-types.ts` — Add role properties to SourceNote
- `src/sources/services/source-note-reader.ts` — Parse role arrays
- `src/constants/property-definitions.ts` — Register role properties

### Phase 2
- `src/dynamic-content/renderers/` — Add source-roles-renderer.ts
- `src/dynamic-content/dynamic-content-processor.ts` — Register block type

### Phase 3
- `src/ui/` — Add or extend modal for role assignment
- `src/sources/services/source-note-writer.ts` — Write role properties

### Phase 4
- `src/reports/` — Add sources-by-role report
- `src/ui/control-center.ts` — Add report to Control Center

## Connection to Inheritance Tracking (#123)

Person roles in sources provide the foundation for inheritance chain visualization:

1. Estate inventory source captures:
   - `principals: ["[[Decedent]]"]`
   - `enslaved_individuals: ["[[Mary]]", "[[Peter]]"]`
   - `family: ["[[Heir A]] (received Mary)", "[[Heir B]] (received Peter)"]`

2. Inheritance tracking (#123) can then:
   - Query sources for inheritance events
   - Build chains: Decedent → Heir → (subsequent generations)
   - Visualize property/person transfers over time

## Testing Checklist

### Phase 1
- [ ] Role properties parsed correctly from frontmatter
- [ ] Empty/missing role arrays handled gracefully
- [ ] Inline details extracted correctly
- [ ] Works with Bases/DataView queries

### Phase 2
- [ ] Dynamic block renders role table
- [ ] Handles sources with no roles
- [ ] Handles sources with many roles
- [ ] Details column shows "—" when empty

### Phase 3
- [ ] Modal shows role options
- [ ] Selected role written to correct array
- [ ] Details appended in parenthetical format
- [ ] Existing roles preserved when adding new

### Phase 4
- [ ] Report shows sources grouped by person
- [ ] Filter by role type works
- [ ] Performance acceptable with large datasets

## Future Considerations

- **Role inference:** Auto-suggest roles based on source type (death certificate → likely has informant)
- **Bidirectional linking:** Show "Sources where this person appears" on person notes
- **GEDCOM export:** Map roles to appropriate GEDCOM tags
- **Validation:** Warn if principal is missing from source

## Contributors

- @ANYroots — Original proposal, use cases, terminology guidance
- @wilbry — Simplified role categories, parallel arrays concept
