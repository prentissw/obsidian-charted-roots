# Canvas Roots Plugin Specification

1. Plugin Overview

- Plugin Name: Canvas Roots
- Goal: To automate the creation and layout of complex family trees within an Obsidian Canvas, using structured note data as the source, driven by a powerful D3.js-based layout algorithm.
- Key Differentiator: It uses the D3 layout engine for positioning, but renders the output as native, linked Obsidian Canvas nodes and edges, allowing for full user customization and contextual linking.
- Core Workflow: User inputs data into person notes → User runs a command on a blank or existing Canvas → Plugin calculates D3 coordinates → Plugin writes the structured data to the Canvas JSON file.

2. Data Model: The Canvas Roots Schema

The plugin must primarily source data from the Obsidian note's YAML frontmatter or inline fields (preferred for DataView compatibility).

2.1 Person Note Fields

The core data for each person node will be stored in individual Markdown notes. The plugin must read and write these properties automatically.

- cr_id (Unique String - UUID): MANDATORY. Unique identifier for the person. Used internally for D3 layout and GEDCOM mapping. Should be generated on note creation.
- name (String): Display name (defaults to file title).
- father ([[Link]]): Link to the father's note file.
- mother ([[Link]]): Link to the mother's note file.
- spouse ([[Link]] / Array<[[Link]]>): Link(s) to partner(s)/spouse(s).
- born (Date YYYY-MM-DD): Birth date (used for display/sorting).
- died (Date YYYY-MM-DD): Death date.
- cr_root (Boolean): true if this person is currently the center of the rendered tree (optional filter).

2.2 Bi-Directional Link Automation (MVP Feature)

The plugin must implement a function that automatically creates the inverse link when a primary relationship is created or modified.

- Example 1 (Parent/Child): If Father:: [[John Smith]] is added to Jane's note, the plugin must check John Smith's note and ensure Child:: [[Jane Doe]] exists (or vice versa).
- Example 2 (Spouse): If Spouse:: [[Jane Doe]] is added to John Smith's note, the plugin must ensure Spouse:: [[John Smith]] is added to Jane Doe's note.

3. Core Feature: D3-to-Canvas Rendering

The plugin will use a command to generate the family tree structure directly into the currently open Canvas file (.canvas).

3.1 Command and Input

- Command: Canvas Roots: Generate Tree for Current Note
- Action: The command is triggered while viewing a Person's note (the "Root Person").

3.2 The Rendering Process

- Data Extraction: The plugin recursively fetches all connected person notes (ancestors and descendants) starting from the Root Person, reading the relationship links.
- Layout Calculation: The raw graph data is transformed into a D3 hierarchy structure. The D3 layout engine, leveraging algorithms suitable for multi-parent graphs (like those found in libraries such as family-chart), is executed internally to calculate the precise x and y coordinates for every node to create a non-overlapping pedigree/descendant chart.
- Canvas JSON Generation:
  - The plugin reads the existing Canvas file contents (JSON).
  - For every person, it generates a new Canvas Node ("type": "file") at the calculated D3 position, linking the node to the person's Markdown file.
  - It generates Canvas Edges to represent all parent-child and spouse relationships.
- Relayout Command: A secondary command (Canvas Roots: Re-Layout Current Canvas) must exist to re-run the layout calculation on existing Canvas nodes. This allows the user to click the button to snap nodes back into the D3-calculated structure after manual rearrangement.

4. Technical Dependencies & Canvas Implementation

4.1 Obsidian API Requirements

- Obsidian API (TypeScript): Essential for core function.
- D3.js Layout Logic: The specific logic for a multi-parent tree layout, similar to that provided by the family-chart library's algorithm, is required for coordinate calculation.
- File I/O: app.vault.read()/app.vault.write() are necessary for modifying the Canvas JSON.
- UI: Notice is required for user feedback.

4.2 Canvas JSON Structure Requirements

The plugin must accurately read and write the Canvas file as defined by the following minimal structure:

```
{
  "nodes": [
    // Node for a Person (File Node)
    {
      "id": "node-uuid-1", // A unique Canvas ID
      "x": 0,             // D3 calculated X-coordinate
      "y": 0,             // D3 calculated Y-coordinate
      "width": 200,       // Fixed or calculated width
      "height": 100,      // Fixed or calculated height
      "type": "file",     // Node type: always 'file' for a person
      "file": "path/to/person/note.md",
      "color": "6"        // Optional color code for styling
    },
    // Node for a Marriage (Pure Text Node or Group) - OPTIONAL for MVP
    {
        "id": "node-uuid-2",
        "x": 50,
        "y": 150,
        "width": 50,
        "height": 30,
        "type": "text",
        "text": "&" // Symbol representing a union
    }
  ],
  "edges": [
    // Edge for a Relationship (e.g., Parent -> Child)
    {
      "id": "edge-uuid-3", // Unique Canvas ID
      "fromNode": "node-uuid-1", // ID of the parent node
      "fromSide": "bottom",       // Side of the parent node to connect from
      "toNode": "node-uuid-4",   // ID of the child node
      "toSide": "top"             // Side of the child node to connect to
    }
  ]
}

```

4.3 ID Mapping and Persistence Logic

The plugin must maintain a relationship between the stable person data and the transient Canvas representation:

1. Node Identification: When reading the Canvas JSON, the plugin must iterate through existing nodes. If a node is of type "file", it must extract the note file path ("file": "...").
2. ID Synchronization: The plugin must use the cr_id property inside the person's Markdown note as the primary, stable key for the D3 calculation. The Canvas node id is a transient value.
3. Position Update: When running the Relayout command, the plugin must match the calculated D3 coordinates (x, y) to the existing Canvas node based on the linked file path, ensuring existing notes are moved, not duplicated.
4. Coordinate Offset: The final calculated x and y coordinates from the D3 layout must be offset (e.g., added to the current Canvas center position) before being written to the Canvas JSON to ensure the new tree segment appears within the user's current viewport.







5. Data Interchange & Advanced Features

This section outlines features related to importing external genealogical data (GEDCOM) and enabling deep data analysis, ensuring flexibility for users who prefer either quick visualization or deep vault synchronization.

5.1 GEDCOM Integration Modes

GEDCOM (Genealogical Data Communication) is the industry standard for family tree data. The plugin must support two distinct ingestion methods via a configuration setting or command option:

- Mode 1: Canvas Visualization (Quick Import)
  - Function: Accepts a .ged file and parses the relationship data directly into the Canvas JSON format.
  - Output: Creates a single Canvas file containing linked, D3-positioned file nodes and edges. Crucially, it does not create individual Markdown notes in the vault, allowing users to visualize an external tree quickly without cluttering their main note structure.

Mode 2: Vault Deep-Sync (Full Integration)
  - Function: Accepts a `.ged` file and parses the complete data structure.
  - Output: Creates a new Markdown file for every individual, place, and source mentioned in the GEDCOM.
    - Property Population: Populates the YAML frontmatter/Properties with all relevant GEDCOM fields (birth/death dates, locations, sources).
    - Bi-directional Links: Automatically establishes [[Link]] connections within the notes to support the relationship tracking defined in Section 2.2.
    - Rich Data/Media: Includes logic to handle and parse links to multimedia or extensive notes referenced in the GEDCOM file.

5.2 Round-Trip Data Synchronization

A key goal is maintaining data integrity across systems:

- Property Population: All parsed GEDCOM fields must be written into the corresponding Obsidian note's frontmatter (Properties), ensuring maximum compatibility with tools like Dataview or Obsidian's built-in Bases for queries and analysis.
- GEDCOM Export (Round-Trip): The plugin must feature a command to compile the current vault data (based on all notes containing a `cr_id`) back into a valid `.ged` file, allowing users to move their edited data back to dedicated genealogy software.

5.3 Relationship Breadth & Analysis

The visualization and data model must support the complexity inherent in genealogical data:

- Expanded Relationships: The D3 layout logic (from the chosen algorithm) must be configured to support visualizing sibling chains and the spouses of siblings, extending the tree beyond direct ancestral lines.
- Analysis Queries: The plugin should expose utility functions or pre-built DataViewJS templates to allow users to query their rich, structured data (e.g., "List all living descendants," "Table of individuals by age at death," or showing notes linked to specific sources).