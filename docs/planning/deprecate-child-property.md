# Deprecate `child` Property in Favor of `children`

**Status:** In Progress
**Issue:** #65
**Priority:** Medium

## Problem

The codebase has inconsistent naming for the children wikilink property:
- `child` (singular) - legacy, used by some older code paths
- `children` (plural) - preferred, matches `children_id`

This causes duplicate properties to appear in YAML when both systems write to the same note.

## Current State (v0.18.9)

### Already Fixed
- `BidirectionalLinker` now writes to `children` (was `child`)
- `person-note-writer` writes to `children` and removes legacy `child`
- `control-center` deduplication migrates `child` → `children`
- All read operations check both properties for backward compatibility

### Remaining Work

1. **Add Cleanup Wizard Step** - Create Step 14 to migrate `child` → `children`
   - Detect person notes with `child` property
   - Preview migration (show what will be renamed)
   - Apply: rename `child` to `children`, preserving values

2. **Update Schema/Documentation**
   - Document `children` as the canonical property
   - Mark `child` as deprecated in any schema definitions
   - Update wiki documentation

3. **Audit Other Code Paths**
   - Check GEDCOM import/export
   - Check Gramps import/export
   - Check CSV import/export
   - Check any other places that might read/write children

## Implementation Notes

### Cleanup Wizard Step 14

```typescript
// In cleanup-wizard-modal.ts, add step:
{
  id: 'child-to-children',
  number: 14,
  title: 'Normalize Children Property',
  shortTitle: 'Children',
  description: 'Rename legacy "child" property to "children" for consistency.',
  type: 'batch',
  // Custom implementation - simpler than a full service
}
```

### Detection Logic

```typescript
function detectLegacyChildProperty(): TFile[] {
  const files: TFile[] = [];
  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache?.frontmatter?.child) {
      files.push(file);
    }
  }
  return files;
}
```

### Migration Logic

```typescript
await app.fileManager.processFrontMatter(file, (fm) => {
  if (fm.child) {
    // Merge with existing children if both exist
    const childValue = fm.child;
    const childrenValue = fm.children;

    if (childrenValue) {
      // Merge arrays, deduplicate
      const merged = [...new Set([
        ...(Array.isArray(childrenValue) ? childrenValue : [childrenValue]),
        ...(Array.isArray(childValue) ? childValue : [childValue])
      ])];
      fm.children = merged.length === 1 ? merged[0] : merged;
    } else {
      fm.children = childValue;
    }

    delete fm.child;
  }
});
```

## Timeline

- v0.18.9: Core fix implemented (BidirectionalLinker, person-note-writer)
- v0.19.x: Add Cleanup Wizard step for batch migration
- v0.20.x: Consider removing `child` read support (breaking change)

## Files Changed

### v0.18.9 (completed)
- `src/core/bidirectional-linker.ts` - Write to `children`, read both
- `src/core/person-note-writer.ts` - Write to `children`, delete `child`
- `src/ui/control-center.ts` - Dedup migrates `child` → `children`

### Future
- `src/ui/cleanup-wizard-modal.ts` - Add Step 14
- Wiki documentation updates
