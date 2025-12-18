/**
 * Type declarations for Leaflet plugins without their own types
 */

declare module 'leaflet-polylinedecorator';
declare module 'leaflet.heat';
declare module 'leaflet-fullscreen';
declare module 'leaflet-minimap';
declare module 'leaflet-search';
declare module 'leaflet-textpath';
declare module 'leaflet-toolbar';
declare module 'leaflet-distortableimage';

// Type aliases for Leaflet types used in namespace augmentation
type LeafletLatLng = import('leaflet').LatLng;
type LeafletImageOverlay = import('leaflet').ImageOverlay;
type LeafletImageOverlayOptions = import('leaflet').ImageOverlayOptions;
type LeafletFeatureGroup = import('leaflet').FeatureGroup;

/**
 * Extend Leaflet Polyline with setText method from leaflet-textpath
 */
declare namespace L {
	interface Polyline {
		/**
		 * Set text along the polyline path
		 * @param text - Text to display along the path, or null to remove
		 * @param options - Text display options
		 */
		setText(text: string | null, options?: TextPathOptions): this;
	}

	interface TextPathOptions {
		/** Repeat text along the entire polyline (default: false) */
		repeat?: boolean;
		/** Center text relative to the polyline's bounding box (default: false) */
		center?: boolean;
		/** Position text below the path (default: false) */
		below?: boolean;
		/** Offset from the path in pixels (default: 0) */
		offset?: number;
		/** Text orientation: angle in degrees, 'flip', or 'perpendicular' */
		orientation?: number | 'flip' | 'perpendicular';
		/** SVG text element attributes */
		attributes?: {
			fill?: string;
			'font-size'?: string;
			'font-family'?: string;
			'font-weight'?: string;
			'text-anchor'?: string;
			dy?: string;
			[key: string]: string | undefined;
		};
	}

	// ============================================================================
	// Leaflet.DistortableImage Types
	// ============================================================================

	/**
	 * Options for DistortableImageOverlay
	 */
	interface DistortableImageOverlayOptions extends LeafletImageOverlayOptions {
		/** Initial height in pixels for sizing (default: 200) */
		height?: number;
		/** Enable cross-origin requests (default: true) */
		crossOrigin?: boolean;
		/** Minimum edge width before distortion is blocked (default: 50) */
		edgeMinWidth?: number;
		/** Whether the image is editable (default: true) */
		editable?: boolean;
		/** Initial editing mode */
		mode?: 'distort' | 'drag' | 'rotate' | 'scale' | 'freeRotate' | 'lock';
		/** Whether image starts selected (shows toolbar) (default: false) */
		selected?: boolean;
		/** Initial rotation in degrees or radians */
		rotation?: { deg?: number; rad?: number };
		/** Four corner positions in NW, NE, SW, SE order */
		corners?: LeafletLatLng[];
		/** Suppress the editing toolbar (default: false) */
		suppressToolbar?: boolean;
		/** Custom actions for the toolbar */
		actions?: DistortableImageAction[];
	}

	/**
	 * Action interface for toolbar customization
	 */
	interface DistortableImageAction {
		/** Unique name for the action */
		name: string;
		/** Execute the action */
		doAction: (overlay: DistortableImageOverlay, collection?: DistortableCollection) => void;
	}

	/**
	 * DistortableImageOverlay - extends ImageOverlay with interactive editing
	 */
	interface DistortableImageOverlay extends LeafletImageOverlay {
		/** Editing handler instance */
		editing: DistortableImageEdit;
		/** Whether the overlay is editable (can be changed at runtime) */
		editable: boolean;
		/** Current rotation state */
		rotation: { deg: number; rad: number };
		/** Whether the image has been edited */
		edited: boolean;

		// Internal properties (accessed for corner pre-setting)
		/** Internal corner storage - set before image load for proper initialization */
		_corners: LeafletLatLng[];

		/**
		 * Get all four corner positions
		 * @returns Array of LatLng in order: NW, NE, SW, SE
		 */
		getCorners(): LeafletLatLng[];

		/**
		 * Get a specific corner position
		 * @param index Corner index (0=NW, 1=NE, 2=SW, 3=SE)
		 */
		getCorner(index: number): LeafletLatLng;

		/**
		 * Set a specific corner position
		 * @param index Corner index (0=NW, 1=NE, 2=SW, 3=SE)
		 * @param latlng New position
		 */
		setCorner(index: number, latlng: LeafletLatLng): this;

		/**
		 * Set all four corner positions
		 * @param corners Object with corner indices as keys
		 */
		setCorners(corners: { [index: number]: LeafletLatLng }): this;

		/**
		 * Get the center point of the image
		 */
		getCenter(): LeafletLatLng;

		/**
		 * Scale the image by a factor around its center
		 * @param scale Scale factor (1 = no change)
		 */
		scaleBy(scale: number): this;

		/**
		 * Get current rotation angle
		 * @param unit 'deg' for degrees, 'rad' for radians
		 */
		getAngle(unit?: 'deg' | 'rad'): number;

		/**
		 * Set rotation angle (absolute)
		 * @param angle Angle value
		 * @param unit 'deg' for degrees, 'rad' for radians
		 */
		setAngle(angle: number, unit?: 'deg' | 'rad'): this;

		/**
		 * Rotate by a relative amount
		 * @param angle Angle to rotate by
		 * @param unit 'deg' for degrees, 'rad' for radians
		 */
		rotateBy(angle: number, unit?: 'deg' | 'rad'): this;

		/**
		 * Drag the image by the difference between two points
		 */
		dragBy(formerPoint: LeafletLatLng, newPoint: LeafletLatLng): void;

		/**
		 * Restore image to initial dimensions and position
		 */
		restore(): this;

		/**
		 * Check if the image is currently selected
		 */
		isSelected(): boolean;

		/**
		 * Select the image (shows toolbar and markers)
		 */
		select(e?: Event): this | undefined;

		/**
		 * Deselect the image (hides toolbar and markers)
		 */
		deselect(): this;
	}

	/**
	 * Editing handler for DistortableImageOverlay
	 */
	interface DistortableImageEdit {
		/** Enable editing mode */
		enable(): void;
		/** Disable editing mode */
		disable(): void;
		/** Check if editing is enabled */
		enabled(): boolean;
	}

	/**
	 * DistortableCollection for managing multiple distortable images
	 */
	interface DistortableCollection extends LeafletFeatureGroup {
		/** Whether the collection is editable */
		editable: boolean;
		/** Check if any images are collected/selected */
		anyCollected(): boolean;
	}

	/**
	 * Factory function for creating DistortableImageOverlay
	 */
	function distortableImageOverlay(
		url: string,
		options?: DistortableImageOverlayOptions
	): DistortableImageOverlay;

	/**
	 * Factory function for creating DistortableCollection
	 */
	function distortableCollection(options?: {
		editable?: boolean;
		suppressToolbar?: boolean;
		actions?: DistortableImageAction[];
	}): DistortableCollection;
}
