/**
 * Canvas Navigation
 *
 * Data structures and utilities for canvas splitting, navigation nodes,
 * and linking between related canvases.
 */

import type { PersonNode } from './family-graph';

/**
 * Types of relationships between canvases
 */
export type CanvasRelationshipType =
	| 'generation-split'    // Canvas split by generation ranges
	| 'branch-split'        // Canvas split by family branches
	| 'collection-split'    // Canvas split by user collections
	| 'ancestor-descendant' // Ancestor + descendant pair
	| 'lineage-extraction'; // Single lineage extraction

/**
 * Direction of relationship to another canvas
 */
export type RelatedCanvasDirection =
	| 'ancestor'   // Related canvas contains ancestors
	| 'descendant' // Related canvas contains descendants
	| 'sibling'    // Related canvas is at same level (e.g., another branch)
	| 'parent'     // Related canvas is the source/overview
	| 'child';     // Related canvas is a subset/detail view

/**
 * Represents a canvas related to the current one
 */
export interface RelatedCanvas {
	/** Path to the related canvas file */
	path: string;

	/** Human-readable label for the relationship */
	label: string;

	/** Direction of the relationship */
	direction: RelatedCanvasDirection;

	/** Generation range covered by this canvas (for generation splits) */
	generationRange?: [number, number];

	/** Collection name (for collection splits) */
	collection?: string;

	/** Number of people in this canvas */
	personCount: number;
}

/**
 * Tracks relationships between canvases
 */
export interface CanvasRelationship {
	/** Type of split/relationship */
	type: CanvasRelationshipType;

	/** Related canvases */
	relatedCanvases: RelatedCanvas[];

	/** Path to overview canvas (if one exists) */
	overviewCanvas?: string;

	/** Timestamp when relationship was established */
	timestamp: number;
}

/**
 * Types of navigation nodes that can be created
 */
export type NavigationNodeType =
	| 'portal'      // Links to another canvas (for split boundaries)
	| 'placeholder' // Represents a person detailed elsewhere
	| 'file-link';  // Direct file link node to another canvas

/**
 * Direction indicator for navigation nodes
 */
export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Data for a navigation node
 */
export interface NavigationNode {
	/** Type of navigation node */
	type: NavigationNodeType;

	/** Path to target canvas */
	targetCanvas: string;

	/** Display label */
	label: string;

	/** For placeholder nodes: the person's cr_id */
	personCrId?: string;

	/** Direction indicator (for visual arrow/styling) */
	direction: NavigationDirection;

	/** Additional info to display (e.g., person count, generation range) */
	info?: string;
}

/**
 * Extended canvas metadata for navigation features
 */
export interface CanvasNavigationMetadata {
	/** Relationships to other canvases */
	relationships?: CanvasRelationship;

	/** Navigation nodes in this canvas */
	navigationNodes?: NavigationNode[];

	/** If this canvas was pruned from another, track the source */
	prunedFrom?: {
		sourceCanvas: string;
		prunedAt: number;
	};
}

/**
 * Options for split operations
 */
export interface SplitOptions {
	/** Output folder for generated canvases */
	outputFolder: string;

	/** Filename pattern (supports {name}, {type}, {date} placeholders) */
	filenamePattern: string;

	/** Generate an overview canvas linking all splits */
	generateOverview: boolean;

	/** Add navigation nodes between canvases */
	includeNavigationNodes: boolean;

	/** Maximum generations to include */
	maxGenerations?: number;

	// Destructive mode options
	/** Path to existing canvas to modify (for prune mode) */
	sourceCanvas?: string;

	/** If true, remove extracted nodes from source canvas */
	removeFromSource: boolean;

	/** If true, add portal node where removed section was */
	addNavigationNodeToSource: boolean;

	// Associated media options
	/** Include nodes with edges to extracted people */
	includeConnectedMedia: boolean;

	/** Include nodes within proximity threshold */
	includeNearbyMedia: boolean;

	/** Include nodes in same canvas group as extracted people */
	includeGroupedMedia: boolean;

	/** Pixels for nearby detection (default: 200) */
	proximityThreshold?: number;

	// Tagging options
	/** Collection name to add extracted people to */
	addToCollection?: string;

	/** If true, create collection if it doesn't exist */
	createNewCollection?: boolean;

	/** Group name to set on extracted people */
	setGroupName?: string;
}

/**
 * Options specific to lineage extraction
 */
export interface LineageOptions extends SplitOptions {
	/** Include spouses of people on the line */
	includeSpouses: boolean;

	/** Include siblings at each generation */
	includeSiblings: boolean;

	/** Direction to trace: ancestors, descendants, or auto-detect */
	lineageDirection: 'ancestors' | 'descendants' | 'auto';
}

/**
 * Association between a media node and a person
 */
export interface MediaAssociation {
	/** Canvas node ID of the media */
	mediaNodeId: string;

	/** cr_id of the associated person */
	personCrId: string;

	/** How the association was detected */
	associationType: 'edge' | 'proximity' | 'group' | 'naming';

	/** Distance in pixels (for proximity associations) */
	distance?: number;
}

/**
 * Result of a split operation
 */
export interface SplitResult {
	/** Generated canvases */
	canvases: GeneratedCanvas[];

	/** Overview canvas (if generated) */
	overviewCanvas?: GeneratedCanvas;

	/** Total number of people across all generated canvases */
	totalPeople: number;

	/** Media associations found and processed */
	mediaAssociations?: MediaAssociation[];

	/** People added to collection (if tagging was used) */
	taggedPeople?: string[];
}

/**
 * Information about a generated canvas
 */
export interface GeneratedCanvas {
	/** Path to the canvas file */
	path: string;

	/** Human-readable label */
	label: string;

	/** Number of people in this canvas */
	personCount: number;

	/** Generation range (for generation splits) */
	generationRange?: [number, number];

	/** Collection name (for collection splits) */
	collection?: string;
}

/**
 * Service for creating navigation nodes
 */
export class NavigationNodeGenerator {
	private defaultNodeWidth = 200;
	private defaultNodeHeight = 100;

	/**
	 * Create a portal node that links to another canvas
	 *
	 * @param targetCanvas - Path to the target canvas
	 * @param label - Display label (e.g., "Ancestors", "Smith Line")
	 * @param position - Position for the node
	 * @param direction - Direction indicator
	 * @param info - Additional info (e.g., "4 more generations")
	 */
	createPortalNode(
		targetCanvas: string,
		label: string,
		position: { x: number; y: number },
		direction: NavigationDirection,
		info?: string
	): CanvasTextNode {
		const arrow = this.getDirectionArrow(direction);
		const infoLine = info ? `\n${info}` : '';

		// Create wikilink to target canvas
		const canvasName = targetCanvas.replace(/\.canvas$/, '').split('/').pop() || targetCanvas;
		const linkLine = `[[${targetCanvas}|${canvasName}]]`;

		const text = `${arrow} **${label}**${infoLine}\n${linkLine}`;

		return {
			id: this.generateId(),
			type: 'text',
			text,
			x: position.x,
			y: position.y,
			width: this.defaultNodeWidth,
			height: this.defaultNodeHeight,
			color: '5' // Cyan for navigation nodes
		};
	}

	/**
	 * Create a placeholder node for a person detailed elsewhere
	 *
	 * @param person - The person node
	 * @param targetCanvas - Path to canvas where person is detailed
	 * @param position - Position for the node
	 */
	createPlaceholderNode(
		person: PersonNode,
		targetCanvas: string,
		position: { x: number; y: number }
	): CanvasTextNode {
		const canvasName = targetCanvas.replace(/\.canvas$/, '').split('/').pop() || targetCanvas;

		const text = `**${person.name}**\n───────────\nSee: [[${targetCanvas}|${canvasName}]]`;

		return {
			id: this.generateId(),
			type: 'text',
			text,
			x: position.x,
			y: position.y,
			width: this.defaultNodeWidth,
			height: this.defaultNodeHeight,
			color: '2' // Orange for placeholder nodes
		};
	}

	/**
	 * Create a file link node to another canvas
	 *
	 * @param targetCanvas - Path to the target canvas
	 * @param position - Position for the node
	 * @param size - Optional size override
	 */
	createCanvasLinkNode(
		targetCanvas: string,
		position: { x: number; y: number },
		size?: { width: number; height: number }
	): CanvasFileNode {
		return {
			id: this.generateId(),
			type: 'file',
			file: targetCanvas,
			x: position.x,
			y: position.y,
			width: size?.width ?? this.defaultNodeWidth,
			height: size?.height ?? this.defaultNodeHeight
		};
	}

	/**
	 * Create a "back to overview" navigation node
	 *
	 * @param overviewCanvas - Path to the overview canvas
	 * @param position - Position for the node
	 */
	createBackToOverviewNode(
		overviewCanvas: string,
		position: { x: number; y: number }
	): CanvasTextNode {
		return this.createPortalNode(
			overviewCanvas,
			'Overview',
			position,
			'up',
			'Back to overview'
		);
	}

	/**
	 * Get arrow character for direction
	 */
	private getDirectionArrow(direction: NavigationDirection): string {
		switch (direction) {
			case 'up': return '↑';
			case 'down': return '↓';
			case 'left': return '←';
			case 'right': return '→';
		}
	}

	/**
	 * Generate a unique ID for canvas elements
	 */
	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15);
	}
}

/**
 * Canvas text node structure (matches Obsidian Canvas spec)
 */
interface CanvasTextNode {
	id: string;
	type: 'text';
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

/**
 * Canvas file node structure (matches Obsidian Canvas spec)
 */
interface CanvasFileNode {
	id: string;
	type: 'file';
	file: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

/**
 * Default split options
 */
export const DEFAULT_SPLIT_OPTIONS: Partial<SplitOptions> = {
	generateOverview: true,
	includeNavigationNodes: true,
	removeFromSource: false,
	addNavigationNodeToSource: true,
	includeConnectedMedia: true,
	includeNearbyMedia: false,
	includeGroupedMedia: true,
	proximityThreshold: 200
};

/**
 * Default lineage options
 */
export const DEFAULT_LINEAGE_OPTIONS: Partial<LineageOptions> = {
	...DEFAULT_SPLIT_OPTIONS,
	includeSpouses: true,
	includeSiblings: false,
	lineageDirection: 'auto'
};
