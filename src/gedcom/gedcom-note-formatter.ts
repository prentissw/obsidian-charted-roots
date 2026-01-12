/**
 * GEDCOM Note Formatter
 *
 * Formats GEDCOM notes as markdown sections for inclusion in person notes.
 */

/**
 * Format GEDCOM notes as a markdown section
 *
 * @param notes - Array of note strings to format
 * @returns Markdown content with ## Notes header and subsections
 */
export function formatGedcomNotesSection(notes: string[]): string {
	if (notes.length === 0) return '';

	const sections: string[] = ['## Notes', ''];

	for (let i = 0; i < notes.length; i++) {
		// Use "GEDCOM note" or "GEDCOM note 1", "GEDCOM note 2" for multiple
		const header = notes.length === 1
			? 'GEDCOM note'
			: `GEDCOM note ${i + 1}`;

		sections.push(`### ${header}`);
		sections.push('');
		sections.push(notes[i]);
		sections.push('');
	}

	return sections.join('\n');
}
