/**
 * Visual Tree Service
 *
 * Builds layouts for visual tree PDF diagrams.
 * Calculates node positions scaled for PDF page dimensions.
 */

import type { App } from 'obsidian';
import type { FamilyGraphService, PersonNode, FamilyTree } from '../../core/family-graph';
import {
	VisualTreeOptions,
	VisualTreeLayout,
	VisualTreeNode,
	VisualTreeConnection,
	VisualTreeChartType,
	VisualTreePageSize,
	TreeSizeAnalysis,
	PAGE_SIZES,
	PAGE_SIZE_ORDER,
	LARGE_TREE_THRESHOLDS,
	DEFAULT_MARGINS,
	DEFAULT_NODE_DIMENSIONS
} from '../types/visual-tree-types';

/**
 * Service for building visual tree layouts for PDF generation
 */
export class VisualTreeService {
	private app: App;
	private familyGraphService: FamilyGraphService;

	constructor(app: App, familyGraphService: FamilyGraphService) {
		this.app = app;
		this.familyGraphService = familyGraphService;
	}

	/**
	 * Analyze tree size to determine if special handling is needed
	 */
	analyzeTreeSize(options: VisualTreeOptions): TreeSizeAnalysis | null {
		// Generate family tree data to count generations
		const familyTree = this.familyGraphService.generateTree({
			rootCrId: options.rootPersonCrId,
			treeType: options.chartType === 'descendant' ? 'descendants' : 'ancestors',
			maxGenerations: options.maxGenerations,
			includeSpouses: options.includeSpouses
		});

		if (!familyTree) {
			return null;
		}

		// For pedigree charts, count actual generations present
		const generationsSet = new Set<number>();
		const queue: Array<{ crId: string; generation: number }> = [
			{ crId: familyTree.root.crId, generation: 0 }
		];
		const visited = new Set<string>();

		while (queue.length > 0) {
			const { crId, generation } = queue.shift()!;
			if (visited.has(crId)) continue;
			visited.add(crId);

			const person = familyTree.nodes.get(crId);
			if (!person) continue;

			generationsSet.add(generation);

			if (person.fatherCrId && familyTree.nodes.has(person.fatherCrId)) {
				queue.push({ crId: person.fatherCrId, generation: generation + 1 });
			}
			if (person.motherCrId && familyTree.nodes.has(person.motherCrId)) {
				queue.push({ crId: person.motherCrId, generation: generation + 1 });
			}
		}

		const generationsCount = generationsSet.size;
		const maxNodesInGeneration = Math.pow(2, generationsCount - 1);

		// Calculate estimated card sizes for the requested page size
		const pageSize = PAGE_SIZES[options.pageSize];
		const isLandscape = options.orientation === 'landscape';
		const page = isLandscape
			? { width: pageSize.height, height: pageSize.width }
			: { ...pageSize };

		const usableWidth = page.width - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
		const usableHeight = page.height - DEFAULT_MARGINS.top - DEFAULT_MARGINS.bottom;

		const availableWidthPerNode = usableWidth / maxNodesInGeneration;
		const availableHeightPerGen = usableHeight / generationsCount;

		const estimatedCardWidth = Math.min(
			DEFAULT_NODE_DIMENSIONS.width,
			availableWidthPerNode - DEFAULT_NODE_DIMENSIONS.spacingX
		);
		const estimatedCardHeight = Math.min(
			DEFAULT_NODE_DIMENSIONS.height,
			availableHeightPerGen - DEFAULT_NODE_DIMENSIONS.spacingY
		);

		// Find recommended page size that would fit the tree
		let recommendedPageSize: VisualTreePageSize | null = null;
		let canFitOnSinglePage = false;

		for (const size of PAGE_SIZE_ORDER) {
			const testPageSize = PAGE_SIZES[size];
			const testPage = isLandscape
				? { width: testPageSize.height, height: testPageSize.width }
				: { ...testPageSize };

			const testUsableWidth = testPage.width - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
			const testAvailableWidthPerNode = testUsableWidth / maxNodesInGeneration;
			const testCardWidth = Math.min(
				DEFAULT_NODE_DIMENSIONS.width,
				testAvailableWidthPerNode - DEFAULT_NODE_DIMENSIONS.spacingX
			);

			if (testCardWidth >= LARGE_TREE_THRESHOLDS.minReadableCardWidth) {
				recommendedPageSize = size;
				canFitOnSinglePage = true;
				break;
			}
		}

		// Calculate pages needed for multi-page output
		const pagesNeededForMultiPage = Math.ceil(
			generationsCount / LARGE_TREE_THRESHOLDS.generationsPerPage
		);

		const isLarge = estimatedCardWidth < LARGE_TREE_THRESHOLDS.minReadableCardWidth ||
			estimatedCardHeight < LARGE_TREE_THRESHOLDS.minReadableCardHeight ||
			generationsCount > LARGE_TREE_THRESHOLDS.maxGenerationsStandardPage;

		return {
			isLarge,
			generationsCount,
			maxNodesInGeneration,
			estimatedCardWidth,
			estimatedCardHeight,
			recommendedPageSize,
			pagesNeededForMultiPage,
			canFitOnSinglePage
		};
	}

	/**
	 * Build a visual tree layout based on options
	 * For large trees with multi-page handling, returns multiple layouts
	 */
	buildLayouts(options: VisualTreeOptions): VisualTreeLayout[] {
		const analysis = this.analyzeTreeSize(options);

		// Handle large trees with multi-page output
		if (analysis?.isLarge && options.largeTreeHandling === 'multi-page') {
			return this.buildMultiPagePedigreeLayouts(options, analysis);
		}

		// Handle large trees with auto page size
		if (analysis?.isLarge && options.largeTreeHandling === 'auto-page-size' && analysis.recommendedPageSize) {
			const adjustedOptions = {
				...options,
				pageSize: analysis.recommendedPageSize
			};
			const layout = this.buildLayout(adjustedOptions);
			return layout ? [layout] : [];
		}

		// Default single-page output
		const layout = this.buildLayout(options);
		return layout ? [layout] : [];
	}

	/**
	 * Build a visual tree layout based on options
	 */
	buildLayout(options: VisualTreeOptions): VisualTreeLayout | null {
		switch (options.chartType) {
			case 'pedigree':
				return this.buildPedigreeLayout(options);
			case 'descendant':
				return this.buildDescendantLayout(options);
			case 'hourglass':
				return this.buildHourglassLayout(options);
			case 'fan':
				return this.buildFanLayout(options);
			default:
				return null;
		}
	}

	/**
	 * Build pedigree (ancestor) tree layout
	 * Root person at bottom, ancestors branching upward
	 */
	buildPedigreeLayout(options: VisualTreeOptions): VisualTreeLayout | null {
		// Generate family tree data
		const familyTree = this.familyGraphService.generateTree({
			rootCrId: options.rootPersonCrId,
			treeType: 'ancestors',
			maxGenerations: options.maxGenerations,
			includeSpouses: options.includeSpouses
		});

		if (!familyTree) {
			return null;
		}

		// Get page dimensions
		const pageSize = PAGE_SIZES[options.pageSize];
		const isLandscape = options.orientation === 'landscape';
		const page = isLandscape
			? { width: pageSize.height, height: pageSize.width }
			: { ...pageSize };

		// Calculate usable area
		const usableWidth = page.width - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
		const usableHeight = page.height - DEFAULT_MARGINS.top - DEFAULT_MARGINS.bottom;

		// Calculate layout
		const nodes: VisualTreeNode[] = [];
		const connections: VisualTreeConnection[] = [];

		// Collect ancestors with their Sosa numbers and generations
		const ancestorData = this.collectAncestorsWithSosa(familyTree);

		// Calculate dimensions based on tree size
		const generationsCount = Math.max(...ancestorData.map(a => a.generation)) + 1;
		const maxNodesInGeneration = Math.pow(2, generationsCount - 1);

		// Minimum dimensions to keep cards readable
		const MIN_NODE_WIDTH = 100;
		const MIN_NODE_HEIGHT = 40;
		const TARGET_ASPECT_RATIO = 2.5; // Width to height ratio for family-chart style

		// Calculate node size to fit the page
		// Reserve space for all generations vertically
		const availableHeightPerGen = usableHeight / generationsCount;
		let nodeHeight = Math.min(
			DEFAULT_NODE_DIMENSIONS.height,
			availableHeightPerGen - DEFAULT_NODE_DIMENSIONS.spacingY
		);
		// Enforce minimum height
		nodeHeight = Math.max(nodeHeight, MIN_NODE_HEIGHT);

		// Calculate width to fit the widest generation
		const availableWidthPerNode = usableWidth / maxNodesInGeneration;
		let nodeWidth = Math.min(
			DEFAULT_NODE_DIMENSIONS.width,
			availableWidthPerNode - DEFAULT_NODE_DIMENSIONS.spacingX
		);
		// Enforce minimum width and aspect ratio
		nodeWidth = Math.max(nodeWidth, MIN_NODE_WIDTH, nodeHeight * TARGET_ASPECT_RATIO);

		// Calculate the actual width needed for the widest generation
		// This ensures no overlapping - tree may extend beyond page bounds
		// but the SVG renderer will scale it to fit
		const nodeSpacingX = Math.max(DEFAULT_NODE_DIMENSIONS.spacingX, nodeWidth * 0.15); // At least 15% of node width
		const totalWidthNeeded = maxNodesInGeneration * (nodeWidth + nodeSpacingX) - nodeSpacingX;

		// Position nodes relative to (0,0) - SVG renderer will center
		// Position nodes by generation
		// Generation 0 (root) at bottom, ancestors above
		for (const ancestor of ancestorData) {
			const { person, generation, sosaNumber } = ancestor;

			// Calculate position
			const nodesInGeneration = Math.pow(2, generation);
			const positionInGeneration = sosaNumber - Math.pow(2, generation);

			// X position: spread nodes evenly based on actual node width
			// Position relative to 0, SVG renderer will center the whole tree
			const genNodeSlotWidth = totalWidthNeeded / nodesInGeneration;
			const x = genNodeSlotWidth * (positionInGeneration + 0.5);

			// Y position: from bottom up (root at bottom)
			// Position relative to tree height, SVG renderer will center
			const totalTreeHeight = generationsCount * (nodeHeight + DEFAULT_NODE_DIMENSIONS.spacingY) - DEFAULT_NODE_DIMENSIONS.spacingY;
			const y = totalTreeHeight - (generation * (nodeHeight + DEFAULT_NODE_DIMENSIONS.spacingY));

			const node: VisualTreeNode = {
				person,
				x,
				y,
				width: nodeWidth,
				height: nodeHeight,
				generation,
				sosaNumber
			};

			nodes.push(node);
		}

		// Create connections between nodes
		for (const node of nodes) {
			if (!node.sosaNumber || node.sosaNumber === 1) continue;

			// Find parent node (child has Sosa number that is half of this)
			const childSosa = Math.floor(node.sosaNumber / 2);
			const childNode = nodes.find(n => n.sosaNumber === childSosa);

			if (childNode) {
				connections.push({
					from: childNode,
					to: node,
					type: 'parent'
				});
			}
		}

		// Calculate bounding box
		const bounds = this.calculateBounds(nodes);

		return {
			type: 'pedigree',
			rootPerson: {
				crId: familyTree.root.crId,
				name: familyTree.root.name
			},
			nodes,
			connections,
			bounds,
			page,
			orientation: options.orientation,
			margins: DEFAULT_MARGINS,
			stats: {
				peopleCount: nodes.length,
				generationsCount
			}
		};
	}

	/**
	 * Build descendant tree layout
	 * Root person at top, descendants branching downward
	 */
	buildDescendantLayout(options: VisualTreeOptions): VisualTreeLayout | null {
		// TODO: Implement in Phase 2.2
		console.warn('Descendant tree layout not yet implemented');
		return null;
	}

	/**
	 * Build hourglass tree layout
	 * Both ancestors and descendants from root person
	 */
	buildHourglassLayout(options: VisualTreeOptions): VisualTreeLayout | null {
		// TODO: Implement in Phase 2.2
		console.warn('Hourglass tree layout not yet implemented');
		return null;
	}

	/**
	 * Build fan chart layout
	 * Semicircular pedigree with radiating ancestor segments
	 */
	buildFanLayout(options: VisualTreeOptions): VisualTreeLayout | null {
		// TODO: Implement in Phase 2.3
		console.warn('Fan chart layout not yet implemented');
		return null;
	}

	/**
	 * Build multi-page pedigree layouts
	 * Splits generations across multiple pages for readability
	 */
	private buildMultiPagePedigreeLayouts(
		options: VisualTreeOptions,
		analysis: TreeSizeAnalysis
	): VisualTreeLayout[] {
		const layouts: VisualTreeLayout[] = [];
		const gensPerPage = LARGE_TREE_THRESHOLDS.generationsPerPage;
		const totalPages = analysis.pagesNeededForMultiPage;

		for (let pageNum = 0; pageNum < totalPages; pageNum++) {
			const fromGen = pageNum * gensPerPage;
			const toGen = Math.min(fromGen + gensPerPage - 1, analysis.generationsCount - 1);

			// Build layout for this generation range
			const pageLayout = this.buildPedigreeLayoutForGenerationRange(
				options,
				fromGen,
				toGen,
				pageNum + 1,
				totalPages
			);

			if (pageLayout) {
				layouts.push(pageLayout);
			}
		}

		return layouts;
	}

	/**
	 * Build pedigree layout for a specific generation range
	 */
	private buildPedigreeLayoutForGenerationRange(
		options: VisualTreeOptions,
		fromGen: number,
		toGen: number,
		pageNumber: number,
		totalPages: number
	): VisualTreeLayout | null {
		// Generate family tree data
		const familyTree = this.familyGraphService.generateTree({
			rootCrId: options.rootPersonCrId,
			treeType: 'ancestors',
			maxGenerations: options.maxGenerations,
			includeSpouses: options.includeSpouses
		});

		if (!familyTree) {
			return null;
		}

		// Get page dimensions
		const pageSize = PAGE_SIZES[options.pageSize];
		const isLandscape = options.orientation === 'landscape';
		const page = isLandscape
			? { width: pageSize.height, height: pageSize.width }
			: { ...pageSize };

		// Calculate usable area
		const usableWidth = page.width - DEFAULT_MARGINS.left - DEFAULT_MARGINS.right;
		const usableHeight = page.height - DEFAULT_MARGINS.top - DEFAULT_MARGINS.bottom;

		// Collect ALL ancestors with Sosa numbers
		const allAncestorData = this.collectAncestorsWithSosa(familyTree);

		// Filter to only the generations for this page
		const ancestorData = allAncestorData.filter(
			a => a.generation >= fromGen && a.generation <= toGen
		);

		if (ancestorData.length === 0) {
			return null;
		}

		// Calculate dimensions for this page's generation range
		const generationsOnPage = toGen - fromGen + 1;
		const maxNodesInGeneration = Math.pow(2, toGen); // Max at the furthest generation

		// Calculate node size
		const MIN_NODE_WIDTH = 100;
		const MIN_NODE_HEIGHT = 40;
		const TARGET_ASPECT_RATIO = 2.5;

		const availableHeightPerGen = usableHeight / generationsOnPage;
		let nodeHeight = Math.min(
			DEFAULT_NODE_DIMENSIONS.height,
			availableHeightPerGen - DEFAULT_NODE_DIMENSIONS.spacingY
		);
		nodeHeight = Math.max(nodeHeight, MIN_NODE_HEIGHT);

		const availableWidthPerNode = usableWidth / maxNodesInGeneration;
		let nodeWidth = Math.min(
			DEFAULT_NODE_DIMENSIONS.width,
			availableWidthPerNode - DEFAULT_NODE_DIMENSIONS.spacingX
		);
		nodeWidth = Math.max(nodeWidth, MIN_NODE_WIDTH, nodeHeight * TARGET_ASPECT_RATIO);

		const nodeSpacingX = Math.max(DEFAULT_NODE_DIMENSIONS.spacingX, nodeWidth * 0.15);
		const totalWidthNeeded = maxNodesInGeneration * (nodeWidth + nodeSpacingX) - nodeSpacingX;

		const nodes: VisualTreeNode[] = [];
		const connections: VisualTreeConnection[] = [];

		// Position nodes
		for (const ancestor of ancestorData) {
			const { person, generation, sosaNumber } = ancestor;

			// Calculate position relative to this page's generation range
			const relativeGen = generation - fromGen;
			const nodesInGeneration = Math.pow(2, generation);
			const positionInGeneration = sosaNumber - Math.pow(2, generation);

			const genNodeSlotWidth = totalWidthNeeded / nodesInGeneration;
			const x = genNodeSlotWidth * (positionInGeneration + 0.5);

			const totalTreeHeight = generationsOnPage * (nodeHeight + DEFAULT_NODE_DIMENSIONS.spacingY) - DEFAULT_NODE_DIMENSIONS.spacingY;
			const y = totalTreeHeight - (relativeGen * (nodeHeight + DEFAULT_NODE_DIMENSIONS.spacingY));

			nodes.push({
				person,
				x,
				y,
				width: nodeWidth,
				height: nodeHeight,
				generation,
				sosaNumber
			});
		}

		// Create connections between nodes on this page
		for (const node of nodes) {
			if (!node.sosaNumber || node.sosaNumber === 1) continue;

			const childSosa = Math.floor(node.sosaNumber / 2);
			const childNode = nodes.find(n => n.sosaNumber === childSosa);

			if (childNode) {
				connections.push({
					from: childNode,
					to: node,
					type: 'parent'
				});
			}
		}

		const bounds = this.calculateBounds(nodes);

		return {
			type: 'pedigree',
			rootPerson: {
				crId: familyTree.root.crId,
				name: familyTree.root.name
			},
			nodes,
			connections,
			bounds,
			page,
			orientation: options.orientation,
			margins: DEFAULT_MARGINS,
			stats: {
				peopleCount: nodes.length,
				generationsCount: generationsOnPage
			},
			pageNumber,
			totalPages,
			generationRange: {
				from: fromGen,
				to: toGen
			}
		};
	}

	/**
	 * Collect ancestors from family tree with Sosa-Stradonitz numbering
	 * Sosa: 1 = root, 2 = father, 3 = mother, 4 = paternal grandfather, etc.
	 */
	private collectAncestorsWithSosa(
		familyTree: FamilyTree
	): Array<{ person: PersonNode; generation: number; sosaNumber: number }> {
		const result: Array<{ person: PersonNode; generation: number; sosaNumber: number }> = [];

		// BFS traversal with Sosa numbering
		const queue: Array<{ crId: string; sosaNumber: number; generation: number }> = [
			{ crId: familyTree.root.crId, sosaNumber: 1, generation: 0 }
		];

		const visited = new Set<string>();

		while (queue.length > 0) {
			const { crId, sosaNumber, generation } = queue.shift()!;

			if (visited.has(crId)) continue;
			visited.add(crId);

			const person = familyTree.nodes.get(crId);
			if (!person) continue;

			result.push({ person, generation, sosaNumber });

			// Add father (Sosa = 2n)
			if (person.fatherCrId && familyTree.nodes.has(person.fatherCrId)) {
				queue.push({
					crId: person.fatherCrId,
					sosaNumber: sosaNumber * 2,
					generation: generation + 1
				});
			}

			// Add mother (Sosa = 2n + 1)
			if (person.motherCrId && familyTree.nodes.has(person.motherCrId)) {
				queue.push({
					crId: person.motherCrId,
					sosaNumber: sosaNumber * 2 + 1,
					generation: generation + 1
				});
			}
		}

		return result;
	}

	/**
	 * Calculate bounding box of all nodes
	 */
	private calculateBounds(nodes: VisualTreeNode[]): {
		minX: number;
		minY: number;
		maxX: number;
		maxY: number;
		width: number;
		height: number;
	} {
		if (nodes.length === 0) {
			return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
		}

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const node of nodes) {
			const left = node.x - node.width / 2;
			const right = node.x + node.width / 2;
			const top = node.y - node.height / 2;
			const bottom = node.y + node.height / 2;

			minX = Math.min(minX, left);
			minY = Math.min(minY, top);
			maxX = Math.max(maxX, right);
			maxY = Math.max(maxY, bottom);
		}

		return {
			minX,
			minY,
			maxX,
			maxY,
			width: maxX - minX,
			height: maxY - minY
		};
	}
}
