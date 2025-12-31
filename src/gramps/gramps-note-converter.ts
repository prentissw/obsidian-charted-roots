/**
 * Gramps Note to Markdown Converter
 *
 * Converts Gramps note content with style ranges to Markdown format.
 */

import { GrampsNote, GrampsStyleRange } from './gramps-types';

/**
 * Convert a Gramps note to Markdown text
 *
 * Handles:
 * - Style ranges (bold, italic, strikethrough, links, etc.)
 * - Format types (flowed vs formatted/preformatted)
 *
 * @param note - The Gramps note to convert
 * @returns Markdown-formatted text
 */
export function convertNoteToMarkdown(note: GrampsNote): string {
	if (!note.text) return '';

	let text = note.text;

	// Apply style ranges if present
	if (note.styles && note.styles.length > 0) {
		text = applyStyles(text, note.styles);
	}

	// Handle formatted (preformatted) notes - preserve whitespace
	if (note.format === 'formatted') {
		// Wrap in code fence to preserve whitespace
		return '```\n' + text + '\n```';
	}

	return text;
}

/**
 * Apply style ranges to text, converting to Markdown syntax
 *
 * Processes styles from end to start to preserve character positions.
 */
function applyStyles(text: string, styles: GrampsStyleRange[]): string {
	// Sort styles by start position descending (process from end to preserve positions)
	const sortedStyles = [...styles].sort((a, b) => b.start - a.start);

	for (const style of sortedStyles) {
		const before = text.slice(0, style.start);
		const content = text.slice(style.start, style.end);
		const after = text.slice(style.end);

		const styledContent = wrapWithStyle(content, style);
		text = before + styledContent + after;
	}

	return text;
}

/**
 * Wrap content with appropriate Markdown syntax for the style type
 */
function wrapWithStyle(content: string, style: GrampsStyleRange): string {
	switch (style.type) {
		case 'bold':
			return `**${content}**`;
		case 'italic':
			return `*${content}*`;
		case 'strikethrough':
			return `~~${content}~~`;
		case 'underline':
			// HTML underline - Markdown doesn't have native underline
			return `<u>${content}</u>`;
		case 'superscript':
			return `<sup>${content}</sup>`;
		case 'subscript':
			return `<sub>${content}</sub>`;
		case 'link':
			if (style.value) {
				return `[${content}](${style.value})`;
			}
			return content;
		default:
			return content;
	}
}

/**
 * Format a note type as a Markdown header
 *
 * Converts Gramps note types like "Person Note" or "Research" to
 * readable header format.
 *
 * @param noteType - The Gramps note type string
 * @returns Formatted header text (without the ### prefix)
 */
export function formatNoteTypeHeader(noteType?: string): string {
	if (!noteType) return 'Note';

	// Already readable - just return as-is
	// Examples: "Person Note", "Research", "Source text", "General"
	return noteType;
}

/**
 * Format multiple notes into a single Markdown section
 *
 * @param notes - Array of Gramps notes to format
 * @returns Markdown content with ## Notes header and subsections
 */
export function formatNotesSection(notes: GrampsNote[]): string {
	if (notes.length === 0) return '';

	const sections: string[] = ['## Notes', ''];

	for (const note of notes) {
		const header = formatNoteTypeHeader(note.type);
		const content = convertNoteToMarkdown(note);

		sections.push(`### ${header}`);
		sections.push('');
		sections.push(content);
		sections.push('');
	}

	return sections.join('\n');
}

/**
 * Check if any notes in an array are marked as private
 *
 * @param notes - Array of Gramps notes to check
 * @returns true if any note has private flag set
 */
export function hasPrivateNote(notes: GrampsNote[]): boolean {
	return notes.some(note => note.private === true);
}
