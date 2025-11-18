# Canvas Roots Plugin - Technical Specification

**Version:** 1.1
**Last Updated:** 2025-11-18
**Status:** Draft

---

## Table of Contents

1. [Overview](#1-overview)
2. [Data Model](#2-data-model)
3. [Core Features](#3-core-features)
4. [Technical Implementation](#4-technical-implementation)
5. [GEDCOM Integration](#5-gedcom-integration)
6. [Enhanced Relationship Modeling](#6-enhanced-relationship-modeling)
7. [World-Building and Organizational Features](#7-world-building-and-organizational-features)

---

## 1. Overview

### 1.1 Purpose

Canvas Roots is an Obsidian plugin that automates the creation and layout of complex family trees within Obsidian Canvas, using structured note data as the source and D3.js-based layout algorithms for positioning.

### 1.2 Key Differentiators

- **Native Canvas Integration:** Renders family trees as native Obsidian Canvas nodes and edges, not embedded visualizations
- **D3.js Layout Engine:** Leverages powerful graph layout algorithms for automatic positioning
- **Full Customization:** Users can manually adjust any node after automatic layout
- **Bidirectional Linking:** Maintains relationship consistency across all person notes
- **GEDCOM Compatibility:** Import and export standard genealogical data formats

### 1.3 Core Workflow

```
User creates person notes with relationship links
           ↓
User runs "Generate Tree" command on Canvas
           ↓
Plugin calculates D3 layout coordinates
           ↓
Plugin renders nodes/edges to Canvas JSON
           ↓
User views and customizes the family tree
```

---

## 2. Data Model

### 2.1 Person Note Schema

Each person in the family tree is represented by an individual Markdown note with YAML frontmatter or inline fields (Dataview compatible).

#### 2.1.1 Core Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `cr_id` | String (UUID) | **Yes** | Unique identifier for the person. Auto-generated on note creation. |
| `name` | String | No | Display name (defaults to file title) |
| `father` | [[Link]] | No | Link to father's note file |
| `mother` | [[Link]] | No | Link to mother's note file |
| `spouse` | [[Link]] or Array | No | Link(s) to spouse(s)/partner(s) |
| `children` | Array<[[Link]]> | No | Links to children's note files (auto-maintained by bidirectional linking) |
| `born` | Date | No | Birth date (see §6.4 for format details) |
| `died` | Date | No | Death date (see §6.4 for format details) |
| `cr_living` | Boolean | No | Explicitly mark if person is living (overrides auto-detection for obfuscation) |
| `cr_root` | Boolean | No | Marks person as tree center (optional filter) |

#### 2.1.2 Extended Properties (See §6)

Additional properties for complex genealogical data:
- Multiple spouse tracking with metadata (§6.1)
- Alternative parent relationships (§6.2)
- Unknown parent markers (§6.3)
- Flexible date formats (§6.4)
- Child ordering fields (§6.5)
- Grandparent direct links (§6.7)
- Relationship quality metadata (§6.8)
- Medical and genetic information (§6.9)
- Location and migration tracking (§6.10)

### 2.2 Bidirectional Link Automation

**Requirement:** The plugin must automatically maintain inverse relationships when primary relationships are created or modified.

**Examples:**
- When `father: [[John Smith]]` is added to Jane's note → ensure `children: [[Jane Doe]]` exists in John's note
- When `spouse: [[Jane Doe]]` is added to John's note → ensure `spouse: [[John Smith]]` exists in Jane's note

**Implementation:** This feature is part of the MVP and must be implemented before 1.0 release.

---

## 3. Core Features

### 3.1 Tree Generation Command

**Command:** `Canvas Roots: Generate Tree for Current Note`

**Trigger Context:** User views a person note (the "root person")

**Actions:**
1. Recursively fetch all connected person notes (ancestors and descendants)
2. Extract relationship data from note properties
3. Build graph data structure
4. Calculate layout using D3.js algorithm
5. Generate Canvas JSON nodes and edges
6. Write to active Canvas file

### 3.2 Re-Layout Command

**Command:** `Canvas Roots: Re-Layout Current Canvas`

**Purpose:** Re-run layout calculation on existing Canvas nodes to snap them back to D3-calculated positions after manual rearrangement.

**Actions:**
1. Read existing Canvas JSON
2. Match Canvas nodes to person notes via file paths
3. Recalculate D3 layout positions
4. Update node coordinates without duplicating

### 3.3 Layout Algorithm

**Requirements:**
- Support multi-parent graphs (not simple trees)
- Handle complex relationships: siblings, multiple spouses, adoptive parents
- Produce non-overlapping layouts
- Similar to algorithms in family-chart library

**Coordinate System:**
- Calculate absolute positions via D3
- Apply viewport offset to center tree in current view
- Maintain consistent spacing between generations

---

## 4. Technical Implementation

### 4.1 Dependencies

| Dependency | Purpose | Version |
|------------|---------|---------|
| Obsidian API | Core plugin functionality | Latest |
| D3.js | Layout calculation | 7.x+ |
| TypeScript | Development language | 5.x+ |

### 4.2 Obsidian API Usage

**Required APIs:**
- `app.vault.read()` - Read Canvas JSON and note files
- `app.vault.write()` - Write Canvas JSON
- `app.vault.getAbstractFileByPath()` - Locate person notes
- `Notice` - User feedback/notifications
- `Plugin` - Core plugin class
- `Command` - Register commands

### 4.3 Canvas JSON Structure

The plugin reads and writes Obsidian's Canvas file format (`.canvas`):

```json
{
  "nodes": [
    {
      "id": "node-uuid-1",
      "x": 0,
      "y": 0,
      "width": 200,
      "height": 100,
      "type": "file",
      "file": "People/John Smith.md",
      "color": "6"
    },
    {
      "id": "node-uuid-2",
      "x": 50,
      "y": 150,
      "width": 50,
      "height": 30,
      "type": "text",
      "text": "&"
    }
  ],
  "edges": [
    {
      "id": "edge-uuid-3",
      "fromNode": "node-uuid-1",
      "fromSide": "bottom",
      "toNode": "node-uuid-4",
      "toSide": "top"
    }
  ]
}
```

**Node Types:**
- **File nodes:** Person cards (link to `.md` files)
- **Text nodes:** Marriage indicators (optional for MVP)

**Edge Properties:**
- Connect parent to child nodes
- Connect spouse nodes
- Side indicators control connection points

### 4.4 ID Mapping and Persistence

**Challenge:** Maintain stable identity across Canvas re-layouts

**Solution:**
1. **Stable ID:** Use `cr_id` from person note as primary key
2. **Transient ID:** Canvas `node.id` can change between layouts
3. **File Path Matching:** Match Canvas nodes to notes via `file` property
4. **Update Strategy:** Modify existing node positions, don't duplicate

**Coordinate Offset:**
- Calculate relative D3 positions
- Add offset based on current Canvas viewport center
- Ensure tree appears in visible area

---

## 5. GEDCOM Integration

### 5.1 Overview

GEDCOM (Genealogical Data Communication) is the industry standard format for family tree data exchange. Canvas Roots supports import and export.

### 5.2 Import Modes

#### Mode 1: Canvas Visualization (Quick Import)

**Purpose:** Rapid visualization without vault modification

**Process:**
1. Parse `.ged` file
2. Extract relationship data
3. Generate Canvas JSON directly
4. **Do not** create Markdown notes in vault

**Use Case:** Preview external family trees without cluttering vault

#### Mode 2: Vault Deep-Sync (Full Integration)

**Purpose:** Complete genealogical data integration

**Process:**
1. Parse `.ged` file completely
2. Create Markdown note for every:
   - Individual (person)
   - Place
   - Source
3. Populate YAML frontmatter with all GEDCOM fields
4. Establish bidirectional [[Link]] connections
5. Handle multimedia references and extended notes

**Use Case:** Migrate genealogical research into Obsidian vault

### 5.3 Export (Round-Trip)

**Command:** `Canvas Roots: Export to GEDCOM`

**Process:**
1. Find all notes containing `cr_id`
2. Extract person data from frontmatter
3. Generate valid `.ged` file
4. Preserve GEDCOM-specific fields for round-trip compatibility

**Purpose:** Allow users to export edited data back to dedicated genealogy software

### 5.4 Data Compatibility and Analysis

**Property Population:**
- All parsed GEDCOM fields stored in frontmatter/Properties
- Maximum compatibility with Dataview and Obsidian Bases
- Enable complex queries and analysis

**Analysis Queries:**

The plugin should provide utility functions and pre-built DataViewJS templates to enable rich data analysis:

**Example Query Templates:**
- "List all living descendants" - Find all people without `died` dates descended from a specific person
- "Table of individuals by age at death" - Calculate and sort lifespans
- "Source-linked individuals" - Show all people connected to specific historical sources
- "Geographic distribution" - Map individuals by birth/death locations
- "Sibling chain visualization" - Display extended sibling relationships and spouses of siblings

**Implementation:**
- Expose helper functions for common genealogical queries
- Provide template library accessible via command palette
- Support complex multi-table queries via Dataview integration
- Enable export of query results to Canvas or tables

### 5.5 Privacy and Data Obfuscation

**Requirement:** Protect personally identifiable information (PII) when sharing family trees publicly or for demonstrations.

#### 5.5.1 Obfuscation Modes

The plugin must support optional obfuscation during export and canvas rendering:

**Export Obfuscation:**
- Applied during GEDCOM export via export dialog option
- Original vault data remains completely intact
- Generate obfuscated `.ged` file for sharing

**Canvas Obfuscation:**
- Temporary display mode for screenshots/presentations
- Toggle via command: `Canvas Roots: Toggle Obfuscation Mode`
- Visual indicator when obfuscation is active
- Does not modify underlying notes

#### 5.5.2 Obfuscation Levels

| Level | Names | Dates | Locations | Notes/Research | Media |
|-------|-------|-------|-----------|----------------|-------|
| **None** | Original | Original | Original | Original | Original |
| **Minimal** | Original | Year only | Original | Original | Original |
| **Standard** | Anonymized | Year only | Region only | Stripped | Excluded |
| **Full** | Anonymized | Fuzzy ranges | Generic | Stripped | Excluded |

#### 5.5.3 Selective Obfuscation Filters

**Requirement:** Apply obfuscation selectively based on individual characteristics for targeted privacy protection.

**Living Individuals Filter:**
- **Auto-detection:** Calculate if person is likely living based on birth date and death date
  - No `died` date AND (`born` within last 110 years OR no `born` date) = Presumed living
  - Configurable threshold (default: 110 years)
- **Manual override:** `cr_living: true/false` property to explicitly mark status
- **Privacy protection:** When "Living individuals only" option is enabled, obfuscate only people marked as living
- **GEDCOM standard:** Aligns with GEDCOM's "LIVING" tag convention

**Children Filter:**
- **Age-based:** Obfuscate individuals under specified age (e.g., under 18)
- **Relationship-based:** Option to obfuscate all individuals in the youngest generation
- **Custom threshold:** Configurable age threshold for minor protection
- **Combined with living filter:** Can apply both filters simultaneously

**Filter Combinations:**

| Filter Setting | Who Gets Obfuscated |
|----------------|---------------------|
| **All individuals** | Everyone in the tree |
| **Living only** | Anyone without death date or born within threshold |
| **Children only** | Anyone under age threshold |
| **Living + Children** | Union of both groups (more protective) |
| **Deceased only** | Inverse - obfuscate historical records, show living (rare use case) |

**Example Configuration:**

```yaml
# In plugin settings or export dialog
obfuscation:
  level: standard
  filters:
    living_only: true
    living_threshold_years: 110
    include_minors: true
    minor_age_threshold: 18
```

**Use Cases:**

**Legal Compliance:**
- GDPR requires explicit consent for living individuals' data
- Many jurisdictions have special protections for minors
- Some genealogical societies restrict sharing living persons' data

**Ethical Genealogy:**
- Protect privacy of living relatives who didn't consent
- Shield children from public exposure
- Share historical research without exposing current family

**Flexible Sharing:**
- Share complete historical tree (deceased only)
- Share structure with living relatives obfuscated for public demos
- Create educational materials protecting recent generations

**Obfuscation Strategies:**

**Names:**
- **Pattern-based:** "Person A", "Person B", "Person C" (maintains readability)
- **Generated:** Use common placeholder names maintaining gender/cultural context
- **Relationship-based:** "Father of Person A", "Mother of Person B"

**Dates:**
- **Year only:** `1847-03-15` → `1847`
- **Decade:** `1847-03-15` → `1840s`
- **Fuzzy ranges:** `1847-03-15` → `circa 1845-1850`
- **Relative:** Maintain age differences and generation gaps

**Locations:**
- **Region only:** "Boston, Massachusetts, USA" → "Massachusetts, USA"
- **Country only:** "Boston, Massachusetts, USA" → "USA"
- **Generic:** "Boston, Massachusetts, USA" → "Urban area, Northeast USA"

**Research Notes:**
- **Strip all:** Remove all note content
- **Summarize:** "Has 3 sources, 2 media attachments"
- **Template:** Replace with placeholder text

**Media:**
- **Exclude links:** Remove all photo/document references
- **Placeholder:** Replace with generic avatar/document icon

#### 5.5.4 Obfuscation Mapping

**Mapping File Generation:**

When obfuscation is applied, optionally generate a JSON mapping file for reversing:

```json
{
  "obfuscation_date": "2025-11-18T15:30:00Z",
  "obfuscation_level": "standard",
  "mappings": {
    "Person A": "John Robert Smith",
    "Person B": "Mary Elizabeth Jones",
    "1847": "1847-03-15",
    "Massachusetts, USA": "Boston, Massachusetts, USA"
  }
}
```

**Security Considerations:**
- Mapping file stored locally only (never included in export)
- User prompted to store in secure location
- Optional encryption of mapping file
- Clear warning that mapping file is sensitive

#### 5.5.5 Structural Integrity

**What Must Be Preserved:**
- Relationship structure (parent-child, spouse connections)
- Relative chronology (birth order, generation gaps)
- `cr_id` values (needed for graph structure)
- Number of children, spouses, generations

**Validation:**
- Obfuscated export must remain valid GEDCOM
- Relationship logic must be testable/verifiable
- Canvas rendering must remain functional

#### 5.5.6 User Interface

**Export Dialog:**
```
┌─────────────────────────────────────────┐
│ Export to GEDCOM                        │
├─────────────────────────────────────────┤
│ Obfuscation Level:                      │
│ ○ None (full data)                      │
│ ○ Minimal (year only)                   │
│ ● Standard (names + dates)              │
│ ○ Full (maximum privacy)                │
│                                         │
│ Apply to:                               │
│ ● All individuals                       │
│ ○ Living individuals only               │
│ ○ Minors only (under 18)                │
│ ○ Living individuals + Minors           │
│                                         │
│ ☑ Generate obfuscation mapping file    │
│ ☑ Include structural statistics only   │
│                                         │
│ [Cancel]              [Export GEDCOM]  │
└─────────────────────────────────────────┘
```

**Canvas Obfuscation Command:**
- Command palette: `Canvas Roots: Toggle Obfuscation Mode`
- Settings to set default obfuscation level
- Status bar indicator when active
- Automatic de-obfuscation on plugin reload

#### 5.5.7 Use Cases

**Public Sharing:**
- Share family tree structure on forums/blogs
- Demonstrate plugin functionality
- Educational examples in genealogy courses

**Collaboration:**
- Share with researchers who need structure, not PII
- Comply with privacy regulations (GDPR, etc.)
- Protect living individuals' information

**Development/Testing:**
- Create realistic test datasets
- Debug layout algorithms with real structure
- Share sample files with plugin developers

---

## 6. Enhanced Relationship Modeling

### 6.1 Multiple Spouse Support

**Requirement:** Support complex marital histories with temporal tracking

**Data Structure:**

```yaml
spouses:
  - person: "[[Jane Doe]]"
    marriage_date: "1985-06-15"
    divorce_date: "1992-03-20"
    marriage_status: divorced
    marriage_location: "[[Boston, MA]]"
  - person: "[[Mary Johnson]]"
    marriage_date: "1995-08-10"
    marriage_status: current
    marriage_location: "[[Seattle, WA]]"
```

**Legacy Support:** Continue accepting `spouse: [[Link]]` format

**Canvas Visualization:**
- Position multiple spouse nodes appropriately
- Visual indicators for marriage order/status
- Connect children to specific spousal relationships when applicable

### 6.2 Multiple and Alternative Parent Relationships

**Requirement:** Track biological, adoptive, step, foster, and guardian relationships

**Extended Fields:**

```yaml
biological_father: "[[John Smith]]"
biological_mother: "[[Jane Smith]]"
adoptive_father: "[[Robert Johnson]]"
adoptive_mother: "[[Susan Johnson]]"
step_father: "[[Michael Brown]]"
step_mother: "[[Lisa Brown]]"
foster_parents:
  - "[[David Wilson]]"
  - "[[Carol Wilson]]"
guardians:
  - "[[Thomas Anderson]]"
```

**Legacy Mapping:** `father` and `mother` default to biological parents

**Visual Differentiation:**
- Different edge styles for relationship types:
  - Solid lines: biological
  - Dashed lines: adoptive
  - Dotted lines: step-parents
  - Custom colors per relationship type
- Edge labels for clarity

**Settings:** Control which parent types display by default

### 6.3 Unknown or Missing Parent Handling

**Requirement:** Represent incomplete genealogical data clearly

**Data Markers:**

```yaml
father: unknown
mother: null
father_researching: true
mother_surname_only: "O'Brien"
```

**Canvas Placeholder Nodes:**
- Optional "Unknown Father" / "Unknown Mother" nodes
- Distinct visual styling (gray, dashed border)
- Settings toggle for show/hide

**Partial Parent Data:** Store limited information when available

### 6.4 Flexible Date Precision

**Requirement:** Handle varying levels of date precision in historical records

**Supported Formats:**

| Format | Example | Precision |
|--------|---------|-----------|
| `YYYY` | `1847` | Year only |
| `YYYY-MM` | `1847-03` | Year and month |
| `YYYY-MM-DD` | `1847-03-15` | Full date |
| `~YYYY` | `~1847` | Approximate year |
| `circa YYYY` | `circa 1847` | Approximate year |
| `YYYY/YYYY` | `1847/1848` | Date range |

**Display Formatting:**
- Render based on available precision
- Examples: "1847", "March 1847", "15 March 1847"

**Date Calculations:**
- Unknown month/day defaults to mid-year or mid-month
- Age calculations handle partial dates gracefully
- Comparison operations account for precision differences

**GEDCOM Compatibility:** Align with GEDCOM date standards

### 6.5 Child Ordering and Sibling Relationships

**Requirement:** Flexible organization of children within families

**Sorting Options:**

```yaml
# Manual ordering
birth_order: 3

# Automatic sort options (global setting):
# - sort_by_age (eldest to youngest)
# - sort_by_age_reverse (youngest to eldest)
# - alphabetical
# - custom_sort_field
```

**Settings:**
- Global default sort method
- Per-person override via frontmatter

**Canvas Layout:** D3 algorithm respects child ordering when positioning horizontally

**Sibling Relationships:**

```yaml
siblings:
  - "[[Thomas Anderson]]"
  - "[[Sarah Anderson]]"
```

**Use Case:** Document sibling connections when parent relationships are unknown

### 6.6 Customizable Canvas Card Display

**Requirement:** User control over canvas node appearance

**Display Settings:**

**Property Selection:**
- Configurable list of fields to display
- Drag-to-reorder interface
- Save as global default or per-template

**Conditional Display Rules:**
- Show `died` only if person is deceased
- Show age at death if both birth and death dates available
- Show location fields only when populated
- Show relationship type badges

**Card Layout Templates:**

| Template | Contents |
|----------|----------|
| **Compact** | Name and vital dates only |
| **Standard** | Name, dates, primary locations |
| **Detailed** | All configured properties |
| **Custom** | User-defined format with placeholders |

**Example Custom Template:**

```
{{name}}
b. {{born}} - d. {{died}}
{{birth_location}}
Age: {{age_at_death}}
```

**Per-Person Overrides:**

```yaml
cr_card_template: detailed
cr_card_color: "3"
```

### 6.7 Multi-Generational Gap Handling

**Requirement:** Handle missing intermediate generations in family trees

**Grandparent Direct Links:**

```yaml
# When parent records don't exist
grandfather_paternal: "[[James Smith]]"
grandmother_paternal: "[[Mary Smith]]"
grandfather_maternal: "[[John Doe]]"
grandmother_maternal: "[[Sarah Doe]]"
```

**Canvas Visualization:**
- Show multi-generational connection with visual indicator
- Optional placeholder generation for missing intermediate parents
- Distinct edge styling (e.g., dashed lines, different colors) for generational jumps

**Data Inference:**
- Option to automatically infer missing parent relationships
- Create placeholder nodes when grandparents exist but parents don't

**Settings Toggle:** User control over displaying inferred/placeholder relationships

### 6.8 Relationship Quality and Emotional Bonds

**Requirement:** Track and visualize the quality of relationships between family members, inspired by GenoPro's genogram capabilities.

#### 6.8.1 Relationship Quality Metadata

**Data Structure:**

```yaml
relationships:
  - person: "[[John Smith]]"
    type: spouse
    quality: harmonious
    notes: "Married 50 years, very close relationship"

  - person: "[[Jane Doe]]"
    type: parent
    quality: estranged
    since: "1995"
    notes: "No contact since 1995 due to family conflict"

  - person: "[[Bob Smith]]"
    type: sibling
    quality: distant
    contact_frequency: yearly
```

**Quality Types:**

| Quality | Description | Visual Indicator |
|---------|-------------|------------------|
| `harmonious` | Close, positive relationship | Solid green edge |
| `close` | Strong bond, frequent contact | Solid blue edge |
| `neutral` | Standard relationship | Standard edge (default) |
| `distant` | Infrequent contact, weak bond | Dashed gray edge |
| `conflicted` | Active conflict, tension | Wavy orange edge |
| `estranged` | No contact, severed relationship | Dotted red edge |
| `hostile` | Active hostility or animosity | Zigzag red edge |
| `deceased_close` | Was close before death | Faded blue edge |

#### 6.8.2 Canvas Visualization

**Edge Styling:**
- **Color coding:** Different colors for relationship quality
- **Line patterns:** Solid, dashed, dotted, wavy, zigzag
- **Line thickness:** Thicker for closer relationships
- **Opacity:** Faded for historical relationships

**Hover/Click Information:**
- Display relationship metadata on edge hover
- Show quality, duration, notes
- Timeline of relationship changes if tracked

**Settings:**
- Toggle relationship quality visualization on/off
- Choose color scheme for relationship types
- Adjust edge styling preferences

#### 6.8.3 Relationship Evolution

**Temporal Tracking:**

```yaml
relationship_history:
  - person: "[[John Smith]]"
    periods:
      - from: "1985"
        to: "1990"
        quality: harmonious
        notes: "Early marriage years"
      - from: "1990"
        to: "1995"
        quality: conflicted
        notes: "Career stress period"
      - from: "1995"
        to: "2020"
        quality: harmonious
        notes: "Reconciliation and renewed closeness"
```

**Use Cases:**
- Track evolving relationships over time
- Document family dynamics and changes
- Understand patterns in family conflicts
- Therapy and family counseling contexts

### 6.9 Medical Genogram Support

**Requirement:** Track medical, genetic, and health information for genealogical health pattern analysis, inspired by GenoPro's medical genogram features.

#### 6.9.1 Health Data Structure

**Medical Conditions:**

```yaml
medical:
  conditions:
    - name: "Type 2 Diabetes"
      onset: "2010"
      severity: moderate
      status: managed

    - name: "Coronary Heart Disease"
      onset: "2015"
      severity: severe
      status: ongoing
      treatment: "Bypass surgery 2016"

  genetic_traits:
    - trait: "Blue eyes"
      inherited_from: maternal

    - trait: "Red hair"
      inherited_from: paternal

    - trait: "Left-handedness"

  cause_of_death: "Cardiac arrest"
  death_circumstances: "Sudden, at home"

  medical_history:
    - date: "2010-03"
      event: "Diagnosed with Type 2 Diabetes"
      provider: "Dr. Johnson"

    - date: "2016-08"
      event: "Coronary bypass surgery"
      hospital: "[[Massachusetts General Hospital]]"
```

#### 6.9.2 Genetic Pattern Tracking

**Inheritance Tracking:**

```yaml
genetic_markers:
  - marker: "BRCA1 mutation"
    status: positive
    tested: "2018-05"
    inherited_from: "[[Mother]]"

  - marker: "Hemochromatosis"
    status: carrier
    tested: "2019-02"
```

**Family Health Patterns:**
- Auto-detect patterns across generations
- Flag common conditions (e.g., "Diabetes appears in 3 generations")
- Highlight genetic risk factors

#### 6.9.3 Canvas Visualization

**Medical Symbols:**
- Icon overlays on person cards
- Color-coded health indicators
- Genetic trait badges

**Symbol System:**

| Condition Type | Symbol | Color |
|----------------|--------|-------|
| Heart disease | ❤️ | Red |
| Diabetes | 🔵 | Blue |
| Cancer | 🎗️ | Pink/purple |
| Mental health | 🧠 | Teal |
| Genetic marker | 🧬 | Green |
| Deceased | † | Gray |

**Genetic Inheritance Lines:**
- Special edge styling for genetic traits
- Trace inheritance paths across generations
- Show carrier status vs. affected status

#### 6.9.4 Privacy Considerations

**Medical Data Sensitivity:**
- Medical data automatically excluded from obfuscation exports by default
- Option to fully strip medical data from exports
- HIPAA-aware data handling recommendations
- Special permissions for medical data access

**Settings:**
- Toggle medical symbol display
- Control medical data export inclusion
- Set medical data obfuscation separately from other PII

#### 6.9.5 Use Cases

**Clinical Genealogy:**
- Genetic counseling and risk assessment
- Family medicine and preventive care
- Medical research and pattern analysis

**Personal Health:**
- Track family health history for medical appointments
- Understand genetic risk factors
- Plan preventive health measures

**Research:**
- Longitudinal health studies
- Genetic pattern research
- Epidemiological analysis

### 6.10 Enhanced Location and Migration Tracking

**Requirement:** Comprehensive location tracking and geographic migration pattern visualization.

#### 6.10.1 Location Data Model

**Core Location Properties:**

```yaml
locations:
  birth_place: "[[Boston, Massachusetts, USA]]"
  birth_coordinates: "42.3601,-71.0589"

  death_place: "[[Seattle, Washington, USA]]"
  death_coordinates: "47.6062,-122.3321"

  residences:
    - place: "[[New York City, New York, USA]]"
      coordinates: "40.7128,-74.0060"
      from: "1950"
      to: "1965"
      address: "123 Main Street, Manhattan"
      residence_type: rental

    - place: "[[Los Angeles, California, USA]]"
      coordinates: "34.0522,-118.2437"
      from: "1965"
      to: "1980"
      address: "456 Ocean Ave"
      residence_type: owned
      notes: "Moved for career opportunity"

  current_location: "[[Portland, Oregon, USA]]"
  current_coordinates: "45.5152,-122.6784"
```

**Migration Events:**

```yaml
migrations:
  - from: "[[Ireland]]"
    to: "[[United States]]"
    date: "1890"
    reason: "Irish Potato Famine emigration"
    port_of_entry: "[[Ellis Island, New York]]"
    ship: "SS Celtic"

  - from: "[[Italy]]"
    to: "[[Argentina]]"
    date: "1910"
    reason: "Economic opportunity"
    traveling_with:
      - "[[Giuseppe Romano]]"
      - "[[Maria Romano]]"
```

#### 6.10.2 Geographic Visualization

**Map Integration:**
- Link to external mapping services (Google Maps, OpenStreetMap)
- Show migration routes on separate canvas view
- Timeline view with geographic distribution

**Canvas Features:**
- Color-code person nodes by birth location region
- Migration path edges between parent/child nodes
- Cluster view showing family members by location

**Migration Patterns:**
- Visualize family diaspora over generations
- Show emigration/immigration waves
- Track urbanization patterns

#### 6.10.3 Place Notes

**Centralized Place Management:**

Create dedicated Place notes with standardized structure:

```yaml
# In Places/Boston-Massachusetts.md
---
place_type: city
coordinates: "42.3601,-71.0589"
country: "[[United States]]"
region: "[[Massachusetts]]"
aliases: ["Boston", "Beantown"]
---

## People Born Here
- [[John Smith]]
- [[Jane Doe]]

## People Who Lived Here
- [[Bob Johnson]] (1950-1965)

## Historical Context
Founded in 1630, Boston was a major center for...
```

**Benefits:**
- Centralized location information
- Easy queries by place
- Historical context for locations
- Automatic backlinks to people

#### 6.10.4 Use Cases

**Migration Research:**
- Track family immigration patterns
- Document refugee and displacement histories
- Understand cultural diaspora

**Social History:**
- Urbanization trends within families
- Economic migration patterns
- Regional cultural influence

**Medical Correlation:**
- Environmental health factors by location
- Regional disease patterns
- Climate and health correlations

---

## 7. World-Building and Organizational Features

**Purpose:** Extend Canvas Roots beyond traditional genealogy to support fantasy world-building, historical dynasties, corporate succession tracking, and institutional evolution.

### 7.1 Visual Grouping and Styling Rules

**Requirement:** Apply conditional visual styling to canvas nodes based on custom properties, enabling multi-dimensional family tree analysis.

#### 7.1.1 Property-Based Grouping

**Data Structure:**

```yaml
# In person notes
kingdom: "[[House Stark]]"
lineage: "direct"
succession_status: "eligible"
allegiance: "[[The North]]"
house: "[[Stark]]"
region: "[[Winterfell]]"
```

**Grouping Criteria:**

| Criterion | Description | Use Case |
|-----------|-------------|----------|
| **Kingdom/House** | Political affiliation | Royal dynasties, noble houses |
| **Lineage Type** | Direct vs. cadet branches | Succession eligibility visualization |
| **Geographic Region** | Location-based grouping | Regional power dynamics |
| **Allegiance** | Factional loyalty | Civil wars, political divisions |
| **Social Class** | Nobility, commoner, clergy | Class-based analysis |
| **Organization** | Corporate divisions, departments | Organizational charts |

#### 7.1.2 Styling Rules Engine

**Settings Configuration:**

```yaml
# In plugin settings
styling_rules:
  - name: "House Colors"
    property: kingdom
    type: background_color
    mappings:
      "[[House Stark]]": "#808080"
      "[[House Lannister]]": "#FFD700"
      "[[House Targaryen]]": "#DC143C"
      "[[House Baratheon]]": "#000000"

  - name: "Succession Eligibility"
    property: succession_status
    type: border_style
    mappings:
      "eligible": "solid 3px gold"
      "excluded": "dashed 1px gray"
      "contested": "dotted 2px red"

  - name: "Direct Lineage Indicator"
    property: lineage
    type: icon_overlay
    mappings:
      "direct": "👑"
      "cadet": "🛡️"
      "bastard": "⚔️"
```

**Visual Properties:**

- **Background color:** Distinguish houses, factions, organizations
- **Border styling:** Indicate status, eligibility, role
- **Icon overlays:** Add symbolic indicators
- **Node size:** Emphasize importance or power level
- **Text color:** Improve contrast and readability
- **Opacity:** De-emphasize extinct lines or minor branches

#### 7.1.3 Multiple Overlay System

**Requirement:** Toggle between different visual grouping schemes without recreating the tree.

**Implementation:**

- **Preset Overlays:** Save multiple styling rule sets
- **Quick Toggle:** Keyboard shortcuts or UI buttons to switch
- **Layer Combination:** Apply multiple overlays simultaneously

**Example Overlays:**

| Overlay Name | Visual Scheme | Purpose |
|--------------|---------------|---------|
| **House Allegiance** | Color by kingdom/house | Political structure |
| **Succession Lines** | Border styles by eligibility | Inheritance tracking |
| **Geographic Regions** | Color by location | Regional power analysis |
| **Living vs. Deceased** | Opacity by status | Current vs. historical |
| **Generation Depth** | Gradient by distance from root | Chronological visualization |

**Canvas Display:**
- Overlay selector toolbar in Canvas view
- Legend panel showing current color/style mappings
- Non-destructive visual changes (original data unchanged)

### 7.2 Dual Relationship Trees

**Requirement:** Display two different relationship types simultaneously on the same Canvas, supporting both biological and organizational/political connections.

#### 7.2.1 Relationship Type System

**Data Structure:**

```yaml
# Biological relationships (traditional)
father: "[[Tywin Lannister]]"
mother: "[[Joanna Lannister]]"

# Organizational/political relationships
political_predecessor: "[[Robert Baratheon]]"
political_successor: "[[Tommen Baratheon]]"
mentor: "[[Jon Arryn]]"
heir_designated: "[[Joffrey Baratheon]]"
```

**Relationship Categories:**

| Category | Edge Type | Use Cases |
|----------|-----------|-----------|
| **Biological** | `father`, `mother`, `children` | Traditional genealogy |
| **Political** | `predecessor`, `successor`, `heir` | Royal succession |
| **Organizational** | `reports_to`, `manages`, `replaced_by` | Corporate charts |
| **Mentorship** | `mentor`, `apprentice`, `teacher` | Knowledge transfer |
| **Legal** | `guardian`, `ward`, `adoptive_parent` | Guardianship chains |

#### 7.2.2 Dual Tree Visualization

**Display Modes:**

1. **Overlay Mode:** Show both relationship types on same canvas with different edge styles
2. **Side-by-Side Mode:** Split canvas showing two separate trees
3. **Comparison Mode:** Highlight where biological and political lines diverge

**Edge Differentiation:**

```yaml
# Visual styling for relationship types
edge_styles:
  biological:
    color: "#4A90E2"
    style: solid
    width: 2
    label: ""

  political:
    color: "#E24A4A"
    style: dashed
    width: 2
    label: "👑"

  organizational:
    color: "#4AE290"
    style: dotted
    width: 2
    label: "🏢"
```

**Canvas Features:**
- Toggle biological/political edges on/off
- Filter to show only one relationship type
- Highlight nodes where relationships diverge
- Show combined path from root person through both trees

#### 7.2.3 Use Cases

**Historical Dynasties:**
- Show biological descent vs. actual succession
- Track usurpations, elective monarchies, non-hereditary transfers
- Example: "Charlemagne → biological children vs. actual Holy Roman Emperors"

**Corporate Succession:**
- Biological family ownership vs. management hierarchy
- Track family businesses across generations
- Show professional vs. familial relationships

**Fantasy World-Building:**
- Game of Thrones-style succession with multiple claimants
- Track rightful vs. actual rulers
- Show mentor chains alongside bloodlines

**Institutional Evolution:**
- Academic lineages (advisor → student)
- Religious leadership (biological vs. spiritual succession)
- Craft guilds (master → apprentice vs. family inheritance)

### 7.3 Succession Rules Engine

**Requirement:** Support complex, customizable succession rules beyond simple parent-to-child inheritance.

#### 7.3.1 Rule Definition System

**Data Structure:**

```yaml
# In settings or per-organization notes
succession_rules:
  - name: "Salic Law"
    description: "Male-preference primogeniture, excludes females"
    query: |
      gender: male
      AND parent: [current_ruler]
      ORDER BY: birth_date ASC
      LIMIT: 1

  - name: "Agnatic-Cognatic Primogeniture"
    description: "Male preference, females if no males"
    priority:
      - filter: "gender: male AND parent: [current_ruler]"
        order: "birth_date ASC"
      - filter: "gender: female AND parent: [current_ruler]"
        order: "birth_date ASC"

  - name: "Matrilineal Succession"
    description: "Inheritance through female line only"
    query: |
      gender: female
      AND mother: [current_ruler]
      ORDER BY: birth_date ASC
      LIMIT: 1

  - name: "Elective Monarchy"
    description: "Chosen from eligible candidates"
    query: |
      eligibility: eligible
      AND house: [current_house]
      ORDER BY: votes DESC, influence DESC
```

#### 7.3.2 Complex Query Support

**Query Language Features:**

```yaml
# Example: "Next male descended from this woman through any path"
succession_query:
  base: "[[Queen Elizabeth]]"
  filter: "gender: male"
  path: "descendant"
  lineage: "matrilineal"
  order: "proximity ASC, age DESC"
  exclude:
    - "succession_excluded: true"
    - "house: [[Enemy House]]"
```

**Supported Operators:**

| Operator | Purpose | Example |
|----------|---------|---------|
| `AND`, `OR`, `NOT` | Logical combinations | `gender: male AND NOT excluded: true` |
| `ORDER BY` | Priority sorting | `ORDER BY birth_date ASC, proximity DESC` |
| `LIMIT` | Result count | `LIMIT 1` (single heir) or `LIMIT 5` (council) |
| `FILTER` | Conditional filtering | `house: [[Current Dynasty]]` |
| `PATH` | Relationship traversal | `descendant`, `matrilineal`, `patrilineal` |

#### 7.3.3 Canvas Visualization

**Succession Highlighting:**
- Highlight eligible candidates based on current rule
- Show succession order with numerical badges
- Visual path from current ruler to next heir
- Display excluded candidates with distinct styling

**Rule Comparison View:**
- Show different heirs under different succession laws
- Side-by-side comparison of Salic vs. Agnatic-Cognatic
- Historical "what-if" analysis

**Settings:**
- Select active succession rule
- Toggle succession visualization on/off
- Configure custom rules in UI

#### 7.3.4 Use Cases

**Historical Analysis:**
- Track wars of succession
- Analyze dynastic disputes
- Compare cultural succession traditions

**World-Building:**
- Define fantasy kingdom inheritance laws
- Create alien species succession rituals
- Model post-apocalyptic leadership transfer

**Organizational:**
- CEO succession planning
- Board member rotation rules
- Academic department chair selection

### 7.4 Co-Ruling and Shared Positions

**Requirement:** Visualize situations where multiple individuals share power, rule jointly, or hold regencies.

#### 7.4.1 Co-Ruling Data Model

**Data Structure:**

```yaml
# Co-ruling configuration
rulership:
  - title: "King of England"
    rulers:
      - person: "[[William III]]"
        role: primary
      - person: "[[Mary II]]"
        role: co_ruler
    from: "1689"
    to: "1694"
    type: joint_sovereignty

  - title: "Roman Emperor"
    rulers:
      - person: "[[Marcus Aurelius]]"
        role: senior_augustus
      - person: "[[Lucius Verus]]"
        role: junior_augustus
    from: "161 CE"
    to: "169 CE"
    type: co_emperorship
```

**Co-Ruling Types:**

| Type | Description | Historical Examples |
|------|-------------|---------------------|
| **Joint Sovereignty** | Equal co-rulers | William & Mary of England |
| **Senior/Junior** | Hierarchical co-rule | Roman co-emperors |
| **Regency** | Temporary rule during minority | Queen Mother regencies |
| **Triumvirate** | Rule by committee of 3+ | First Triumvirate (Rome) |
| **Dual Monarchy** | Separate crowns, same person | Personal unions |
| **Consort Rule** | Spouse with shared power | Spanish Catholic Monarchs |

#### 7.4.2 Regency and Guardianship

**Data Structure:**

```yaml
# Regency during minority or incapacity
regency:
  - ward: "[[Henry VI of England]]"
    regent: "[[Humphrey, Duke of Gloucester]]"
    from: "1422"
    to: "1437"
    reason: minority
    regent_title: "Lord Protector"

  - ward: "[[Louis IX of France]]"
    regent: "[[Blanche of Castile]]"
    from: "1226"
    to: "1234"
    reason: minority
    relationship: mother
```

**Regency Types:**
- **Minority:** Child ruler with adult regent
- **Incapacity:** Illness or absence
- **Interim:** Between deaths/abdications
- **Ceremonial:** Symbolic rulership

#### 7.4.3 Canvas Visualization

**Co-Ruler Nodes:**
- **Linked nodes:** Visual connector between co-rulers
- **Merged node:** Single node with multiple portraits/names
- **Hierarchical positioning:** Senior above junior rulers
- **Temporal indicators:** Show duration of joint rule

**Regency Indicators:**
- **Overlay badge:** Crown with "R" for regent
- **Dotted connection:** Ward to regent
- **Timeline bar:** Show regency duration
- **Age indicator:** Display ward's age during regency

**Visual Styles:**

```yaml
co_ruler_style:
  node_grouping: true
  connection_type: "thick horizontal bar"
  shared_title_display: true
  individual_dates: true

regency_style:
  regent_badge: "R"
  edge_style: "dotted"
  edge_color: "purple"
  temporal_overlay: true
```

#### 7.4.4 Triumvirate and Council Rule

**Multi-Person Governance:**

```yaml
# Triumvirate or ruling council
governance:
  - body: "First Triumvirate"
    members:
      - "[[Julius Caesar]]"
      - "[[Pompey]]"
      - "[[Crassus]]"
    from: "60 BCE"
    to: "53 BCE"
    type: informal_alliance

  - body: "Swiss Federal Council"
    members:
      - "[[Member 1]]"
      - "[[Member 2]]"
      # ... (7 members total)
    from: "1848"
    to: "present"
    type: collegial_government
    rotation: true
    rotating_president: true
```

**Canvas Features:**
- Cluster visualization for councils
- Radial layout around central institution node
- Show member rotation over time
- Highlight rotating presidency

### 7.5 Organizational Evolution and Timeline Branching

**Requirement:** Track organizations, kingdoms, corporations, and institutions as they merge, split, are conquered, or evolve over time.

#### 7.5.1 Organizational Entity Model

**Data Structure:**

```yaml
# Organization/institution as a separate entity type
organization:
  name: "Kingdom of Mercia"
  type: kingdom
  founded: "527 CE"
  dissolved: "918 CE"
  predecessor_of: "[[Kingdom of England]]"
  absorbed_by: "[[Wessex]]"
  territories:
    - "[[East Midlands]]"
    - "[[West Midlands]]"
  rulers:
    - person: "[[Penda of Mercia]]"
      from: "626"
      to: "655"
    - person: "[[Offa of Mercia]]"
      from: "757"
      to: "796"
```

#### 7.5.2 Merger and Split Events

**Data Structure:**

```yaml
# Organizational transformations
transformations:
  - type: merger
    date: "1707"
    entities_merged:
      - "[[Kingdom of England]]"
      - "[[Kingdom of Scotland]]"
    result: "[[Kingdom of Great Britain]]"
    legal_basis: "Acts of Union 1707"

  - type: split
    date: "1776"
    source: "[[British Empire]]"
    results:
      - entity: "[[United States of America]]"
        reason: independence
      - entity: "[[British Empire]]"
        status: continued

  - type: conquest
    date: "1066"
    conqueror: "[[Norman Duchy]]"
    conquered: "[[Kingdom of England]]"
    result: "[[Norman England]]"
    ruler: "[[William the Conqueror]]"

  - type: partition
    date: "1947"
    source: "[[British India]]"
    results:
      - "[[India]]"
      - "[[Pakistan]]"
    reason: "Independence and religious partition"
```

#### 7.5.3 Canvas Visualization

**Timeline Branching:**
- **Horizontal timeline:** Organizations as horizontal nodes
- **Split visualization:** Single node branches into multiple
- **Merge visualization:** Multiple nodes converge into one
- **Conquest overlay:** Show dominance relationships

**Organizational Node Styling:**

```yaml
org_node_style:
  shape: rectangular
  size: larger_than_person_nodes
  border: double_line
  color: distinct_from_people
  icon: institution_symbol
```

**Relationship Edges:**

| Edge Type | Visual Style | Meaning |
|-----------|--------------|---------|
| `preceded_by` | Dotted arrow | Institutional succession |
| `absorbed_by` | Solid arrow with X | Merger/conquest |
| `split_into` | Branching arrow | Division/partition |
| `ruled_by` | Dashed line | Governance connection |
| `allied_with` | Double line | Alliance/partnership |

#### 7.5.4 Corporate and Business Use Cases

**Company Evolution:**

```yaml
company:
  name: "Standard Oil"
  founded: "1870"
  founder: "[[John D. Rockefeller]]"
  split_date: "1911"
  split_reason: "Antitrust ruling"
  successors:
    - "[[Standard Oil of New Jersey]]" # (Exxon)
    - "[[Standard Oil of New York]]" # (Mobil)
    - "[[Standard Oil of California]]" # (Chevron)
    - "[[Standard Oil of Indiana]]" # (Amoco)
```

**Modern Mergers:**

```yaml
merger:
  date: "2015"
  companies:
    - "[[Kraft Foods]]"
    - "[[Heinz]]"
  result: "[[Kraft Heinz Company]]"
  ceo: "[[Bernardo Hees]]"
  market_cap: "$100 billion"
```

#### 7.5.5 Canvas Features

**Timeline View:**
- Horizontal organizational timeline
- Show splits, mergers, conquests chronologically
- Person nodes connected to organizational nodes
- Filter by organization type (kingdom, corporation, institution)

**Dual Layer Display:**
- Bottom layer: Organizational entities and evolution
- Top layer: Individual rulers/leaders/CEOs
- Connections between person and organization layers

**Query System:**
- "Show all successors of Roman Empire"
- "Display corporate family tree of Standard Oil"
- "Track territory changes of Kingdom of France 800-1800"

### 7.6 Use Case Examples

#### 7.6.1 Fantasy World-Building

**Scenario:** Game of Thrones-style dynasty tracking

**Features Used:**
- Visual grouping by house (§7.1)
- Dual biological/political trees (§7.2)
- Custom succession rules (§7.3)
- Co-ruling visualization (§7.4)
- Kingdom evolution (§7.5)

**Implementation:**

```yaml
# Targaryen succession with multiple claimants
person: "[[Daenerys Targaryen]]"
house: "[[House Targaryen]]"
succession_claim: legitimate
biological_father: "[[Aerys II Targaryen]]"
political_predecessor: null  # Usurped throne
rivals:
  - "[[Jon Snow]]"  # Better biological claim
  - "[[Cersei Lannister]]"  # Current holder
```

#### 7.6.2 Historical Dynasty Research

**Scenario:** European royal succession analysis

**Features Used:**
- Multiple overlays for different time periods (§7.1.3)
- Salic law vs. Agnatic-Cognatic rules (§7.3)
- Personal unions and co-rulership (§7.4)
- Kingdom mergers (§7.5)

**Example:** Habsburg dynasty tracking across Spain, Austria, Holy Roman Empire

#### 7.6.3 Corporate Succession Planning

**Scenario:** Family business transfer across generations

**Features Used:**
- Dual trees: biological family + management hierarchy (§7.2)
- Organizational evolution: company splits/mergers (§7.5)
- Custom succession rules: primogeniture vs. merit-based (§7.3)

**Implementation:**

```yaml
company: "[[Smith & Sons Manufacturing]]"
founder: "[[Robert Smith]]"
current_ceo: "[[Jennifer Smith]]"
succession_plan:
  rule: "primogeniture with board approval"
  candidates:
    - "[[Michael Smith]]"  # Eldest child
    - "[[Sarah Smith]]"  # Most qualified
```

#### 7.6.4 Civilization Evolution

**Scenario:** Rise and fall of empires over millennia

**Features Used:**
- Organizational timeline (§7.5)
- Conquest and partition visualization (§7.5.2)
- Migration tracking (§6.10)
- Geographic grouping (§7.1)

**Example:** Roman Republic → Roman Empire → Eastern/Western split → Byzantine Empire

---

## Appendix A: Implementation Priorities

### MVP (Minimum Viable Product)
- Core data model (§2.1.1)
- Bidirectional link automation (§2.2)
- Tree generation command (§3.1)
- Basic D3 layout
- Canvas JSON read/write (§4.3)

### Phase 2
- Re-layout command (§3.2)
- GEDCOM import Mode 1 (§5.2)
- Flexible date precision (§6.4)
- Basic card customization (§6.6)

### Phase 3
- GEDCOM import Mode 2 (§5.2)
- GEDCOM export (§5.3)
- Basic obfuscation (export only) (§5.5)
- Multiple spouse support (§6.1)
- Alternative parent relationships (§6.2)
- Unknown parent handling (§6.3)

### Phase 4
- Advanced obfuscation (canvas mode, all levels) (§5.5)
- Child ordering (§6.5)
- Advanced card templates (§6.6)
- Multi-generational gaps (§6.7)
- DataView template library (§5.4)
- Basic location tracking (§6.10)

### Phase 5 (GenoPro-Inspired Features)
- Relationship quality visualization (§6.8)
- Medical genogram support (§6.9)
- Enhanced migration tracking (§6.10.2)
- Place note system (§6.10.3)
- Genetic pattern analysis (§6.9.2)
- Medical privacy controls (§6.9.4)

### Phase 6 (World-Building and Organizational Features)
- Visual grouping and styling rules (§7.1)
- Property-based grouping and overlays (§7.1.1-7.1.3)
- Dual relationship trees (§7.2)
- Succession rules engine (§7.3)
- Co-ruling and regency visualization (§7.4)
- Organizational evolution tracking (§7.5)
- Timeline branching for institutions (§7.5.2-7.5.3)

---

## Appendix B: Related Documentation

- **Architecture Overview:** [docs/architecture/overview.md](docs/architecture/overview.md)
- **Code Style Guide:** [docs/assets/templates/documentation-style-guide.md](docs/assets/templates/documentation-style-guide.md)
- **Original Spec (Archived):** [docs/archive/canvas-roots-initial-spec.md](docs/archive/canvas-roots-initial-spec.md)

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Canvas** | Obsidian's infinite canvas feature for visual organization |
| **D3.js** | JavaScript library for data visualization and layout algorithms |
| **GEDCOM** | Genealogical Data Communication - standard format for family tree data |
| **Frontmatter** | YAML metadata block at the top of Markdown files |
| **Dataview** | Popular Obsidian plugin for querying and displaying note metadata |
| **Bidirectional Link** | Reciprocal relationship links between two notes |
| **cr_id** | Canvas Roots unique identifier for each person |

---

**End of Specification**
