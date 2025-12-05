/**
 * Sources Module - Evidence & Source Management
 *
 * Exports all source-related types and services.
 */

// Types
export type {
	SourceConfidence,
	CitationFormat,
	SourceTypeDefinition,
	SourceNote,
	SourceStats
} from './types/source-types';

export {
	BUILT_IN_SOURCE_TYPES,
	getSourceType,
	getAllSourceTypes,
	getSourceTypesByCategory,
	SOURCE_CATEGORY_NAMES
} from './types/source-types';

export {
	SOURCE_TEMPLATES,
	DEFAULT_SOURCE_TEMPLATE,
	getSourceTemplate,
	applyTemplatePlaceholders
} from './types/source-templates';

// Services
export { SourceService } from './services/source-service';
export {
	generateCitation,
	generateAllCitations,
	getCitationFormats,
	copyCitationToClipboard,
	type Citation
} from './services/citation-service';

// UI Components
export { renderSourcesTab } from './ui/sources-tab';
export { CreateSourceModal } from './ui/create-source-modal';
export type { SourceModalOptions } from './ui/create-source-modal';
export { SourcePickerModal } from './ui/source-picker-modal';
export { CustomSourceTypeModal } from './ui/custom-source-type-modal';
export { renderMediaGallery } from './ui/media-gallery';
export { CitationGeneratorModal, renderCitationWidget, renderCitationPreview } from './ui/citation-generator';
