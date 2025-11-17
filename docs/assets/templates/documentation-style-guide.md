# Documentation Style Guide

## Executive Summary

- **Consistency**: Maintain consistent formatting, voice, and structure across all documentation
- **Visual Aid**: Use annotated screenshots and diagrams to enhance understanding
- **Accessibility**: Ensure all documentation is accessible to all users
- **Organization**: Follow the established file and section structure for all documents
- **User-Focused**: Write from the user's perspective with clear, concise language

## Voice and Tone

### Writing Style

- **Person**: Use second person ("you") when addressing the user directly
- **Tense**: Use present tense for actions and descriptions
- **Active Voice**: Prefer active voice over passive voice
- **Clarity**: Use clear, concise language without unnecessary jargon
- **Consistency**: Maintain consistent terminology throughout all documentation
- **Personal Pronouns**: Avoid using "we," "our," or "us" in documentation. Instead, refer directly to "the plugin," "the feature," or use other specific subjects.

### Examples

**Preferred:**
- "Open the person note before running the command."
- "You can customize node spacing in the settings."
- "The plugin automatically generates unique cr_id values."

**Avoid:**
- "The person note should be opened before the command is run."
- "We added a new feature that enables multi-parent graphs."

### Technical Writing

- Break complex procedures into numbered steps
- Use bullet points for lists of related items
- Highlight important notes using blockquotes
- Use code blocks for YAML examples, GEDCOM data, or code snippets
- Define abbreviations on first use (e.g., "GEDCOM (Genealogical Data Communication)")

## Directory Structure

```
docs/
├── user/                           # End-user documentation
│   ├── guides/                     # How-to guides
│   ├── concepts/                   # Conceptual explanations
│   └── reference/                  # Reference materials
├── developer/                      # Developer documentation
│   ├── architecture/               # System architecture
│   ├── implementation/             # Implementation details
│   ├── testing/                    # Testing guidance
│   └── contributing/               # Contribution guides
├── planning/                       # Active planning documents
│   ├── features/                   # Feature planning
│   └── feature-requirements/       # Detailed requirements
├── assets/                         # Documentation assets
│   ├── images/                     # Screenshots and diagrams
│   └── templates/                  # Document templates
├── archive/                        # Historical documents
└── canvas-roots-initial-spec.md   # Initial specification
```

## Naming Conventions

- **Files**: Use kebab-case for all file names: `tree-generation.md`
- **Directories**: Use Title Case: `Implementation/`
- **Extension**: Use `.md` for all documentation files

## Document Structure

### Table of Contents

Every documentation file must include a Table of Contents after the title:

```markdown
## Table of Contents

- [1. Introduction](#1-introduction)
- [2. Installation](#2-installation)
  - [2.1. Prerequisites](#21-prerequisites)
  - [2.2. Installation Steps](#22-installation-steps)
```

### Heading Hierarchy

- **H1 (#)**: Document title - only one per document
- **H2 (##)**: Major sections
- **H3 (###)**: Subsections
- **H4 (####)**: Minor subsections

Use Title Case for all headings. Keep headings concise (under 60 characters).

## Image Guidelines

- **Organization**: Store all images in `docs/assets/images/`
- **Naming**: Use descriptive filenames: `tree-layout-example.png`
- **Sizing**:
  - Banner images: 1200-1600px wide
  - Inline images: 600-800px wide
  - Diagrams: 800-1200px wide
- **Alt Text**: Always include descriptive alt text

## Code Examples

### YAML Frontmatter

```yaml
---
cr_id: 550e8400-e29b-41d4-a716-446655440000
name: John Smith
born: 1950-03-15
died: 2020-08-22
---

Father:: [[Robert Smith]]
Mother:: [[Mary Johnson]]
Spouse:: [[Jane Doe]]
```

### GEDCOM Format

```gedcom
0 @I1@ INDI
1 NAME John /Smith/
1 SEX M
1 BIRT
2 DATE 15 MAR 1950
```

### DataView Queries

```dataviewjs
// Find all people with cr_id
dv.table(
  ["Name", "Born", "Died"],
  dv.pages().where(p => p.cr_id)
    .map(p => [p.file.link, p.born, p.died])
)
```

## Annotated Screenshots

### Annotation Color Scheme

Use colorblind-friendly colors:
- Person notes: Blue (#3498db)
- Canvas nodes: Green (#2ecc71)
- Relationship edges: Purple (#9b59b6)
- Settings/UI elements: Orange (#e67e22)

### Annotation Style

- Rounded rectangles for highlighting
- 2px solid borders
- 50% transparent fill
- Sans-serif font (Calibri, Arial)
- 14-16pt font size

## Accessibility Guidelines

- **Alt Text**: All images must include descriptive alt text
- **Contrast**: Minimum 4.5:1 ratio between text and background
- **Color Independence**: Never use color as the only means of conveying information
- **Link Text**: Use descriptive link text, not "click here"
- **Plain Language**: Aim for 9th-grade reading level
- **Headings**: Use proper heading hierarchy (h1, h2, h3) in sequential order

## Version Control

### When to Update Documentation

- When adding a new feature
- When changing existing functionality
- When deprecating or removing features
- When fixing bugs that affect user workflow
- When improving clarity based on user feedback

### Date Usage

- **Past Releases**: Use specific dates in YYYY-MM-DD format
- **Future Plans**: Avoid specific dates; use "In a future release" or "Planned for implementation"
- **Implementation Timelines**: Use dependency relationships, not calendar dates
  - Example: "Person schema → D3 layout → Canvas generation → GEDCOM integration"

### Documentation Commits

- Use the prefix `docs:` for documentation-only commits
- Example: `docs: Add GEDCOM import guide`

## Documentation Templates

### Feature Documentation

```markdown
# Feature Name

## Overview
Brief description of what the feature does.

## How to Access
How to enable or use the feature.

## Configuration Options
All configuration options with examples.

## Usage Examples
2-3 practical examples.

## Tips and Best Practices
Advice on getting the most out of the feature.

## Troubleshooting
Common issues and solutions.

## Related Features
Links to related documentation.
```

### Tutorial

```markdown
# Tutorial: [Task Name]

## What You'll Learn
What the user will accomplish.

## Prerequisites
What's needed before starting.

## Step 1: [First Task]
Detailed instructions with screenshots.

## Step 2: [Second Task]
Detailed instructions with screenshots.

## Next Steps
Suggestions for what to try next.

## Troubleshooting
Common issues specific to this tutorial.
```

### Technical Documentation

```markdown
# Component Name

## Overview
Technical description of the component.

## Architecture
Component's architecture and design decisions.

## API Reference
Public APIs, interfaces, and types.

## Implementation Details
How the component works internally.

## Testing
Testing strategy and examples.
```

## Review Checklist

Before submitting documentation:

- [ ] Follows voice and tone guidelines
- [ ] Proper formatting and structure
- [ ] Images include alt text
- [ ] Appropriate examples for complex concepts
- [ ] Links to related documentation
- [ ] Code examples are complete and tested
- [ ] Spell-checked and grammar-checked
- [ ] Mobile-friendly
- [ ] All cross-references are valid

---

For the complete template source, see: [Sonigraph Documentation Style Guide](https://github.com/banisterious/sonigraph/blob/main/docs/assets/templates/documentation-style-guide.md)
