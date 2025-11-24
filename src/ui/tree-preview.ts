/**
 * Tree preview renderer for Canvas Roots
 * Provides visual preview of family trees before canvas generation
 */

import { FamilyTree } from '../core/family-graph';
import { LayoutOptions, LayoutResult, NodePosition } from '../core/layout-engine';
import { FamilyChartLayoutEngine } from '../core/family-chart-layout';
import { TimelineLayoutEngine } from '../core/timeline-layout';
import { HourglassLayoutEngine } from '../core/hourglass-layout';

/**
 * Renders interactive SVG preview of family trees
 * Phase 1: Basic preview with zoom-to-fit
 */
export class TreePreviewRenderer {
	private container: HTMLElement;
	private svgElement: SVGElement | null = null;
	private currentLayout: LayoutResult | null = null;

	constructor(container: HTMLElement) {
		this.container = container;
	}

	/**
	 * Render a preview of the family tree with the given options
	 */
	async renderPreview(
		familyTree: FamilyTree,
		options: LayoutOptions
	): Promise<void> {
		// Clear existing preview
		this.clear();

		// Calculate layout using selected algorithm
		const layout = this.calculateLayout(familyTree, options);
		this.currentLayout = layout;

		// Create SVG element
		this.svgElement = this.createSVG();
		this.container.appendChild(this.svgElement);

		// Render nodes and edges
		this.renderNodes(layout.positions, options);
		this.renderEdges(familyTree, layout.positions);

		// Zoom to fit entire tree
		this.zoomToFit(layout.positions);
	}

	/**
	 * Calculate layout based on selected algorithm
	 */
	private calculateLayout(
		familyTree: FamilyTree,
		options: LayoutOptions
	): LayoutResult {
		const layoutType = options.layoutType ?? 'standard';

		// Apply spacing multiplier for compact layouts
		const layoutOptions = { ...options };
		if (layoutType === 'compact') {
			layoutOptions.nodeSpacingX = (options.nodeSpacingX ?? 400) * 0.5;
			layoutOptions.nodeSpacingY = (options.nodeSpacingY ?? 200) * 0.5;
		}

		switch (layoutType) {
			case 'compact':
			case 'standard':
			default: {
				const standardLayout = new FamilyChartLayoutEngine();
				return standardLayout.calculateLayout(familyTree, layoutOptions);
			}
			case 'timeline': {
				const timelineLayout = new TimelineLayoutEngine();
				return timelineLayout.calculateLayout(familyTree, layoutOptions);
			}
			case 'hourglass': {
				const hourglassLayout = new HourglassLayoutEngine();
				return hourglassLayout.calculateLayout(familyTree, layoutOptions);
			}
		}
	}

	/**
	 * Create SVG element for rendering
	 */
	private createSVG(): SVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'crc-tree-preview-svg');
		svg.setAttribute('width', '100%');
		svg.setAttribute('height', '100%');

		// Add container group for zoom/pan
		const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		g.setAttribute('class', 'crc-tree-preview-content');
		svg.appendChild(g);

		return svg;
	}

	/**
	 * Render person nodes as rectangles
	 */
	private renderNodes(positions: NodePosition[], options: LayoutOptions): void {
		if (!this.svgElement) return;

		const g = this.svgElement.querySelector('.crc-tree-preview-content');
		if (!g) return;

		const nodeWidth = options.nodeWidth ?? 250;
		const nodeHeight = options.nodeHeight ?? 120;

		// Preview uses smaller nodes for better overview
		const previewWidth = nodeWidth * 0.4;
		const previewHeight = nodeHeight * 0.4;

		for (const pos of positions) {
			// Create node group
			const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
			nodeGroup.setAttribute('class', 'crc-preview-node');

			// Create rectangle
			const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
			rect.setAttribute('x', (pos.x - previewWidth / 2).toString());
			rect.setAttribute('y', (pos.y - previewHeight / 2).toString());
			rect.setAttribute('width', previewWidth.toString());
			rect.setAttribute('height', previewHeight.toString());
			rect.setAttribute('rx', '4');
			rect.setAttribute('class', 'crc-preview-node-rect');

			// Create text label (just name, no dates in preview)
			const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
			text.setAttribute('x', pos.x.toString());
			text.setAttribute('y', pos.y.toString());
			text.setAttribute('class', 'crc-preview-node-text');
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('dominant-baseline', 'middle');
			text.textContent = this.truncateName(pos.person.name);

			nodeGroup.appendChild(rect);
			nodeGroup.appendChild(text);
			g.appendChild(nodeGroup);
		}
	}

	/**
	 * Render relationship edges as lines
	 */
	private renderEdges(familyTree: FamilyTree, positions: NodePosition[]): void {
		if (!this.svgElement) return;

		const g = this.svgElement.querySelector('.crc-tree-preview-content');
		if (!g) return;

		// Create position lookup map
		const posMap = new Map<string, NodePosition>();
		for (const pos of positions) {
			posMap.set(pos.crId, pos);
		}

		// Render parent-child edges
		for (const edge of familyTree.edges) {
			const fromPos = posMap.get(edge.from);
			const toPos = posMap.get(edge.to);

			if (!fromPos || !toPos) continue;

			const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
			line.setAttribute('x1', fromPos.x.toString());
			line.setAttribute('y1', fromPos.y.toString());
			line.setAttribute('x2', toPos.x.toString());
			line.setAttribute('y2', toPos.y.toString());
			line.setAttribute('class', 'crc-preview-edge');

			// Insert edges before nodes so they appear behind
			g.insertBefore(line, g.firstChild);
		}
	}

	/**
	 * Adjust SVG viewBox to fit all nodes with padding
	 */
	private zoomToFit(positions: NodePosition[]): void {
		if (!this.svgElement || positions.length === 0) return;

		// Find bounding box of all nodes
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const pos of positions) {
			minX = Math.min(minX, pos.x);
			minY = Math.min(minY, pos.y);
			maxX = Math.max(maxX, pos.x);
			maxY = Math.max(maxY, pos.y);
		}

		// Add padding (20% of dimensions)
		const width = maxX - minX;
		const height = maxY - minY;
		const padding = Math.max(width, height) * 0.2;

		minX -= padding;
		minY -= padding;
		const viewWidth = width + padding * 2;
		const viewHeight = height + padding * 2;

		// Set viewBox to show entire tree
		this.svgElement.setAttribute(
			'viewBox',
			`${minX} ${minY} ${viewWidth} ${viewHeight}`
		);
	}

	/**
	 * Truncate long names for preview display
	 */
	private truncateName(name: string): string {
		const maxLength = 15;
		if (name.length <= maxLength) return name;

		// Try to show first and last name
		const parts = name.split(' ');
		if (parts.length >= 2) {
			return `${parts[0]} ${parts[parts.length - 1]}`;
		}

		return name.substring(0, maxLength) + '...';
	}

	/**
	 * Clear the preview
	 */
	clear(): void {
		this.container.empty();
		this.svgElement = null;
		this.currentLayout = null;
	}

	/**
	 * Get current layout result (for debugging/testing)
	 */
	getLayout(): LayoutResult | null {
		return this.currentLayout;
	}
}
