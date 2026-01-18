# Inheritance & Succession Tracking

Planning document for [#123](https://github.com/banisterious/obsidian-charted-roots/issues/123).

---

## Overview

Track inheritance and succession relationships—applicable to both genealogical research (estate/property inheritance, enslaved ancestor tracking) and fictional worldbuilding (titles, thrones, positions).

**Design Philosophy:**
- Start with a minimal approach using existing infrastructure (custom relationships, events, property aliases)
- Validate with user feedback before building dedicated UI/visualization
- Support both genealogical and worldbuilding use cases with the same underlying model

---

## Use Cases

### Genealogical Research

**Primary:** Tracking enslaved ancestors through inheritance chains.

When a slaveholder died, enslaved people were often divided among heirs via probate. Researchers need to:
- Track which heir received which enslaved person
- Follow chains forward through subsequent generations
- Determine whether enslaved people came from paternal or maternal estates
- Link to source documents (wills, probate records, estate inventories)

**Example:**
- John Smith Sr. dies 1817 → Estate divided among children
- John Smith Jr. inherits "Mary" and her children
- John Smith Jr. dies 1842 → His heirs inherit Mary's descendants
- Researcher needs to trace this chain to find family connections

### Fictional Worldbuilding

Track succession of titles, thrones, and positions:
- Line of succession calculations
- Inheritance rules (primogeniture, elective, etc.)
- Regnal numbering (Henry VIII, etc.)
- Contested successions, interregnums

---

## Proposed Approach

### Phase 1: Minimal (Custom Relationships + Events)

**Effort:** Low — Documentation and examples only
**Gating:** None

Use existing Charted Roots features to model inheritance:

#### Relationship Properties

Add to person notes using property aliases:

```yaml
# On heir's note
inherited_from: "[[John Smith Sr.]]"
inheritance_date: 1817
inheritance_source: "[[Smith Estate Probate 1817]]"

# For titles/positions (worldbuilding)
succeeded: "[[King Henry VII]]"
title: "King of England"
reign_start: 1509
reign_end: 1547
```

#### Event Notes

Create event notes for inheritance/succession events:

```yaml
cr_type: event
event_type: inheritance  # or: succession, probate, estate_division
event_date: 1817-03-15
participants:
  - "[[John Smith Sr.]]"   # decedent
  - "[[John Smith Jr.]]"   # heir
  - "[[Mary (enslaved)]]"  # inherited person/property
sources:
  - "[[Chester County Probate Book A, p. 47]]"
description: "Estate division per will of John Smith Sr."
```

#### Documentation

- Add "Inheritance Tracking" section to wiki
- Provide example Bases views for querying inheritance chains
- DataView query examples for succession lines

### Phase 2: Enhanced Event Types (Future)

**Effort:** Medium
**Gating:** User feedback from Phase 1

- Add `inheritance` and `succession` as recognized event types
- Event form fields for decedent, heirs, inherited items
- Validation that inheritance events link to death events

### Phase 3: Visualization (Future)

**Effort:** Higher
**Gating:** Demonstrated need

- Inheritance chain visualization (vertical timeline or graph)
- Succession line calculator
- Integration with family chart (show inheritance edges)

---

## Schema Design

### Relationship Types

| Relationship | Inverse | Use Case |
|-------------|---------|----------|
| `inherited_from` | `inherited_by` | Property/person inheritance |
| `succeeded` | `succeeded_by` | Title/position succession |
| `heir_to` | `heir` | Designated heir relationship |

### Event Types

| Type | Description |
|------|-------------|
| `inheritance` | Transfer of property/people at death |
| `succession` | Transfer of title/position |
| `probate` | Legal processing of estate |
| `estate_division` | Formal division among heirs |

### Properties

For person notes (heirs):
```yaml
inherited_from: wikilink[]     # Who they inherited from
inheritance_date: date         # When inheritance occurred
inheritance_source: wikilink   # Source document
```

For person notes (titles/worldbuilding):
```yaml
title: string                  # Title held
succeeded: wikilink            # Previous holder
succeeded_by: wikilink         # Next holder
reign_start: date
reign_end: date
regnal_number: number          # e.g., 8 for Henry VIII
```

---

## Questions for Community

1. **Minimal approach first?** Would custom relationships + event notes meet your immediate needs, or is dedicated UI required?

2. **Inheritance vs succession:** Should these be treated as the same concept with different labels, or as distinct features?

3. **Visualization priority:** How important is chain visualization vs. just being able to query/filter in Bases?

4. **Scope for enslaved ancestor research:** Are there specific fields or relationships beyond `inherited_from` that would help?

---

## Related

- [Inheritance & Succession Tracking](../../wiki-content/Roadmap.md#inheritance--succession-tracking) — Roadmap entry
- Discussion: https://github.com/banisterious/obsidian-canvas-roots/discussions/93#discussioncomment-15394738
