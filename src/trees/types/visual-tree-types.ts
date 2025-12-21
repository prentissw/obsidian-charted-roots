/**
 * Visual Tree Types
 *
 * Type definitions for graphical PDF tree diagram generation.
 * These are distinct from canvas tree types - Visual Trees generate
 * printable PDFs with positioned boxes and connecting lines.
 */

import type { PersonNode } from '../../core/family-graph';

/**
 * Visual tree chart types
 */
export type VisualTreeChartType =
	| 'pedigree'      // Ancestors branching upward
	| 'descendant'    // Descendants branching downward
	| 'hourglass'     // Both ancestors and descendants
	| 'fan';          // Semicircular pedigree

/**
 * Page size options for PDF output
 */
export type VisualTreePageSize =
	| 'letter'    // 8.5 x 11 inches
	| 'a4'        // 210 x 297 mm
	| 'legal'     // 8.5 x 14 inches
	| 'tabloid'   // 11 x 17 inches
	| 'a3'        // 297 x 420 mm
	| 'arch-d';   // 24 x 36 inches (architectural)

/**
 * Page orientation
 */
export type VisualTreeOrientation = 'portrait' | 'landscape';

/**
 * What content to display in each node
 */
export type VisualTreeNodeContent =
	| 'name'              // Name only
	| 'name-dates'        // Name + birth/death dates
	| 'name-dates-places'; // Name + dates + places

/**
 * Color scheme for nodes
 */
export type VisualTreeColorScheme =
	| 'default'     // Theme colors
	| 'gender'      // Color by gender
	| 'generation'  // Rainbow by generation
	| 'grayscale';  // Black and white for printing

/**
 * How to handle large trees that exceed page capacity
 */
export type LargeTreeHandling =
	| 'auto-page-size'  // Automatically use larger page size
	| 'multi-page';     // Split across multiple pages by generation

/**
 * Options for generating a visual tree
 */
export interface VisualTreeOptions {
	/** CR ID of the root person */
	rootPersonCrId: string;

	/** Chart type */
	chartType: VisualTreeChartType;

	/** Maximum generations to include */
	maxGenerations: number;

	/** Page size */
	pageSize: VisualTreePageSize;

	/** Page orientation */
	orientation: VisualTreeOrientation;

	/** What to display in each node */
	nodeContent: VisualTreeNodeContent;

	/** Color scheme */
	colorScheme: VisualTreeColorScheme;

	/** Include spouses in the tree */
	includeSpouses?: boolean;

	/** Custom title for the PDF */
	title?: string;

	/** How to handle large trees */
	largeTreeHandling?: LargeTreeHandling;
}

/**
 * A node in the visual tree layout
 */
export interface VisualTreeNode {
	/** Reference to the person data */
	person: PersonNode;

	/** X position in points (PDF units) */
	x: number;

	/** Y position in points */
	y: number;

	/** Node width in points */
	width: number;

	/** Node height in points */
	height: number;

	/** Generation relative to root (negative = ancestors, positive = descendants) */
	generation: number;

	/** Sosa-Stradonitz number for pedigree charts (1 = root, 2 = father, 3 = mother, etc.) */
	sosaNumber?: number;
}

/**
 * A connection between two nodes
 */
export interface VisualTreeConnection {
	/** Source node */
	from: VisualTreeNode;

	/** Target node */
	to: VisualTreeNode;

	/** Relationship type */
	type: 'parent' | 'child' | 'spouse';
}

/**
 * Page dimensions in points (72 points = 1 inch)
 */
export interface PageDimensions {
	width: number;
	height: number;
}

/**
 * Complete layout ready for PDF rendering
 */
export interface VisualTreeLayout {
	/** Chart type */
	type: VisualTreeChartType;

	/** Root person info */
	rootPerson: {
		crId: string;
		name: string;
	};

	/** All positioned nodes */
	nodes: VisualTreeNode[];

	/** All connections between nodes */
	connections: VisualTreeConnection[];

	/** Bounding box of the tree content */
	bounds: {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
		width: number;
		height: number;
	};

	/** Page dimensions */
	page: PageDimensions;

	/** Page orientation */
	orientation: VisualTreeOrientation;

	/** Margins applied */
	margins: {
		top: number;
		right: number;
		bottom: number;
		left: number;
	};

	/** Statistics about the tree */
	stats: {
		peopleCount: number;
		generationsCount: number;
	};

	/** Page number for multi-page output (1-indexed) */
	pageNumber?: number;

	/** Total pages for multi-page output */
	totalPages?: number;

	/** Generation range for this page (multi-page output) */
	generationRange?: {
		from: number;
		to: number;
	};
}

/**
 * Page size dimensions in points (72 points = 1 inch)
 */
export const PAGE_SIZES: Record<VisualTreePageSize, PageDimensions> = {
	letter: { width: 612, height: 792 },    // 8.5 x 11 inches
	a4: { width: 595.28, height: 841.89 },  // 210 x 297 mm
	legal: { width: 612, height: 1008 },    // 8.5 x 14 inches
	tabloid: { width: 792, height: 1224 },  // 11 x 17 inches
	a3: { width: 841.89, height: 1190.55 }, // 297 x 420 mm
	'arch-d': { width: 1728, height: 2592 } // 24 x 36 inches
};

/**
 * Page size order from smallest to largest (for auto-scaling)
 */
export const PAGE_SIZE_ORDER: VisualTreePageSize[] = [
	'letter', 'a4', 'legal', 'tabloid', 'a3', 'arch-d'
];

/**
 * Thresholds for determining if a tree is "large"
 */
export const LARGE_TREE_THRESHOLDS = {
	/** Minimum card width in points before tree is considered too dense */
	minReadableCardWidth: 80,
	/** Minimum card height in points */
	minReadableCardHeight: 35,
	/** Maximum generations that fit comfortably on standard page sizes */
	maxGenerationsStandardPage: 5,
	/** Generations per page for multi-page output */
	generationsPerPage: 4
};

/**
 * Result of analyzing tree size to determine if special handling is needed
 */
export interface TreeSizeAnalysis {
	/** Whether the tree needs special handling */
	isLarge: boolean;
	/** Number of generations in the tree */
	generationsCount: number;
	/** Maximum nodes in any generation */
	maxNodesInGeneration: number;
	/** Estimated card width at current page size */
	estimatedCardWidth: number;
	/** Estimated card height at current page size */
	estimatedCardHeight: number;
	/** Recommended page size for single-page output */
	recommendedPageSize: VisualTreePageSize | null;
	/** Number of pages needed for multi-page output */
	pagesNeededForMultiPage: number;
	/** Whether the tree can fit on any single page size */
	canFitOnSinglePage: boolean;
}

/**
 * Default margins in points
 */
export const DEFAULT_MARGINS = {
	top: 40,
	right: 40,
	bottom: 40,
	left: 40
};

/**
 * Default node dimensions in points
 * Width:Height ratio ~2.5:1 to match family-chart cards
 */
export const DEFAULT_NODE_DIMENSIONS = {
	width: 150,
	height: 55,
	spacingX: 15,  // Horizontal spacing between nodes
	spacingY: 35   // Vertical spacing between generations
};

/**
 * Colors for different schemes
 */
export const VISUAL_TREE_COLORS = {
	default: {
		nodeBorder: '#cccccc',
		nodeBackground: '#ffffff',
		nodeText: '#333333',
		connectionLine: '#888888'
	},
	gender: {
		male: '#e3f2fd',        // Light blue
		female: '#fce4ec',      // Light pink
		unknown: '#f5f5f5',     // Light gray
		nodeBorder: '#999999',
		nodeText: '#333333',
		connectionLine: '#888888'
	},
	generation: [
		'#ffebee', // Gen 0 - Light red
		'#fff3e0', // Gen -1 - Light orange
		'#fffde7', // Gen -2 - Light yellow
		'#e8f5e9', // Gen -3 - Light green
		'#e3f2fd', // Gen -4 - Light blue
		'#f3e5f5', // Gen -5 - Light purple
		'#fce4ec', // Gen -6 - Light pink
		'#efebe9'  // Gen -7+ - Light brown
	],
	grayscale: {
		nodeBorder: '#666666',
		nodeBackground: '#ffffff',
		nodeText: '#000000',
		connectionLine: '#333333'
	}
};
