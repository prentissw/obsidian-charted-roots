/**
 * Person data model matching the Canvas Roots Schema
 */
export interface Person {
	/** Unique identifier (UUID) - MANDATORY */
	cr_id: string;

	/** Display name (defaults to file title) */
	name: string;

	/** Path to the person's note file */
	filePath: string;

	/** Link to father's note */
	father?: string;

	/** Link to mother's note */
	mother?: string;

	/** Link(s) to spouse(s) */
	spouse?: string | string[];

	/** Birth date (YYYY-MM-DD) */
	born?: string;

	/** Death date (YYYY-MM-DD) */
	died?: string;

	/** Whether this person is the root of the tree */
	cr_root?: boolean;

	/** Children links */
	child?: string | string[];
}

/**
 * Normalized person data for graph processing
 */
export interface PersonNode {
	id: string;
	name: string;
	filePath: string;
	fatherId?: string;
	motherId?: string;
	spouseIds: string[];
	childIds: string[];
	born?: string;
	died?: string;
	isRoot?: boolean;
}

/**
 * Family unit representing a marriage/partnership
 */
export interface FamilyUnit {
	id: string;
	spouseIds: string[];
	childIds: string[];
}
