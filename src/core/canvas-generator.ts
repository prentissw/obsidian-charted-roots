/**
 * Canvas Generator
 *
 * Converts family tree data structures into Obsidian Canvas JSON format.
 * Handles styling and edge rendering. Uses LayoutEngine for positioning.
 */

import { FamilyTree, PersonNode } from './family-graph';
import { LayoutEngine, LayoutOptions } from './layout-engine';
import { FamilyChartLayoutEngine } from './family-chart-layout';
import { getLogger } from './logging';
import type { ArrowStyle, SpouseEdgeLabelFormat } from '../settings';
import type { SpouseRelationship } from '../models/person';

const logger = getLogger('CanvasGenerator');

/**
 * Obsidian Canvas node
 */
interface CanvasNode {
	id: string;
	type: 'file' | 'text';
	file?: string;
	text?: string;
	x: number;
	y: number;
	width: number;
	height: number;
	color?: string;
}

/**
 * Obsidian Canvas edge (JSON Canvas 1.0 spec compliant)
 */
interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide?: 'top' | 'right' | 'bottom' | 'left';
	fromEnd?: 'none' | 'arrow';
	toNode: string;
	toSide?: 'top' | 'right' | 'bottom' | 'left';
	toEnd?: 'none' | 'arrow';
	color?: string;
	label?: string;
}

/**
 * Canvas Roots generation metadata stored in canvas frontmatter
 */
export interface CanvasRootsMetadata {
	/** Plugin identifier */
	plugin: 'canvas-roots';

	/** Tree generation parameters */
	generation: {
		/** Root person cr_id */
		rootCrId: string;

		/** Root person name for display */
		rootPersonName: string;

		/** Tree type */
		treeType: 'full' | 'ancestors' | 'descendants';

		/** Maximum generations (0 = unlimited) */
		maxGenerations: number;

		/** Whether spouses are included */
		includeSpouses: boolean;

		/** Layout direction */
		direction: 'vertical' | 'horizontal';

		/** Timestamp when generated */
		timestamp: number;
	};

	/** Layout parameters used */
	layout: {
		nodeWidth: number;
		nodeHeight: number;
		nodeSpacingX: number;
		nodeSpacingY: number;
	};
}

/**
 * Complete Obsidian Canvas structure
 */
export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
	metadata?: {
		version?: string;
		frontmatter?: Record<string, unknown>;
	};
}

/**
 * Canvas generation options (extends layout options with styling)
 */
export interface CanvasGenerationOptions extends LayoutOptions {
	/** Color coding by gender (deprecated - use nodeColorScheme instead) */
	colorByGender?: boolean;

	/** Node color scheme: 'gender', 'generation', or 'monochrome' */
	nodeColorScheme?: import('../settings').ColorScheme;

	/** Show relationship labels on edges */
	showLabels?: boolean;

	/** Use family-chart layout engine (better for complex trees with spouses) */
	useFamilyChartLayout?: boolean;

	/** Optional metadata to embed in canvas (for smart re-layout) */
	canvasRootsMetadata?: CanvasRootsMetadata;

	/** Arrow style for parent-child relationships */
	parentChildArrowStyle?: ArrowStyle;

	/** Arrow style for spouse relationships */
	spouseArrowStyle?: ArrowStyle;

	/** Edge color for parent-child relationships */
	parentChildEdgeColor?: import('../settings').CanvasColor;

	/** Edge color for spouse relationships */
	spouseEdgeColor?: import('../settings').CanvasColor;

	/** Show spouse edges with marriage metadata */
	showSpouseEdges?: boolean;

	/** Format for spouse edge labels */
	spouseEdgeLabelFormat?: SpouseEdgeLabelFormat;
}

/**
 * Service for generating Obsidian Canvas JSON from family trees
 */
export class CanvasGenerator {
	private layoutEngine: LayoutEngine;
	private familyChartLayoutEngine: FamilyChartLayoutEngine;

	constructor() {
		this.layoutEngine = new LayoutEngine();
		this.familyChartLayoutEngine = new FamilyChartLayoutEngine();
	}

	/**
	 * Generates Canvas JSON from a family tree
	 */
	generateCanvas(
		familyTree: FamilyTree,
		options: CanvasGenerationOptions = {}
	): CanvasData {
		// Merge options with defaults, ensuring all required fields are present
		// Support legacy colorByGender option for backward compatibility
		const nodeColorScheme = options.nodeColorScheme ??
			(options.colorByGender === false ? 'monochrome' : 'gender');

		const opts = {
			nodeSpacingX: options.nodeSpacingX ?? 300,
			nodeSpacingY: options.nodeSpacingY ?? 200,
			nodeWidth: options.nodeWidth ?? 250,
			nodeHeight: options.nodeHeight ?? 120,
			direction: options.direction ?? 'vertical' as const,
			treeType: options.treeType ?? 'descendant' as const,
			nodeColorScheme,
			showLabels: options.showLabels ?? true,
			useFamilyChartLayout: options.useFamilyChartLayout ?? true,
			parentChildArrowStyle: options.parentChildArrowStyle ?? 'directed' as const,
			spouseArrowStyle: options.spouseArrowStyle ?? 'undirected' as const,
			parentChildEdgeColor: options.parentChildEdgeColor ?? 'none' as const,
			spouseEdgeColor: options.spouseEdgeColor ?? 'none' as const,
			showSpouseEdges: options.showSpouseEdges ?? false,
			spouseEdgeLabelFormat: options.spouseEdgeLabelFormat ?? 'date-only' as const
		};
		const metadata = options.canvasRootsMetadata;

		logger.debug('canvas-generation', 'Canvas generation options', {
			useFamilyChartLayout: opts.useFamilyChartLayout,
			hasMetadata: !!metadata,
			metadataKeys: metadata ? Object.keys(metadata) : null
		});

		// Choose layout engine based on option
		const layoutResult = opts.useFamilyChartLayout
			? this.familyChartLayoutEngine.calculateLayout(familyTree, opts)
			: this.layoutEngine.calculateLayout(familyTree, opts);

		// Generate canvas nodes
		const canvasNodes: CanvasNode[] = [];
		const nodeMap = new Map<string, { x: number; y: number }>();
		const crIdToCanvasId = new Map<string, string>();

		// Process hierarchically positioned nodes
		for (const position of layoutResult.positions) {
			const { crId, person, x, y, generation } = position;

			// Generate a canvas-compatible ID (no dashes, alphanumeric only)
			const canvasId = this.generateId();
			crIdToCanvasId.set(crId, canvasId);

			// Store position for edge generation
			nodeMap.set(crId, { x, y });

			// Create canvas node using generated canvas ID
			canvasNodes.push({
				id: canvasId,
				type: 'file',
				file: person.file.path,
				x,
				y,
				width: opts.nodeWidth,
				height: opts.nodeHeight,
				color: this.getNodeColor(person, generation, opts.nodeColorScheme)
			});
		}

		// Add nodes that appear in edges but weren't positioned by the layout engine
		const spouseSpacing = opts.nodeWidth + (opts.nodeSpacingX * 0.3); // 30% of horizontal spacing

		// Create a map of crId to generation for quick lookup
		const generationMap = new Map<string, number | undefined>();
		for (const position of layoutResult.positions) {
			generationMap.set(position.crId, position.generation);
		}

		// First pass: add spouse nodes next to their positioned partners
		for (const edge of familyTree.edges) {
			if (edge.type === 'spouse') {
				const fromPos = nodeMap.get(edge.from);
				const toPos = nodeMap.get(edge.to);

				// If one spouse is positioned but the other isn't, add the missing spouse
				if (fromPos && !toPos) {
					const spouse = familyTree.nodes.get(edge.to);
					if (spouse) {
						const canvasId = this.generateId();
						crIdToCanvasId.set(edge.to, canvasId);
						const spousePos = { x: fromPos.x + spouseSpacing, y: fromPos.y };
						nodeMap.set(edge.to, spousePos);

						// Spouses have the same generation
						const generation = generationMap.get(edge.from);

						canvasNodes.push({
							id: canvasId,
							type: 'file',
							file: spouse.file.path,
							x: spousePos.x,
							y: spousePos.y,
							width: opts.nodeWidth,
							height: opts.nodeHeight,
							color: this.getNodeColor(spouse, generation, opts.nodeColorScheme)
						});
					}
				} else if (toPos && !fromPos) {
					const spouse = familyTree.nodes.get(edge.from);
					if (spouse) {
						const canvasId = this.generateId();
						crIdToCanvasId.set(edge.from, canvasId);
						const spousePos = { x: toPos.x - spouseSpacing, y: toPos.y };
						nodeMap.set(edge.from, spousePos);

						// Spouses have the same generation
						const generation = generationMap.get(edge.to);

						canvasNodes.push({
							id: canvasId,
							type: 'file',
							file: spouse.file.path,
							x: spousePos.x,
							y: spousePos.y,
							width: opts.nodeWidth,
							height: opts.nodeHeight,
							color: this.getNodeColor(spouse, generation, opts.nodeColorScheme)
						});
					}
				} else if (!fromPos && !toPos) {
					// Both spouses are missing - find a child to position relative to
					const spouse1 = familyTree.nodes.get(edge.from);
					const spouse2 = familyTree.nodes.get(edge.to);
					if (spouse1 && spouse2) {
						let childPos: { x: number; y: number } | undefined;
						let childCrId: string | undefined;
						for (const childEdge of familyTree.edges) {
							if (childEdge.type === 'parent' &&
								(childEdge.from === edge.from || childEdge.from === edge.to)) {
								childPos = nodeMap.get(childEdge.to);
								if (childPos) {
									childCrId = childEdge.to;
									break;
								}
							}
						}

						if (childPos && childCrId) {
							// Position parents above child
							const parent1Pos = { x: childPos.x - spouseSpacing / 2, y: childPos.y - opts.nodeSpacingY };
							const parent2Pos = { x: childPos.x + spouseSpacing / 2, y: childPos.y - opts.nodeSpacingY };

							// Parents are one generation before their child
							const childGeneration = generationMap.get(childCrId);
							const parentGeneration = childGeneration !== undefined ? childGeneration - 1 : undefined;

							const canvasId1 = this.generateId();
							crIdToCanvasId.set(edge.from, canvasId1);
							nodeMap.set(edge.from, parent1Pos);
							canvasNodes.push({
								id: canvasId1,
								type: 'file',
								file: spouse1.file.path,
								x: parent1Pos.x,
								y: parent1Pos.y,
								width: opts.nodeWidth,
								height: opts.nodeHeight,
								color: this.getNodeColor(spouse1, parentGeneration, opts.nodeColorScheme)
							});

							const canvasId2 = this.generateId();
							crIdToCanvasId.set(edge.to, canvasId2);
							nodeMap.set(edge.to, parent2Pos);
							canvasNodes.push({
								id: canvasId2,
								type: 'file',
								file: spouse2.file.path,
								x: parent2Pos.x,
								y: parent2Pos.y,
								width: opts.nodeWidth,
								height: opts.nodeHeight,
								color: this.getNodeColor(spouse2, parentGeneration, opts.nodeColorScheme)
							});
						}
					}
				}
			}
		}

		// Generate canvas edges using canvas IDs
		const canvasEdges = this.generateEdges(
			familyTree,
			nodeMap,
			crIdToCanvasId,
			opts
		);

		return {
			nodes: canvasNodes,
			edges: canvasEdges,
			metadata: {
				version: '1.0-1.0',
				frontmatter: metadata ? (metadata as unknown as Record<string, unknown>) : {}
			}
		};
	}

	/**
	 * Generates canvas edges from family relationships
	 */
	private generateEdges(
		familyTree: FamilyTree,
		nodeMap: Map<string, { x: number; y: number }>,
		crIdToCanvasId: Map<string, string>,
		options: {
			nodeSpacingX: number;
			nodeSpacingY: number;
			nodeWidth: number;
			nodeHeight: number;
			direction: 'vertical' | 'horizontal';
			treeType: 'ancestor' | 'descendant' | 'full';
			nodeColorScheme: import('../settings').ColorScheme;
			showLabels: boolean;
			useFamilyChartLayout: boolean;
			parentChildArrowStyle: ArrowStyle;
			spouseArrowStyle: ArrowStyle;
			parentChildEdgeColor: import('../settings').CanvasColor;
			spouseEdgeColor: import('../settings').CanvasColor;
			showSpouseEdges: boolean;
			spouseEdgeLabelFormat: SpouseEdgeLabelFormat;
		}
	): CanvasEdge[] {
		const edges: CanvasEdge[] = [];

		for (const edge of familyTree.edges) {
			const fromPos = nodeMap.get(edge.from);
			const toPos = nodeMap.get(edge.to);

			if (!fromPos || !toPos) {
				continue;
			}

			// Get canvas IDs for the nodes
			const fromCanvasId = crIdToCanvasId.get(edge.from);
			const toCanvasId = crIdToCanvasId.get(edge.to);

			if (!fromCanvasId || !toCanvasId) {
				continue;
			}

			// Filter edges to reduce clutter:
			// 1. Skip "child" edges (only show parent→child, not child→parent)
			// 2. Conditionally skip spouse edges based on settings
			if (edge.type === 'child') {
				continue; // Skip child edges - we'll show parent edges instead
			}

			if (edge.type === 'spouse' && !options.showSpouseEdges) {
				continue; // Skip spouse edges when setting is disabled (default)
			}

			// Determine edge sides based on direction and relationship
			// Note: We've already filtered out 'child' edges above
			let fromSide: 'top' | 'right' | 'bottom' | 'left';
			let toSide: 'top' | 'right' | 'bottom' | 'left';

			if (options.direction === 'vertical') {
				if (edge.type === 'parent') {
					// Parent-child relationships: always vertical (top-bottom)
					fromSide = 'bottom';
					toSide = 'top';
				} else {
					// Spouse relationships: horizontal (side-to-side)
					// Use horizontal edges to avoid crossing vertical parent-child lines
					if (fromPos.x < toPos.x) {
						fromSide = 'right';
						toSide = 'left';
					} else {
						fromSide = 'left';
						toSide = 'right';
					}
				}
			} else {
				// Horizontal layout
				if (edge.type === 'parent') {
					// Parent-child: horizontal
					fromSide = 'right';
					toSide = 'left';
				} else {
					// Spouse: vertical
					if (fromPos.y < toPos.y) {
						fromSide = 'bottom';
						toSide = 'top';
					} else {
						fromSide = 'top';
						toSide = 'bottom';
					}
				}
			}

			// Determine arrow endpoints based on relationship type and settings
			const arrowStyle = edge.type === 'parent' 
				? options.parentChildArrowStyle
				: options.spouseArrowStyle;
			const [fromEnd, toEnd] = this.getArrowEndpoints(arrowStyle);

			// Determine edge color based on relationship type and settings
			const edgeColor = edge.type === 'parent'
				? options.parentChildEdgeColor
				: options.spouseEdgeColor;

			// Generate label for edge
			let edgeLabel: string | undefined;
			if (edge.type === 'spouse' && options.showSpouseEdges) {
				// For spouse edges, look up marriage metadata from PersonNode
				const fromPerson = familyTree.nodes.get(edge.from);
				if (fromPerson?.spouses) {
					// Find the spouse relationship for this specific edge
					const spouseRelationship = fromPerson.spouses.find(s => s.personId === edge.to);
					edgeLabel = this.formatMarriageLabel(spouseRelationship, options.spouseEdgeLabelFormat);
				}
			} else if (options.showLabels) {
				edgeLabel = this.getEdgeLabel(edge.type);
			}

			edges.push({
				id: this.generateId(),
				fromNode: fromCanvasId,
				fromSide,
				fromEnd,
				toNode: toCanvasId,
				toSide,
				toEnd,
				color: edgeColor === 'none' ? undefined : edgeColor,
				label: edgeLabel
			});
		}

		return edges;
	}

	/**
	 * Converts ArrowStyle to Canvas edge endpoint values
	 * @param style - Arrow style setting
	 * @returns Tuple of [fromEnd, toEnd] values
	 */
	private getArrowEndpoints(style: ArrowStyle): ['none' | 'arrow', 'none' | 'arrow'] {
		switch (style) {
			case 'directed':
				return ['none', 'arrow'];  // Standard: → (arrow pointing forward)
			case 'bidirectional':
				return ['arrow', 'arrow']; // Both ends: ↔ (arrows on both ends)
			case 'undirected':
				return ['none', 'none'];   // No arrows: — (just a line)
			default:
				return ['none', 'arrow'];  // Fallback to directed
		}
	}

	/**
	 * Gets color for person node based on sex/gender from frontmatter
	 * Uses Obsidian's 6 canvas colors:
	 * 1 = Red, 2 = Orange, 3 = Yellow, 4 = Green, 5 = Blue, 6 = Purple
	 */
	private getPersonColor(person: PersonNode): string {
		// Use sex field from frontmatter if available
		if (person.sex) {
			const sex = person.sex.toUpperCase();
			if (sex === 'M' || sex === 'MALE') {
				return '4'; // Green for males
			}
			if (sex === 'F' || sex === 'FEMALE') {
				return '6'; // Purple for females
			}
		}

		// Fallback: try to infer from name prefixes (legacy support)
		const name = person.name.toLowerCase();
		if (name.includes('mr.') || name.includes('sr.') || name.includes('jr.')) {
			return '4'; // Green
		}
		if (name.includes('mrs.') || name.includes('ms.') || name.includes('miss')) {
			return '6'; // Purple
		}

		// Default: neutral gray for unknown gender
		return '2'; // Orange (neutral)
	}

	/**
	 * Gets color for person node based on generation number
	 * Uses Obsidian's 6 canvas colors to create visual layers:
	 * 1 = Red, 2 = Orange, 3 = Yellow, 4 = Green, 5 = Blue (Cyan), 6 = Purple
	 *
	 * Color cycling pattern:
	 * - Generation 0 (root): Purple (6)
	 * - Generation 1: Cyan (5)
	 * - Generation 2: Green (4)
	 * - Generation 3: Yellow (3)
	 * - Generation 4: Orange (2)
	 * - Generation 5: Red (1)
	 * - Then repeats...
	 *
	 * @param generation - Generation number (0 = root, positive = descendants, negative = ancestors)
	 * @returns Color code string ('1' through '6')
	 */
	private getGenerationColor(generation: number | undefined): string {
		if (generation === undefined) {
			return '2'; // Orange (neutral) for undefined generations
		}

		// Use absolute value for ancestors (negative generations)
		const absGeneration = Math.abs(generation);

		// Cycle through colors 1-6, starting with purple (6) for generation 0
		// Map: 0→6, 1→5, 2→4, 3→3, 4→2, 5→1, 6→6, 7→5, etc.
		const colorIndex = 6 - (absGeneration % 6);
		return String(colorIndex === 0 ? 6 : colorIndex);
	}

	/**
	 * Gets node color based on the selected color scheme
	 *
	 * @param person - Person node
	 * @param generation - Generation number (optional, required for 'generation' scheme)
	 * @param colorScheme - Color scheme to use
	 * @returns Color code string ('1' through '6') or undefined for monochrome
	 */
	private getNodeColor(
		person: PersonNode,
		generation: number | undefined,
		colorScheme: import('../settings').ColorScheme
	): string | undefined {
		switch (colorScheme) {
			case 'gender':
				return this.getPersonColor(person);
			case 'generation':
				return this.getGenerationColor(generation);
			case 'monochrome':
				return undefined;  // No color
			default:
				return this.getPersonColor(person);  // Fallback to gender
		}
	}

	/**
	 * Gets label text for edge based on relationship type
	 *
	 * Note: We hide all labels because:
	 * - The visual layout (top-to-bottom for parent-child, side-by-side for spouses) makes relationships clear
	 * - Labels clutter the diagram and cause overlaps
	 * - Edge colors already distinguish relationship types
	 */
	private getEdgeLabel(_type: 'parent' | 'spouse' | 'child'): string {
		// Return empty string to hide all labels - visual layout is self-explanatory
		return '';
	}

	/**
	 * Generates a unique ID for canvas elements
	 */
	private generateId(): string {
		return Math.random().toString(36).substring(2, 15) +
			Math.random().toString(36).substring(2, 15);
	}

	/**
	 * Formats marriage metadata into an edge label
	 * @param spouseRelationship The spouse relationship with metadata
	 * @param format The label format to use
	 * @returns Formatted label string, or undefined if no metadata or format is 'none'
	 */
	private formatMarriageLabel(
		spouseRelationship: SpouseRelationship | undefined,
		format: SpouseEdgeLabelFormat
	): string | undefined {
		if (!spouseRelationship || format === 'none') {
			return undefined;
		}

		const parts: string[] = [];

		// Marriage date
		if (spouseRelationship.marriageDate) {
			// Format date: if it's ISO format (YYYY-MM-DD), show just year for brevity
			const date = spouseRelationship.marriageDate;
			const yearMatch = date.match(/^(\d{4})/);
			const formattedDate = yearMatch ? yearMatch[1] : date;
			parts.push(`m. ${formattedDate}`);
		}

		// For 'date-only', stop here
		if (format === 'date-only') {
			return parts.length > 0 ? parts.join(' | ') : undefined;
		}

		// Location (for 'date-location' and 'full')
		if (spouseRelationship.marriageLocation && (format === 'date-location' || format === 'full')) {
			parts.push(spouseRelationship.marriageLocation);
		}

		// For 'date-location', stop here
		if (format === 'date-location') {
			return parts.length > 0 ? parts.join(' | ') : undefined;
		}

		// Divorce/status info (for 'full' only)
		if (format === 'full') {
			if (spouseRelationship.divorceDate) {
				const date = spouseRelationship.divorceDate;
				const yearMatch = date.match(/^(\d{4})/);
				const formattedDate = yearMatch ? yearMatch[1] : date;
				parts.push(`div. ${formattedDate}`);
			} else if (spouseRelationship.marriageStatus && spouseRelationship.marriageStatus !== 'current') {
				parts.push(spouseRelationship.marriageStatus);
			}
		}

		return parts.length > 0 ? parts.join(' | ') : undefined;
	}
}
