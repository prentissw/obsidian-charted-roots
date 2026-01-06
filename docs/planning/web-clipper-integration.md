# Web Clipper Integration

Planning document for integrating Obsidian Web Clipper with Canvas Roots for genealogical research.

- **Status:** Ready for implementation
- **GitHub Issue:** [#128](https://github.com/banisterious/obsidian-canvas-roots/issues/128)
- **Created:** 2025-01-04
- **Updated:** 2026-01-05 (Phase 1 decisions finalized based on community feedback)
- **Enabled By:** [#137](https://github.com/banisterious/obsidian-canvas-roots/issues/137) (Staging Management UI, completed v0.18.24)

---

## Overview

Obsidian Web Clipper is an official browser extension that captures web content into Obsidian notes. With the Staging Management UI now complete, users can already configure Web Clipper to output to their staging folder and use Staging Manager to review/promote clipped notes. This integration adds convenience features and (eventually) standardized templates.

### Goals

1. **Streamline clipped note detection** — Auto-detect clipped notes and show Dashboard indicator
2. **Leverage existing staging workflow** — Enhance the clip → stage → review → promote workflow
3. **Enable community experimentation** — Let users test templates before standardization
4. **Eventually provide curated templates** — After learning from community usage

### Non-Goals

- Building a custom web scraper (Web Clipper handles extraction)
- Modifying Web Clipper itself (we provide integration only)
- Real-time sync with genealogy websites
- Opinionated auto-import (staging review workflow is more flexible)

---

## Phase 1: File Watcher & Dashboard Integration

**Status:** ✅ Implemented (v0.18.25+)

Detect clipped notes and provide convenience features for the existing workflow.

### Clipper Metadata Properties

To detect clipped notes, users should include one or more of these properties in their Web Clipper templates:

- `clip_source_type` - Type of source (e.g., `obituary`, `findagrave`, `census`)
- `clipped_from` - Original URL (`{{url}}` in Web Clipper)
- `clipped_date` - Clip timestamp (`{{date}}` in Web Clipper)

Canvas Roots will monitor staging folder for files containing these properties.

### User Workflow

1. User creates their own Web Clipper templates (or obtains from community)
2. Configure Web Clipper to output to staging folder (e.g., `Family/Staging/clips`)
3. Include `clip_source_type` or `clipped_from` in template frontmatter
4. Clip genealogical content from web
5. Canvas Roots detects new clips and shows Dashboard "Staging" card with breakdown: "3 clips (1 new), 1 other"
6. Click "Review" to open Staging Manager
7. Use toggle buttons (All/Clipped/Other) to filter staging content
8. Review and promote to main tree

### Implementation (Completed)

1. **File watching:** ✅
   - `WebClipperService` uses `vault.on('create', ...)` to detect new files in staging folder
   - Parses frontmatter for clipper metadata properties
   - Tracks count of unreviewed clipped notes

2. **Dashboard integration:** ✅
   - Unified "Staging" card shows breakdown: "3 clips (1 new), 1 other"
   - "Review" button opens Staging Manager
   - Card appears only when staging folder contains files

3. **Staging Manager filter:** ✅
   - Toggle buttons: [All] [Clipped] [Other]
   - Filters applied at three levels: stats, batches, and files
   - No persistence (simple approach for Phase 1)

### Implementation Details & Decisions

**Dashboard card approach:** ✅
- Unified "Staging" card (not separate cards for imports vs clips)
- Shows breakdown when clipped notes exist: "3 clips (1 new), 1 other"
- Rationale: Single entry point to Staging Manager avoids misleading UX; users toggle filters inside Staging Manager
- No notices/notifications for clip detection

**Filter toggle UI:** ✅
- Three mutually exclusive buttons: [All] [Clipped] [Other]
- Active button highlighted with accent color
- Filter state resets to "All" on each open (no persistence)
- Can add persistence later if users accumulate large backlogs

**Unreviewed tracking:** ✅
- Count resets when Staging Manager opens
- Count indicates "new clips since you last checked staging"
- Simple approach leverages existing staging workflow
- Can enhance with per-file tracking if users request it

**Detection scope:** ✅
- Only monitor staging folder (as configured in settings)
- Prevents performance issues from scanning entire vault
- User must configure Web Clipper to output to staging folder
- Clips outside staging folder won't be detected

**Property standardization:** ✅
- All three properties recommended but optional: `clip_source_type`, `clipped_from`, `clipped_date`
- Detection requires ANY ONE of the three properties
- Minimal standardization makes implementation easier
- Properties are unprefixed for simplicity (low risk of conflict)
- Benefits of including each property documented in wiki

**Multi-level filtering:** ✅
- Stats recalculated based on filter mode
- Batches (subfolders) filtered to hide those with no matching files
- Files within batches filtered based on clipper metadata presence
- Consistent user experience across all three levels

### Benefits

- Works with any user-created templates (no repo commitment needed)
- Users can experiment and share templates in Discussions
- Minimal implementation effort (leverage existing Staging Manager UI)
- Learn from real usage before standardizing templates

---

## Phase 2: Official Template Distribution (Future)

**Status:** After community feedback

Provide curated, tested templates based on real-world usage patterns.

### Rationale for Delay

- Let users experiment with their own templates first
- Learn what sources are actually used (Find A Grave? Ancestry? Newspapers?)
- Understand which extraction methods work best (LLM vs CSS selectors)
- Avoid committing to templates that may need frequent updates
- Reduce initial maintenance burden

### When to Proceed

Consider moving forward when:
- Multiple users sharing similar templates in Discussions
- Clear patterns emerge for most-used sources
- Web Clipper API/schema stabilizes
- Community requests official templates

### Proposed Template Location

**docs/clipper-templates/** in main repo with:
- Individual JSON files for each template
- README with setup instructions and compatibility notes
- Version compatibility metadata (`canvas_roots_min_version`)

### Candidate Templates

Based on initial community interest:

| Template | Source | Extraction Method | Priority |
|----------|--------|-------------------|----------|
| Generic Obituary | Any obituary site | LLM extraction | High |
| Find A Grave | findagrave.com | CSS selectors | High |
| FamilySearch Person | familysearch.org | CSS selectors | Medium |
| Wikipedia Biography | wikipedia.org | Schema.org | Low |

### Template Standards

When/if official templates are created:
- Use canonical Canvas Roots property names
- Include all clipper metadata properties (`clip_source_type`, `clipped_from`, `clipped_date`)
- Document property mappings and known limitations
- Include URL triggers for auto-selection
- Test against real pages before release
- Version templates alongside plugin releases

---

## Phase 3: Enhanced Extraction (Future)

**Status:** Conceptual

More sophisticated extraction capabilities.

### Potential Features

- **Relationship extraction** — Parse "survived by" sections in obituaries
- **Multi-person clipping** — Extract family group from census page
- **Source linking** — Auto-create source note linked to clipped person
- **Place standardization** — Normalize place names during extraction

### Research Needed

- Web Clipper's LLM extraction capabilities and limits
- Schema.org markup availability on genealogy sites
- CSS selector stability on target sites

---

## Documentation Updates (Phase 1)

### Wiki Pages to Create/Update

- [x] Create: `wiki-content/Web-Clipper-Integration.md` — Dedicated setup and usage guide
- [x] Update: `wiki-content/Data-Entry.md` — Add "Clipping from Web Sources" section with overview and link to full guide
- [x] Update: `Roadmap.md` — Reflect revised phasing
- [x] Update: Planning doc — Reflect revised phasing

### Web-Clipper-Integration.md Structure

**New dedicated wiki page** with comprehensive setup and usage guide:

1. **Overview**
   - What is Web Clipper Integration
   - When to use it (capturing obituaries, Find A Grave, etc.)
   - How it works with Staging Manager

2. **Setup**
   - Install Obsidian Web Clipper extension
   - Configure output folder to match Canvas Roots staging folder
   - Warning: clips outside staging folder won't be detected

3. **Creating Templates**
   - Required metadata properties (`clip_source_type`, `clipped_from`, `clipped_date`)
   - Benefits of including each property
   - Example minimal template
   - Tips for LLM-based extraction (based on wilbry's testing)

4. **Workflow**
   - Clipping content from web
   - Reviewing clips in Dashboard
   - Using Staging Manager filter
   - Promoting to main tree

5. **Community Templates**
   - How to share templates in Discussions
   - Where to find community-shared templates
   - Note about future official templates (Phase 2)

**Example template snippet:**
```yaml
---
clip_source_type: obituary
clipped_from: "{{url}}"
clipped_date: "{{date}}"
# ... other genealogical properties
---
```

### Data-Entry.md Updates

**Add new section:** "Clipping from Web Sources"

Brief overview with:
- What Web Clipper Integration does
- Quick workflow summary
- Link to full [Web Clipper Integration](Web-Clipper-Integration) guide
- When to use clipping vs manual entry vs GEDCOM import

---

## Related Documents

- [Staging Management Enhancement](staging-management-enhancement.md)
- [Data Entry](../../wiki-content/Data-Entry.md)
- [Obsidian Web Clipper Documentation](https://help.obsidian.md/Clipper)

---

## Notes

This plan was created based on GitHub issue [#128](https://github.com/banisterious/obsidian-canvas-roots/issues/128) discussion. Key community input:

**Initial testing (@wilbry):**
- Web Clipper requires double quotes in prompts (not single quotes)
- Clipper variables in context field improve LLM extraction quality
- Larger Mistral models (8B, Small 3.2) perform better than smaller models
- LLM hallucination observed (fabricating birth years when not in source)
- Hallucination issue reinforces value of staging review workflow

**Phase 1 design decisions (@wilbry feedback):**
- Unified staging card instead of separate cards (avoids misleading UX)
- Toggle buttons in Staging Manager for in-place filtering
- No filter persistence initially (staging volume expected to be manageable)
- Reset unreviewed count when Staging Manager opens
- Staging folder detection only (performance and simplicity)
- All three clipper properties recommended but optional
- "Other" label for non-clipped files (clearer than "Imports" or "Non-Clipped")
