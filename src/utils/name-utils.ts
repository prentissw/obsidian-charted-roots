/**
 * Name Component Utilities
 *
 * Shared utilities for extracting and working with name components
 * (surnames, given names, maiden/married names) across the codebase.
 *
 * Supports multiple naming conventions:
 * - Western (single surname as last word of name)
 * - Hispanic/Portuguese (dual surnames)
 * - Compound surnames (e.g., "da Silva", "van der Berg")
 * - Maiden name as primary vs. married name as primary
 */

import type { PersonNode } from '../core/family-graph';

/**
 * Extract surnames from a person for statistics and grouping.
 *
 * Priority order:
 * 1. Explicit `surnames` array (for multi-surname cultures)
 * 2. Explicit `surname` string (for compound surnames)
 * 3. `maiden_name` (for users who use maiden name as primary identifier)
 * 4. Parse last word from `name` (fallback for Western naming)
 *
 * @param person - The person node to extract surnames from
 * @returns Array of surnames (may be empty if no name data)
 */
export function extractSurnames(person: PersonNode): string[] {
	// Priority 1: Explicit surnames array
	if (person.surnames?.length) {
		return person.surnames;
	}

	// Priority 2: Explicit surname string
	if (person.surname) {
		return [person.surname];
	}

	// Priority 3: Maiden name (for users who use maiden name as primary)
	if (person.maidenName) {
		return [person.maidenName];
	}

	// Priority 4: Parse from name (last word)
	if (person.name) {
		const parts = person.name.trim().split(/\s+/);
		if (parts.length > 1) {
			return [parts[parts.length - 1]];
		}
	}

	return [];
}

/**
 * Extract all surname variants for a person.
 *
 * Used for comprehensive matching (e.g., Split Wizard) where we want
 * to match against any surname the person has used.
 *
 * Includes:
 * - Explicit surnames/surname
 * - Maiden name
 * - Married name(s)
 * - Parsed surname from name (as fallback)
 *
 * @param person - The person node to extract surnames from
 * @returns Array of all unique surname variants
 */
export function extractAllSurnames(person: PersonNode): string[] {
	const surnames = new Set<string>();

	// Add explicit surnames
	if (person.surnames?.length) {
		person.surnames.forEach(s => surnames.add(s));
	}
	if (person.surname) {
		surnames.add(person.surname);
	}

	// Add maiden name
	if (person.maidenName) {
		surnames.add(person.maidenName);
	}

	// Add married names
	if (person.marriedNames?.length) {
		person.marriedNames.forEach(s => surnames.add(s));
	}
	if (person.marriedName) {
		surnames.add(person.marriedName);
	}

	// Fallback: parse from name (only if no explicit surnames found)
	if (surnames.size === 0 && person.name) {
		const parts = person.name.trim().split(/\s+/);
		if (parts.length > 1) {
			surnames.add(parts[parts.length - 1]);
		}
	}

	return Array.from(surnames);
}

/**
 * Check if a person matches a target surname.
 *
 * Performs case-insensitive matching against all surname variants.
 *
 * @param person - The person node to check
 * @param targetSurname - The surname to match against
 * @returns True if the person has this surname in any variant
 */
export function matchesSurname(person: PersonNode, targetSurname: string): boolean {
	const normalizedTarget = targetSurname.toLowerCase();
	const surnames = extractAllSurnames(person);
	return surnames.some(s => s.toLowerCase() === normalizedTarget);
}
