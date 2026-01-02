# Export Privacy & Sensitive Data Protection

Planning document for comprehensive privacy protection of sensitive genealogical data during exports and display.

- **Status:** Planning
- **GitHub Issue:** [#95](https://github.com/banisterious/obsidian-canvas-roots/issues/95)
- **Sub-issues:**
  - [#96](https://github.com/banisterious/obsidian-canvas-roots/issues/96) Phase 1: Sensitive field redaction
  - [#97](https://github.com/banisterious/obsidian-canvas-roots/issues/97) Phase 2: Manual living status override (`cr_living`)
  - [#98](https://github.com/banisterious/obsidian-canvas-roots/issues/98) Phase 3: Underscore-prefix privacy convention
  - [#99](https://github.com/banisterious/obsidian-canvas-roots/issues/99) Phases 4-5: Deadname protection & export warnings
  - [#100](https://github.com/banisterious/obsidian-canvas-roots/issues/100) Phase 6: Privacy feature discoverability
  - [#101](https://github.com/banisterious/obsidian-canvas-roots/issues/101) Phase 7: Pronouns field support
  - [#102](https://github.com/banisterious/obsidian-canvas-roots/issues/102) Phase 8: Privacy-aware canvas generation
- **Priority:** Medium
- **Created:** 2026-01-02
- **Updated:** 2026-01-02

---

## Overview

Genealogical data frequently contains sensitive personal information — government ID numbers, medical notes, previous names, and details about living persons. While Canvas Roots has solid foundational privacy features for living person protection in exports, several gaps exist between the documented roadmap and current implementation.

This document covers:
1. Wiring up existing but unused sensitive field infrastructure
2. User-defined private fields via underscore-prefix convention
3. Deadname protection
4. Manual living status override
5. Export warnings for sensitive data
6. Pronouns field support
7. Privacy-aware canvas generation
8. Improved discoverability of privacy features

---

## Current State

### What's Implemented

| Feature | Status | Location |
|---------|--------|----------|
| Living person detection | ✅ | `privacy-service.ts` |
| Privacy display formats (living, private, initials, hidden) | ✅ | `privacy-service.ts` |
| GEDCOM export privacy | ✅ | `gedcom-exporter.ts` |
| CSV export privacy | ✅ | `csv-exporter.ts` |
| Gramps/GEDCOM X export privacy | ✅ | `gramps-exporter.ts`, `gedcomx-exporter.ts` |
| Log export obfuscation | ✅ | `logging.ts` |
| Gender identity model (sex/gender/gender_identity) | ✅ | Data model |
| Privacy settings UI | ✅ | `settings.ts` |
| Export privacy override UI | ✅ | `export-options-builder.ts` |
| `SENSITIVE_FIELDS` constant | ✅ Defined | `gedcom-types.ts` |

### What's NOT Implemented

| Feature | Status |
|---------|--------|
| Sensitive field redaction (SSN, identity numbers) | Defined but **unused** |
| Underscore-prefix privacy convention | Not implemented |
| Deadname protection | Not implemented |
| `cr_living` manual override | Not implemented |
| Pronouns field | Not implemented |
| Canvas obfuscation mode | Not implemented |
| Export warnings for private fields | Not implemented |
| Privacy feature discoverability | Not implemented |

### Key Gap: SENSITIVE_FIELDS Unused

```typescript
// src/gedcom/gedcom-types.ts line 119
export const SENSITIVE_FIELDS = new Set(['ssn', 'identityNumber']);
```

This constant is defined but has **zero references** in the codebase. SSN and identity numbers imported from GEDCOM are currently exported in full regardless of privacy settings.

---

## Design Principles

1. **Privacy is opt-in** — Existing behavior unchanged; users must enable privacy features
2. **Warn, don't block** — Show warnings about sensitive data but allow override
3. **Sensitive fields always redacted** — SSN/identity numbers excluded regardless of living status
4. **Convention over configuration** — Underscore prefix is simple and self-documenting
5. **Discoverability** — Users should know privacy features exist before they accidentally share sensitive data

---

## Proposed Implementation

### Phase 1: Sensitive Field Redaction (P1) — [#96](https://github.com/banisterious/obsidian-canvas-roots/issues/96)

Wire up the existing `SENSITIVE_FIELDS` constant to all exporters.

**Behavior:**
- Fields in `SENSITIVE_FIELDS` are **always excluded** from exports, regardless of living/deceased status
- This applies to: GEDCOM, GEDCOM X, Gramps XML, CSV exports
- No user toggle — sensitive fields should never be exported

**Implementation:**

1. **Create utility function** in `privacy-service.ts`:
   ```typescript
   export function isSensitiveField(fieldName: string): boolean {
       return SENSITIVE_FIELDS.has(fieldName.toLowerCase());
   }

   export function redactSensitiveFields<T extends Record<string, unknown>>(
       data: T,
       sensitiveFields: Set<string> = SENSITIVE_FIELDS
   ): T {
       const result = { ...data };
       for (const field of sensitiveFields) {
           if (field in result) {
               delete result[field];
           }
       }
       return result;
   }
   ```

2. **Apply in each exporter** before writing person data:
   - `gedcom-exporter.ts` — Filter before generating GEDCOM records
   - `gedcomx-exporter.ts` — Filter before JSON serialization
   - `gramps-exporter.ts` — Filter before XML generation
   - `csv-exporter.ts` — Exclude sensitive columns from output

3. **Add setting for additional sensitive fields**:
   ```typescript
   additionalSensitiveFields: string[];  // Default: []
   ```
   UI: Comma-separated text field in Settings → Privacy

**Files to modify:**
- `src/core/privacy-service.ts` — Add utility functions
- `src/gedcom/gedcom-exporter.ts` — Apply redaction
- `src/gedcomx/gedcomx-exporter.ts` — Apply redaction
- `src/gramps/gramps-exporter.ts` — Apply redaction
- `src/csv/csv-exporter.ts` — Apply redaction
- `src/settings.ts` — Add `additionalSensitiveFields` setting

---

### Phase 2: Manual Living Status Override (P2) — [#97](https://github.com/banisterious/obsidian-canvas-roots/issues/97)

Add `cr_living` frontmatter property to manually override automatic detection.

**Behavior:**
- `cr_living: true` — Always treat as living, regardless of dates
- `cr_living: false` — Always treat as deceased, regardless of dates
- `cr_living` absent — Use automatic detection (existing behavior)

**Use cases:**
- Person with unknown dates but known to be living
- Person with death date not yet entered but known to be deceased
- Override false positives from automatic detection

**Implementation:**

1. **Update `PrivacyService.isLiving()`**:
   ```typescript
   isLiving(person: PersonData): boolean {
       // Manual override takes precedence
       if (person.cr_living !== undefined) {
           return person.cr_living;
       }
       // Existing automatic detection
       return this.detectLivingStatus(person);
   }
   ```

2. **Add to person schema documentation**

3. **Add to Edit Person modal** (optional toggle)

**Files to modify:**
- `src/core/privacy-service.ts` — Check `cr_living` first
- `src/ui/edit-person-modal.ts` — Add optional toggle
- Documentation updates

---

### Phase 3: Underscore-Prefix Privacy Convention (P2) — [#98](https://github.com/banisterious/obsidian-canvas-roots/issues/98)

Treat fields prefixed with `_` as private user data.

**Behavior:**
- Fields like `_previous_names`, `_medical_notes`, `_private_notes` are treated as private
- **Excluded from:** Person picker display, search results, canvas labels
- **Included in:** Note content, Edit Person modal
- **Export:** Requires confirmation dialog (see Phase 5)

**Implementation:**

1. **Create utility function**:
   ```typescript
   export function isPrivateField(fieldName: string): boolean {
       return fieldName.startsWith('_');
   }

   export function getPublicFields<T extends Record<string, unknown>>(data: T): Partial<T> {
       return Object.fromEntries(
           Object.entries(data).filter(([key]) => !isPrivateField(key))
       ) as Partial<T>;
   }
   ```

2. **Apply in display contexts:**
   - `PersonPickerModal` — Filter display fields
   - `PersonSuggest` — Filter suggestion display
   - Canvas node labels — Filter label content (if we generate labels)

3. **Preserve in editing contexts:**
   - `EditPersonModal` — Show all fields including private
   - Frontmatter — Never strip private fields from notes

**Files to modify:**
- `src/core/privacy-service.ts` — Add utility functions
- `src/ui/person-picker-modal.ts` — Filter display
- `src/ui/person-suggest.ts` — Filter suggestions
- Canvas label generation (if applicable)

---

### Phase 4: Deadname Protection (P2) — [#99](https://github.com/banisterious/obsidian-canvas-roots/issues/99)

Automatic suppression of `_previous_names` in display contexts.

**Behavior:**
- `_previous_names` field is never shown in:
  - Person picker
  - Search results
  - Canvas labels
  - Family chart display names
  - Report headers
- `_previous_names` IS shown in:
  - Edit Person modal
  - Full note content
  - Export (with confirmation)

**Rationale:**
- Previous names may include deadnames (names a person no longer uses)
- Displaying deadnames without consent can cause harm
- Research value preserved in note content and exports
- Underscore prefix makes intent clear

**Implementation:**
- Covered by Phase 3 (underscore-prefix convention)
- Document `_previous_names` as the recommended field for this use case
- Add to person schema documentation

---

### Phase 5: Export Warnings for Private Fields (P2) — [#99](https://github.com/banisterious/obsidian-canvas-roots/issues/99)

Show confirmation dialog when export would include underscore-prefixed fields.

**Behavior:**
1. Before export, scan for underscore-prefixed fields in export data
2. If found, show confirmation dialog:
   ```
   ⚠️ Export contains private fields

   The following private fields will be included in this export:
   • _previous_names (23 people)
   • _medical_notes (5 people)

   [Include private fields] [Exclude private fields] [Cancel]
   ```
3. User can proceed with or without private fields

**Implementation:**

1. **Add to export flow** in each exporter:
   ```typescript
   async export(options: ExportOptions): Promise<ExportResult> {
       const privateFieldSummary = this.scanForPrivateFields(data);
       if (privateFieldSummary.length > 0 && !options.skipPrivateWarning) {
           const decision = await this.showPrivateFieldsWarning(privateFieldSummary);
           if (decision === 'cancel') return { cancelled: true };
           if (decision === 'exclude') {
               data = this.stripPrivateFields(data);
           }
       }
       // Continue with export...
   }
   ```

2. **Create warning modal** `PrivateFieldsWarningModal`

**Files to modify:**
- `src/ui/private-fields-warning-modal.ts` — New file
- `src/gedcom/gedcom-exporter.ts` — Add check
- `src/gedcomx/gedcomx-exporter.ts` — Add check
- `src/gramps/gramps-exporter.ts` — Add check
- `src/csv/csv-exporter.ts` — Add check

---

### Phase 6: Privacy Feature Discoverability (P2) — [#100](https://github.com/banisterious/obsidian-canvas-roots/issues/100)

Help users discover privacy features before accidentally sharing sensitive data.

**Approaches:**

1. **First-run notice** (when living persons detected):
   ```
   📋 Privacy Protection Available

   Canvas Roots detected X people who may be living.
   Privacy protection can hide or anonymize living persons in exports.

   [Configure Privacy Settings] [Remind Me Later] [Don't Show Again]
   ```
   - Trigger: First import that includes people without death dates
   - Store dismissal in settings: `privacyNoticeDismissed: boolean`

2. **Export dialog warning** (when privacy disabled):
   - Add subtle notice in export dialogs when `enablePrivacyProtection: false`
   - Text: "ℹ️ Privacy protection is disabled. Living persons will be exported with full details."
   - Link to settings

3. **Settings description improvement**:
   - Expand privacy settings descriptions
   - Add "Learn more" link to documentation

**Files to modify:**
- `src/ui/privacy-notice-modal.ts` — New file
- `src/settings.ts` — Add `privacyNoticeDismissed`, improve descriptions
- `src/ui/export-options-builder.ts` — Add privacy disabled notice
- Import wizards — Trigger first-run notice

---

### Phase 7: Pronouns Field (P3) — [#101](https://github.com/banisterious/obsidian-canvas-roots/issues/101)

Add `pronouns` property support for respectful communication.

**Behavior:**
- New frontmatter field: `pronouns: "they/them"` (free-form string)
- Display in:
  - Person picker (optional, after name)
  - Family chart hover/tooltip
  - Reports where name is displayed
- Do not enforce format — users may use various conventions

**Implementation:**

1. **Add to person schema** (documentation)

2. **Update display components:**
   - Person picker — Show pronouns in parentheses: "Jane Doe (she/her)"
   - Edit Person modal — Add pronouns field
   - Reports — Include where appropriate

3. **Add setting** (optional):
   ```typescript
   showPronouns: boolean;  // Default: true
   ```

**Files to modify:**
- `src/ui/person-picker-modal.ts` — Display pronouns
- `src/ui/edit-person-modal.ts` — Add field
- `src/reports/` — Include in relevant reports
- `src/settings.ts` — Add `showPronouns` setting
- Documentation updates

---

### Phase 8: Privacy-Aware Canvas Generation (P3) — [#102](https://github.com/banisterious/obsidian-canvas-roots/issues/102)

Add privacy options to canvas tree generation.

**Technical constraint:**
- Obsidian Canvas API has no view manipulation hooks
- Runtime obfuscation is **not feasible**
- Privacy must be applied **at generation time**

**Behavior:**
- Add toggle to canvas generation modal: "Apply privacy protection"
- When enabled:
  - Living persons matching `hidden` format are excluded entirely
  - Living persons matching other formats get text nodes with obfuscated names instead of file nodes
  - Text nodes include wikilink for navigation: `**[Living]**\n[[John Smith]]`

**Implementation:**

1. **Extend `CanvasGenerationOptions`**:
   ```typescript
   applyCanvasPrivacy?: boolean;
   canvasPrivacyFormat?: 'living' | 'private' | 'initials' | 'hidden';
   ```

2. **Modify `generateCanvas()` in `canvas-generator.ts`**:
   ```typescript
   for (const position of layoutResult.positions) {
       const person = position.person;
       if (options.applyCanvasPrivacy && this.privacyService.isLiving(person)) {
           const format = options.canvasPrivacyFormat || this.settings.privacyDisplayFormat;
           if (format === 'hidden') {
               continue; // Skip node entirely
           }
           // Create text node instead of file node
           canvasNodes.push(this.createObfuscatedNode(person, position, format));
       } else {
           canvasNodes.push(this.createFileNode(person, position));
       }
   }
   ```

3. **Update canvas generation modal UI**:
   - Add "Privacy" section with toggle and format dropdown
   - Show count of living persons that will be affected

**Files to modify:**
- `src/trees/tree-types.ts` — Extend options
- `src/core/canvas-generator.ts` — Apply privacy during generation
- `src/ui/tree-generation-modal.ts` — Add privacy options

---

## Phase Dependencies

```
Phase 1 (Sensitive Fields) ──────────────────────────┐
                                                     │
Phase 2 (cr_living Override) ────────────────────────┤
                                                     │
Phase 3 (Underscore Prefix) ─┬─ Phase 4 (Deadname) ──┼── Phase 5 (Export Warnings)
                             │                       │
                             └───────────────────────┤
                                                     │
Phase 6 (Discoverability) ───────────────────────────┤
                                                     │
Phase 7 (Pronouns) ──────────────────────────────────┤
                                                     │
Phase 8 (Canvas Privacy) ────────────────────────────┘
```

- Phase 1 is independent and highest priority
- Phases 2, 3, 6, 7, 8 are independent of each other
- Phase 4 depends on Phase 3 (uses underscore convention)
- Phase 5 depends on Phase 3 (warns about underscore fields)

---

## Settings Changes

### New Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `additionalSensitiveFields` | `string[]` | `[]` | Additional field names to always redact from exports |
| `privacyNoticeDismissed` | `boolean` | `false` | Whether user has dismissed first-run privacy notice |
| `showPronouns` | `boolean` | `true` | Show pronouns in person picker and displays |

### Existing Settings (No Changes)

| Setting | Default | Notes |
|---------|---------|-------|
| `enablePrivacyProtection` | `false` | Remains opt-in |
| `livingPersonAgeThreshold` | `100` | No change |
| `privacyDisplayFormat` | `'living'` | No change |
| `hideDetailsForLiving` | `false` | No change |

---

## Documentation Updates

1. **Privacy-And-Security.md** — Add sections for:
   - Sensitive field redaction
   - `cr_living` override
   - Underscore-prefix convention
   - Deadname protection
   - Pronouns field

2. **Person-Notes.md** — Document new properties:
   - `cr_living`
   - `pronouns`
   - Underscore-prefix fields

3. **Import-Export.md** — Add:
   - Sensitive field handling
   - Private field export warnings

4. **Roadmap.md** — Update status when implemented

---

## Implementation Checklist

### Phase 1: Sensitive Field Redaction
- [ ] Add `isSensitiveField()` and `redactSensitiveFields()` to privacy-service.ts
- [ ] Apply redaction in gedcom-exporter.ts
- [ ] Apply redaction in gedcomx-exporter.ts
- [ ] Apply redaction in gramps-exporter.ts
- [ ] Apply redaction in csv-exporter.ts
- [ ] Add `additionalSensitiveFields` setting
- [ ] Add tests for sensitive field redaction

### Phase 2: Manual Living Override
- [ ] Update `PrivacyService.isLiving()` to check `cr_living` first
- [ ] Add toggle to Edit Person modal (optional)
- [ ] Document `cr_living` property

### Phase 3: Underscore-Prefix Convention
- [ ] Add `isPrivateField()` and `getPublicFields()` utilities
- [ ] Filter private fields in PersonPickerModal
- [ ] Filter private fields in PersonSuggest
- [ ] Document underscore-prefix convention

### Phase 4: Deadname Protection
- [ ] Document `_previous_names` as recommended field
- [ ] Verify covered by Phase 3 implementation

### Phase 5: Export Warnings
- [ ] Create PrivateFieldsWarningModal
- [ ] Add private field scan to GEDCOM export
- [ ] Add private field scan to GEDCOM X export
- [ ] Add private field scan to Gramps export
- [ ] Add private field scan to CSV export

### Phase 6: Discoverability
- [ ] Create privacy notice modal
- [ ] Add `privacyNoticeDismissed` setting
- [ ] Trigger notice on first import with living persons
- [ ] Add privacy disabled notice to export dialogs
- [ ] Improve settings descriptions

### Phase 7: Pronouns Field
- [ ] Add `showPronouns` setting
- [ ] Display pronouns in PersonPickerModal
- [ ] Add pronouns field to Edit Person modal
- [ ] Include pronouns in relevant reports
- [ ] Document pronouns property

### Phase 8: Canvas Privacy
- [ ] Add privacy options to CanvasGenerationOptions
- [ ] Implement privacy logic in canvas-generator.ts
- [ ] Add privacy section to tree generation modal UI
- [ ] Document canvas privacy limitations

---

## References

- [Roadmap Entry](../../wiki-content/Roadmap.md#export-privacy--sensitive-data)
- [SECURITY.md](../../SECURITY.md)
- [Privacy-And-Security.md](../../wiki-content/Privacy-And-Security.md)
- [Specialized Features - Privacy](../developer/implementation/specialized-features.md#privacy-and-gender-identity-protection)
