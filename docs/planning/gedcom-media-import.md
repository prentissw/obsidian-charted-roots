# GEDCOM Media (OBJE) Import

**GitHub Issue:** [#202](https://github.com/banisterious/obsidian-charted-roots/issues/202)

**Status:** Planning

---

## Problem Statement

GEDCOM files contain media object references (OBJE tags) that point to image and document files. Currently, GEDCOM import ignores these references, while Gramps import fully supports media linking. Users who prefer GEDCOM import (for better place name handling, smaller file size, faster import) lose media associations.

---

## User Feedback

From @jeff962:

> The only reason I've been using the .gpkg format for importing is to preserve the links to the media files. So if the GEDCOM could import links to media files, that would be a good solution since it's smaller and faster.

**Key context:** User's `Charted Roots/Media` folder is a symlink to their external media storage location, which matches the paths in their GEDCOM file.

---

## Current State

### Gramps Import (Full Support)

The Gramps importer (`src/gramps/`) has comprehensive media handling:

1. **Parses media objects** from `<object>` elements in Gramps XML
2. **Extracts media files** from `.gpkg` packages to vault
3. **Maps handles to vault paths** via `mediaHandleToPath`
4. **Resolves references** on persons, places, events, sources
5. **Adds `media` property** to frontmatter with wikilinks

### GEDCOM Import (No Support)

The GEDCOM importer (`src/gedcom/`) currently:

- Has **no handling for OBJE tags** at all
- No types defined for media objects
- No parsing of media references on INDI, FAM, SOUR, etc.

---

## GEDCOM OBJE Structure

### Media Object Definition

```gedcom
0 @O0205@ OBJE
1 FILE /media/linuxstore/pictures/Ancestors/Hatfield/Hatfield_2022.jpg
2 FORM jpg
2 TITL Hatfield_2022
```

### Media References

References can appear on individuals, families, sources, and events:

```gedcom
0 @I001@ INDI
1 NAME Someone /Hatfield/
1 OBJE @O0205@

0 @F001@ FAM
1 HUSB @I001@
1 OBJE @O0210@

0 @S001@ SOUR
1 TITL Birth Certificate
1 OBJE @O0215@
```

### Inline Media (Alternative Format)

Some GEDCOM files embed media directly without separate OBJE records:

```gedcom
0 @I001@ INDI
1 NAME Someone /Hatfield/
1 OBJE
2 FILE /path/to/image.jpg
2 FORM jpg
2 TITL Photo of Someone
```

---

## Proposed Solution

Implement GEDCOM OBJE import with parity to Gramps media handling.

### Phase 1: Core Implementation

1. **Add types for GEDCOM media objects**
   - `GedcomMedia` interface with handle, file path, form, title
   - `mediaRefs` arrays on person, family, source, event types

2. **Parse top-level OBJE records**
   - Build `Map<string, GedcomMedia>` from `0 @Oxxxx@ OBJE` records
   - Extract FILE path, FORM (format), TITL (title)

3. **Parse OBJE references**
   - Collect `1 OBJE @Oxxxx@` on INDI, FAM, SOUR records
   - Support inline OBJE (no pointer) for direct file references

4. **Path resolution**
   - Use existing media folder setting for base path
   - Convert external paths to vault-relative wikilinks
   - Handle both absolute and relative paths

5. **Add media property to frontmatter**
   - Same format as Gramps import: `media: ["[[filename.jpg]]"]`
   - Apply to persons, sources (events and places if referenced)

### Phase 2: Enhanced Path Handling (Future)

1. **Import wizard path mapping**
   - UI to specify external path prefix to strip
   - Preview of resolved paths before import

2. **Path validation**
   - Check if resolved files exist in vault
   - Report missing files in import summary

---

## Technical Considerations

### Differences from Gramps Import

| Aspect | Gramps | GEDCOM |
|--------|--------|--------|
| Media bundled | Yes (.gpkg contains files) | No (paths only) |
| Extraction needed | Yes | No |
| Path format | Relative to `mediapath` | Often absolute |
| Handle format | `_xxxxxxx` | `@Oxxxx@` |

### Path Resolution Strategy

The user's scenario:
- GEDCOM path: `/media/linuxstore/pictures/Ancestors/Hatfield/Hatfield_2022.jpg`
- Vault media folder: `Charted Roots/Media` (symlink to `/media/linuxstore/pictures/Ancestors`)
- Desired wikilink: `[[Hatfield/Hatfield_2022.jpg]]`

**Approach:**
1. User configures "external media base path" in import options
2. Strip that prefix from GEDCOM FILE paths
3. Prepend vault media folder path (if needed for full path resolution)
4. Generate wikilink with filename or relative path

### Files to Modify

1. **`src/gedcom/gedcom-types.ts`**
   - Add `GedcomMedia` interface
   - Add `mediaRefs` to relevant interfaces

2. **`src/gedcom/gedcom-parser-v2.ts`**
   - Parse OBJE records into media map
   - Parse OBJE references on INDI, FAM, SOUR

3. **`src/gedcom/gedcom-importer-v2.ts`**
   - Resolve media paths to wikilinks
   - Add `media` property to frontmatter generation

4. **Import wizard UI** (optional for Phase 1)
   - Add media path mapping option

---

## Implementation Plan

### Phase 1: Core OBJE Import

1. **Add GEDCOM media types**
   - Define `GedcomMedia` interface
   - Add `mediaRefs: string[]` to person, family, source types

2. **Implement OBJE parsing**
   - Parse top-level `0 @Oxxxx@ OBJE` records
   - Build media handle → path map
   - Parse `1 OBJE` references (both pointer and inline forms)

3. **Implement path resolution**
   - Reuse Gramps pattern with `mediaHandleToPath` map
   - Convert FILE paths to vault-relative wikilinks
   - Use existing media folder setting

4. **Update frontmatter generation**
   - Add `media` property with resolved wikilinks
   - Follow same format as Gramps import

5. **Add import option**
   - Checkbox: "Import media references"
   - Text field: "External media path prefix" (to strip)

### Phase 2: Validation & Preview (Future)

1. **Path validation** - Check if files exist
2. **Preview UI** - Show path mappings before import
3. **Missing file report** - Summary of unresolved media

---

## Open Questions

1. **Default behavior for path resolution?**
   - If no prefix configured, use filename only?
   - Or preserve full path and let user fix manually?

2. **Handle missing OBJE records?**
   - If `1 OBJE @O999@` references non-existent object, warn or skip?

3. **Support for OBJE on events?**
   - GEDCOM allows OBJE on event sub-records
   - Gramps supports this - should we for parity?

---

## Related

- [Gramps Media Import](../../src/gramps/gramps-importer.ts) - Reference implementation
- [Media Management wiki](https://github.com/banisterious/obsidian-charted-roots/wiki/Media-Management)
- Issue #202 - Original feature request
