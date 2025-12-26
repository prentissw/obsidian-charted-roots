# Gramps Notes Import

Planning document for importing Gramps notes during Gramps XML import.

**Status:** Planning
**GitHub Issue:** #TBD
**Priority:** Medium
**Created:** 2025-12-26
**Updated:** 2025-12-26

---

## Overview

Gramps allows attaching notes to various entities (people, families, events, places, sources, etc.). These notes are free-form text that can contain research notes, biographical information, source transcriptions, and more. Users importing from Gramps expect their notes to be preserved.

---

## Background Research

### Gramps Note Structure (from grampsxml.dtd)

```xml
<!ELEMENT note (text, style*, tagref*)>
<!ATTLIST note
        id        CDATA #IMPLIED
        handle    ID    #REQUIRED
        priv      (0|1) #IMPLIED
        change    CDATA #REQUIRED
        format    (0|1) #IMPLIED
        type      CDATA #REQUIRED
>

<!ELEMENT noteref EMPTY>
<!ATTLIST noteref hlink IDREF #REQUIRED>
```

### Entities That Can Have Notes

According to the DTD, the following elements can contain `noteref`:
- **person** - directly and within names, addresses, person references
- **family** - directly and within child references
- **event** - directly
- **place** (placeobj) - directly
- **source** - directly (already implemented!)
- **citation** - directly
- **object** (media) - directly
- **repository** - directly

### Note Types

Common note types in Gramps:
- Person Note
- Research
- Transcript
- Source text
- Citation
- General
- Custom user-defined types

### Current Implementation

- Notes are already parsed in `gramps-parser.ts` (line 480-487)
- Notes are stored in `database.notes` Map
- Source notes are already resolved and used (line 359-370)
- `GrampsPerson` type does not currently include `noteRefs`

---

## Proposed Implementation

### Phase 1: Person Notes

1. **Extend `GrampsPerson` interface**
   - Add `noteRefs: string[]` field

2. **Parse person note references**
   - In `parsePerson()`, extract `noteref` elements
   - Store handle references in `noteRefs` array

3. **Add import option**
   - Add `importNotes: boolean` to `GrampsImportOptions`
   - Add toggle in Import Wizard UI

4. **Append notes to person content**
   - Add "## Notes" section at bottom of person note
   - Include note type as subsection header if multiple notes
   - Preserve note text content

### Phase 2: Other Entity Notes (Future)

- Event notes
- Place notes
- Family notes (attach to marriage event or both spouses?)
- Media/object notes

---

## Open Questions

1. **Where should notes appear in person notes?**
   - Bottom of note content (after dynamic blocks)?
   - In frontmatter as a property?
   - As separate linked note files?

2. **How to handle multiple notes per person?**
   - Concatenate all notes in one section?
   - Separate subsections by note type?
   - Numbered sections?

3. **Should note type be preserved?**
   - Include type as header: `### Research Note`
   - Include as metadata: `> Type: Research`
   - Ignore type?

4. **How to handle styled/formatted notes?**
   - Gramps notes can have `<style>` elements for formatting
   - Convert to Markdown formatting?
   - Strip formatting and import plain text only?

5. **Family notes handling?**
   - Attach to marriage event?
   - Duplicate to both spouses?
   - Create separate family note file?

6. **Privacy flag (`priv` attribute)?**
   - Gramps notes can be marked private
   - Should we respect this and skip private notes?
   - Import with a warning?
   - Add a `private: true` frontmatter field?

7. **Default behavior?**
   - Should notes import be enabled by default?
   - Or opt-in like places/events?

---

## Technical Notes

### Files to Modify

- `src/gramps/gramps-types.ts` - Add `noteRefs` to `GrampsPerson`
- `src/gramps/gramps-parser.ts` - Parse person noteref elements
- `src/gramps/gramps-importer.ts` - Resolve and append notes to content
- `src/ui/import-wizard-modal.ts` - Add import toggle

### Example Output

```markdown
---
name: John Smith
birth_date: 1850-03-15
# ... other frontmatter
---

## Notes

### Research Note
Census records show John living with his parents in 1860.
Further research needed to confirm birth location.

### Person Note
Biographical information from family bible.
```

---

## References

- [Gramps XML Format](https://www.gramps-project.org/wiki/index.php/Gramps_XML)
- [grampsxml.dtd on GitHub](https://github.com/gramps-project/gramps/blob/master/data/grampsxml.dtd)
