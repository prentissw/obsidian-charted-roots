/**
 * Canvas data structures matching Obsidian's Canvas file format
 */

export interface CanvasNode {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	type: 'file' | 'text' | 'link' | 'group';
	file?: string;
	text?: string;
	url?: string;
	color?: string;
}

export interface CanvasEdge {
	id: string;
	fromNode: string;
	fromSide: 'top' | 'right' | 'bottom' | 'left';
	toNode: string;
	toSide: 'top' | 'right' | 'bottom' | 'left';
	color?: string;
	label?: string;
}

export interface CanvasData {
	nodes: CanvasNode[];
	edges: CanvasEdge[];
}

/**
 * Relationship types for edges
 */
export enum RelationshipType {
	PARENT_CHILD = 'parent-child',
	SPOUSE = 'spouse'
}
