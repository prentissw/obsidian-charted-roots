/**
 * Type definitions for person note frontmatter
 *
 * These interfaces define the expected structure of frontmatter
 * in person notes managed by Canvas Roots.
 */

/**
 * Basic frontmatter fields for a person note.
 * Uses index signature to allow dynamic spouse properties (spouse1, spouse2, etc.)
 */
export interface PersonFrontmatter {
	cr_id?: string;
	name?: string;
	father?: string;
	father_id?: string;
	mother?: string;
	mother_id?: string;
	spouse?: string | string[];
	spouse_id?: string;
	children?: string | string[];
	gender?: string;
	birth_date?: string;
	death_date?: string;
	birth_place?: string;
	death_place?: string;
	group_name?: string;
	// Index signature for dynamic properties (spouse1, spouse1_id, spouse2, etc.)
	[key: string]: string | string[] | undefined;
}

/**
 * Spouse value type - can be string, array, or undefined
 */
export type SpouseValue = string | string[] | undefined;
