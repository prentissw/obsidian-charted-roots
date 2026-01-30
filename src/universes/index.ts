/**
 * Universes module
 *
 * Provides universe management functionality for Charted Roots.
 * Universes are first-class entities that represent fictional worlds,
 * story settings, or alternate realities within a vault.
 */

export * from './types';
export * from './services';
export { EditUniverseModal } from './ui/edit-universe-modal';
export { UniverseWizardModal } from './ui/universe-wizard';

// UI Components
export { renderUniversesTab, renderUniversesList } from './ui/universes-tab';
export type { UniverseListFilter, UniverseListSort, UniversesListOptions } from './ui/universes-tab';
export { UniversesView, VIEW_TYPE_UNIVERSES } from './ui/universes-view';
