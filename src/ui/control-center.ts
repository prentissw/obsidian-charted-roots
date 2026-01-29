import { App, Menu, MenuItem, Modal, Notice, Platform, Setting, TFile, TFolder, setIcon, normalizePath } from 'obsidian';
import CanvasRootsPlugin from '../../main';
import { TAB_CONFIGS, NAV_GROUPS, TOOL_CONFIGS, createLucideIcon, setLucideIcon, LucideIconName } from './lucide-icons';
import { ensureFolderExists } from '../core/canvas-utils';
import { createPersonNote, PersonData } from '../core/person-note-writer';
import { PersonPickerModal, PersonInfo, PlaceInfo, extractPlaceInfo } from './person-picker';
import { VaultStatsService, FullVaultStats } from '../core/vault-stats';
import { FamilyGraphService, TreeOptions, PersonNode } from '../core/family-graph';
import { CanvasGenerator } from '../core/canvas-generator';
import { getLogger } from '../core/logging';
import { getErrorMessage } from '../core/error-utils';
import { SchemaValidationProgressModal } from './schema-validation-progress-modal';
import { BidirectionalLinker } from '../core/bidirectional-linker';
import type { RecentTreeInfo } from '../settings';
import { FolderFilterService } from '../core/folder-filter';
import { DataQualityService, DataQualityReport, DataQualityIssue, IssueSeverity, IssueCategory, NormalizationPreview, BatchOperationResult, BidirectionalInconsistency, ImpossibleDateIssue } from '../core/data-quality';
import { PlaceGraphService } from '../core/place-graph';
import { CreatePlaceModal } from './create-place-modal';
import { MigrationDiagramModal } from './migration-diagram-modal';
import { PlaceNetworkModal } from './place-network-modal';
import { TemplateSnippetsModal } from './template-snippets-modal';
import { CreatePersonModal } from './create-person-modal';
import { CreateMapModal } from './create-map-modal';
import { CreateMapWizardModal } from './create-map-wizard-modal';
import { resolvePathToFile } from '../utils/wikilink-resolver';
import { renderWorldMapPreview } from '../maps/ui/world-map-preview';
import { BulkGeocodeModal } from '../maps/ui/bulk-geocode-modal';
import { CreateSchemaModal } from './create-schema-modal';
import { SchemaService, ValidationService } from '../schemas';
import type { SchemaNote, ValidationResult, ValidationSummary } from '../schemas';
import { renderSchemasTab } from '../schemas/ui/schemas-tab';
import { renderCollectionsTab } from './collections-tab';
import { renderMapsTab } from '../maps/ui/maps-tab';
import { renderRelationshipsTab } from '../relationships';
import { renderEventsTab, formatDisplayDate } from '../dates';
import { renderOrganizationsTab } from '../organizations';
import { renderStatisticsTab } from '../statistics';
import { renderPersonTimeline, createTimelineSummary } from '../events/ui/person-timeline';
import { EventService } from '../events/services/event-service';
import { AddPersonTypePreviewModal } from './add-person-type-modal';
import { renderFamilyTimeline, getFamilyTimelineSummary } from '../events/ui/family-timeline';
import { renderPlaceTimelineCard } from '../events/ui/place-timeline';
import { renderDashboardTab } from './dashboard-tab';
import { renderPlacesTab } from './places-tab';
import { PropertyAliasService } from '../core/property-alias-service';
import { CreateEventModal } from '../events/ui/create-event-modal';
import { FlattenNestedPropertiesModal } from './flatten-nested-properties-modal';
import { PlaceGeneratorModal } from '../enhancement/ui/place-generator-modal';
import { BulkMediaLinkModal } from '../core/ui/bulk-media-link-modal';
import { MediaManagerModal } from '../core/ui/media-manager-modal';
import {
	renderSourcesTab,
	EvidenceService,
	FACT_KEY_LABELS,
	FACT_KEYS,
	FACT_KEY_TO_SOURCED_PROPERTY,
	SourcePickerModal,
	SOURCE_QUALITY_LABELS,
	ProofSummaryService,
	CreateProofModal,
	PROOF_STATUS_LABELS,
	PROOF_CONFIDENCE_LABELS
} from '../sources';
import { isPersonNote } from '../utils/note-type-detection';
import { UniverseService } from '../universes/services/universe-service';
import { UniverseWizardModal } from '../universes/ui/universe-wizard';
import { renderUniversesTab } from '../universes/ui/universes-tab';
import { UnifiedTreeWizardModal } from '../trees/ui/unified-tree-wizard-modal';
import { renderTreesTab, formatCanvasJson } from '../trees/ui/trees-tab';
import type {
	FactKey,
	ResearchGapsSummary,
	PersonResearchCoverage,
	FactCoverageStatus,
	ProofSummaryNote
} from '../sources';

import { getSpouseLabel, getSpouseCompoundLabel } from '../utils/terminology';
import { createStatItem as createStatItemShared, getContrastColor as getContrastColorShared } from './shared/card-component';

const logger = getLogger('ControlCenter');

/**
 * Safely convert frontmatter/data value to string
 */
function toSafeString(value: unknown): string {
	if (value === undefined || value === null) return '';
	if (typeof value === 'object' && value !== null) return JSON.stringify(value);
	// At this point, value is a primitive
	return String(value as string | number | boolean | bigint | symbol);
}

/**
 * Relationship field data
 */
interface RelationshipField {
	name: string;
	crId?: string;
	birthDate?: string;
	deathDate?: string;
}

/**
 * Charted Roots Control Center Modal
 * Centralized interface for all plugin operations
 */
export class ControlCenterModal extends Modal {
	plugin: CanvasRootsPlugin;
	private activeTab: string = 'dashboard';
	private drawer: HTMLElement;
	private contentContainer: HTMLElement;
	private appBar: HTMLElement;
	private drawerBackdrop: HTMLElement;

	// Relationship field data
	private fatherField: RelationshipField = { name: '' };
	private motherField: RelationshipField = { name: '' };
	private spouseField: RelationshipField = { name: '' };

	// Relationship field UI elements (for Data Entry tab)
	private fatherInput?: HTMLInputElement;
	private fatherBtn?: HTMLButtonElement;
	private fatherHelp?: HTMLElement;
	private motherInput?: HTMLInputElement;
	private motherBtn?: HTMLButtonElement;
	private motherHelp?: HTMLElement;
	private spouseInput?: HTMLInputElement;
	private spouseBtn?: HTMLButtonElement;
	private spouseHelp?: HTMLElement;

	// Cached data to avoid expensive recomputation
	private cachedUniverses: string[] | null = null;
	private cachedFamilyGraph: FamilyGraphService | null = null;
	private cachedPlaceGraph: PlaceGraphService | null = null;

	constructor(app: App, plugin: CanvasRootsPlugin, initialTab?: string) {
		super(app);
		this.plugin = plugin;
		if (initialTab) {
			this.activeTab = initialTab;
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		// Add modal class for styling
		this.modalEl.addClass('crc-control-center-modal');

		// Create modal structure
		this.createModalContainer();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		// Clear caches on close
		this.cachedUniverses = null;
		this.cachedFamilyGraph = null;
		this.cachedPlaceGraph = null;
	}

	/**
	 * Get cached family graph service, creating it if needed.
	 * This avoids expensive reloads on every row click.
	 */
	private getCachedFamilyGraph(): FamilyGraphService {
		if (!this.cachedFamilyGraph) {
			this.cachedFamilyGraph = this.plugin.createFamilyGraphService();
		}
		return this.cachedFamilyGraph;
	}

	/**
	 * Get cached place graph service, creating it if needed.
	 */
	private getCachedPlaceGraph(): PlaceGraphService {
		if (!this.cachedPlaceGraph) {
			this.cachedPlaceGraph = this.plugin.createPlaceGraphService();
		}
		return this.cachedPlaceGraph;
	}

	/**
	 * Get cached universe list, computing it once if needed.
	 * This merges universes from both places and people.
	 */
	private getCachedUniverses(): string[] {
		if (!this.cachedUniverses) {
			const placeGraph = this.getCachedPlaceGraph();
			const familyGraph = this.getCachedFamilyGraph();
			const placeUniverses = placeGraph.getAllUniverses();
			const personUniverses = familyGraph.getAllUniverses();
			this.cachedUniverses = [...new Set([
				...placeUniverses,
				...personUniverses
			])].sort();
		}
		return this.cachedUniverses;
	}

	/**
	 * Invalidate cached data (call when data changes)
	 */
	private invalidateCaches(): void {
		this.cachedUniverses = null;
		this.cachedFamilyGraph = null;
		this.cachedPlaceGraph = null;
	}

	/**
	 * Create the main modal container with header, drawer, and content
	 */
	private createModalContainer(): void {
		const { contentEl } = this;

		// Main modal container
		const modalContainer = contentEl.createDiv({ cls: 'crc-modal-container' });

		// Sticky header
		this.createStickyHeader(modalContainer);

		// Main container (drawer + content)
		const mainContainer = modalContainer.createDiv({ cls: 'crc-main-container' });

		// Navigation drawer
		this.createNavigationDrawer(mainContainer);

		// Content area
		this.contentContainer = mainContainer.createDiv({ cls: 'crc-content-area' });

		// Show initial tab
		this.showTab(this.activeTab);
	}

	/**
	 * Create sticky header with title
	 */
	private createStickyHeader(container: HTMLElement): void {
		this.appBar = container.createDiv({ cls: 'crc-sticky-header' });

		// Mobile menu toggle button (hidden on desktop via CSS)
		const menuToggle = this.appBar.createEl('button', {
			cls: 'crc-mobile-menu-toggle',
			attr: { type: 'button' }
		});
		setIcon(menuToggle, 'menu');
		menuToggle.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.toggleMobileDrawer();
		});

		// Title section
		const titleSection = this.appBar.createDiv({ cls: 'crc-header-title' });
		const titleIcon = createLucideIcon('git-branch', 20);
		titleSection.appendChild(titleIcon);
		titleSection.appendText('Charted Roots Control Center');

		// Action buttons section
		const actionsSection = this.appBar.createDiv({ cls: 'crc-header-actions' });
		this.createHeaderActions(actionsSection);
	}

	/**
	 * Create header action buttons
	 */
	private createHeaderActions(_container: HTMLElement): void {
		// Reserved for future header actions (e.g., help, settings)
		// The modal's native close button (X) is sufficient
	}

	/**
	 * Check if we're in mobile mode
	 */
	private isMobileMode(): boolean {
		return Platform.isMobile || document.body.classList.contains('is-mobile');
	}

	/**
	 * Create navigation drawer with tab list
	 */
	private createNavigationDrawer(container: HTMLElement): void {
		// Mobile backdrop (hidden on desktop via CSS)
		this.drawerBackdrop = container.createDiv({ cls: 'crc-drawer-backdrop' });
		this.drawerBackdrop.addEventListener('click', () => this.closeMobileDrawer());

		this.drawer = container.createDiv({ cls: 'crc-drawer' });

		// Add mobile class directly if in mobile mode
		if (this.isMobileMode()) {
			this.drawer.addClass('crc-drawer--mobile');
			this.drawerBackdrop.addClass('crc-drawer-backdrop--mobile');
			this.modalEl.addClass('crc-mobile-mode');
		}

		// Mobile close button (hidden on desktop via CSS)
		const closeBtn = this.drawer.createEl('button', {
			cls: 'crc-drawer-close',
			attr: { type: 'button' }
		});
		setIcon(closeBtn, 'x');
		closeBtn.addEventListener('click', (e) => {
			e.preventDefault();
			e.stopPropagation();
			this.closeMobileDrawer();
		});

		// Drawer header
		const header = this.drawer.createDiv({ cls: 'crc-drawer__header' });
		const headerTitle = header.createDiv({ cls: 'crc-drawer__title' });
		headerTitle.textContent = 'Navigation';

		// Drawer content
		const content = this.drawer.createDiv({ cls: 'crc-drawer__content' });
		this.createNavigationList(content);
	}

	/**
	 * Toggle mobile drawer visibility
	 */
	private toggleMobileDrawer(): void {
		const isOpen = this.drawer.classList.contains('crc-drawer--open');
		if (isOpen) {
			this.closeMobileDrawer();
		} else {
			this.openMobileDrawer();
		}
	}

	/**
	 * Open mobile drawer
	 */
	private openMobileDrawer(): void {
		this.drawer.classList.add('crc-drawer--open');
		this.drawerBackdrop.classList.add('crc-drawer-backdrop--visible');
	}

	/**
	 * Close mobile drawer
	 */
	private closeMobileDrawer(): void {
		this.drawer.classList.remove('crc-drawer--open');
		this.drawerBackdrop.classList.remove('crc-drawer-backdrop--visible');
	}

	/**
	 * Create navigation list with grouped tabs
	 */
	private createNavigationList(container: HTMLElement): void {
		// Render groups in order
		NAV_GROUPS.forEach((groupConfig, groupIndex) => {
			// Tools group renders tool entries instead of tabs
			if (groupConfig.id === 'tools') {
				this.renderToolsGroup(container, groupIndex);
				return;
			}

			// Get tabs for this group
			const groupTabs = TAB_CONFIGS.filter(tab => tab.group === groupConfig.id);

			if (groupTabs.length === 0) return;

			// Create group container
			const groupEl = container.createDiv({ cls: 'crc-nav-group' });

			// Add divider before all groups except the first
			if (groupIndex > 0) {
				groupEl.addClass('crc-nav-group--with-divider');
			}

			// Add group label if present
			if (groupConfig.label) {
				const labelEl = groupEl.createDiv({ cls: 'crc-nav-group__label' });
				labelEl.textContent = groupConfig.label;
			}

			// Create list for this group's tabs
			const list = groupEl.createEl('ul', { cls: 'crc-nav-list' });

			groupTabs.forEach((tabConfig) => {
				const listItem = list.createEl('li', {
					cls: `crc-nav-item ${tabConfig.id === this.activeTab ? 'crc-nav-item--active' : ''}`
				});
				listItem.setAttribute('data-tab', tabConfig.id);

				// Icon
				const graphic = listItem.createDiv({ cls: 'crc-nav-item__icon' });
				setLucideIcon(graphic, tabConfig.icon, 16);

				// Text
				const text = listItem.createDiv({ cls: 'crc-nav-item__text' });
				text.textContent = tabConfig.name;

				// Click handler
				listItem.addEventListener('click', () => {
					this.switchTab(tabConfig.id);
				});
			});
		});
	}

	/**
	 * Render the Tools group with modal/leaf launchers
	 */
	private renderToolsGroup(container: HTMLElement, groupIndex: number): void {
		const groupEl = container.createDiv({ cls: 'crc-nav-group' });

		// Add divider
		if (groupIndex > 0) {
			groupEl.addClass('crc-nav-group--with-divider');
		}

		// Group label
		const labelEl = groupEl.createDiv({ cls: 'crc-nav-group__label' });
		labelEl.textContent = 'Tools';

		// Create list for tool entries
		const list = groupEl.createEl('ul', { cls: 'crc-nav-list' });

		TOOL_CONFIGS.forEach((toolConfig) => {
			const listItem = list.createEl('li', {
				cls: 'crc-nav-item crc-nav-item--tool'
			});
			listItem.setAttribute('data-tool', toolConfig.id);

			// Icon
			const graphic = listItem.createDiv({ cls: 'crc-nav-item__icon' });
			setLucideIcon(graphic, toolConfig.icon, 16);

			// Text
			const text = listItem.createDiv({ cls: 'crc-nav-item__text' });
			text.textContent = toolConfig.name;

			// External indicator (↗)
			const indicator = listItem.createDiv({ cls: 'crc-nav-item__indicator' });
			indicator.textContent = '↗';

			// Click handler - open modal/leaf
			listItem.addEventListener('click', () => {
				this.openTool(toolConfig.id);
			});
		});
	}

	/**
	 * Open a tool modal or dedicated leaf
	 */
	private openTool(toolId: string): void {
		switch (toolId) {
			case 'templates':
				new TemplateSnippetsModal(this.app).open();
				break;
			case 'media-manager':
				new MediaManagerModal(this.app, this.plugin).open();
				break;
			case 'family-chart':
				// Open family chart leaf
				void this.plugin.activateFamilyChartView(undefined, true, true);
				this.close();
				break;
			case 'create-family':
				// Import and open family creation wizard
				void import('./family-creation-wizard').then(({ FamilyCreationWizardModal }) => {
					new FamilyCreationWizardModal(this.app, this.plugin).open();
				});
				break;
			case 'import-export':
				// Import and open import/export hub modal
				void import('./import-export-hub-modal').then(({ ImportExportHubModal }) => {
					new ImportExportHubModal(this.app, this.plugin).open();
				});
				break;
			case 'statistics':
				// Open statistics view leaf (includes access to reports)
				void this.plugin.activateStatisticsView();
				this.close();
				break;
		}
	}

	/**
	 * Switch to a different tab
	 */
	private switchTab(tabId: string): void {
		// Update active state in navigation
		this.drawer.querySelectorAll('.crc-nav-item').forEach(item => {
			item.classList.remove('crc-nav-item--active');
		});

		const activeItem = this.drawer.querySelector(`[data-tab="${tabId}"]`);
		if (activeItem) {
			activeItem.classList.add('crc-nav-item--active');
		}

		// Reset scroll position to top
		this.contentContainer.scrollTop = 0;

		// Update active tab and show content
		this.activeTab = tabId;
		this.showTab(tabId);

		// Close drawer on mobile after selecting a tab
		if (Platform.isMobile) {
			this.closeMobileDrawer();
		}
	}

	/**
	 * Show content for the specified tab
	 */
	private showTab(tabId: string): void {
		this.contentContainer.empty();

		switch (tabId) {
			case 'dashboard':
			case 'guide':  // Redirect legacy Guide tab to Dashboard
				this.showDashboardTab();
				break;
			case 'people':
				void this.showPeopleTab();
				break;
			case 'collections':
				void this.showCollectionsTab();
				break;
			case 'tree-generation':
				void this.showTreeGenerationTab();
				break;
			case 'data-quality':
				this.showDataQualityTab();
				break;
			case 'statistics':
				// Statistics tab removed - redirect to Dashboard
				// Use the Statistics leaf for vault statistics
				this.showDashboardTab();
				break;
			case 'places':
				void this.showPlacesTab();
				break;
			case 'maps':
				void this.showMapsTab();
				break;
			case 'schemas':
				void this.showSchemasTab();
				break;
			case 'relationships':
				void this.showRelationshipsTab();
				break;
			case 'events':
				this.showEventsTab();
				break;
			case 'organizations':
				void this.showOrganizationsTab();
				break;
			case 'universes':
				this.showUniversesTab();
				break;
			case 'sources':
				void this.showSourcesTab();
				break;
			default:
				this.showPlaceholderTab(tabId);
		}
	}

	/**
	 * Open Control Center to a specific tab
	 */
	public openToTab(tabId: string): void {
		this.activeTab = tabId;
		this.open();
	}

	/**
	 * Opens the Tree Generation Wizard with the specified person already selected
	 *
	 * @param file - The TFile of the person note
	 */
	public openWithPerson(file: TFile): void {
		// Get person info from file metadata
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) {
			new Notice('Unable to read person data from file');
			return;
		}

		const crId = cache.frontmatter.cr_id;
		const name = cache.frontmatter.name || file.basename;

		if (!crId) {
			new Notice('This note does not have a cr_id field');
			return;
		}

		// Open wizard directly with this person pre-selected
		const wizard = new UnifiedTreeWizardModal(this.plugin, {
			personCrId: crId,
			personName: name,
			onComplete: () => {
				// Refresh the tab to show the new tree in recent list (if Control Center is open)
				if (this.activeTab === 'tree-generation') {
					this.showTab(this.activeTab);
				}
			}
		});
		wizard.open();
	}

	/**
	 * Find all disconnected family components and generate a tree for each
	 * Creates separate canvases for each family group found in the vault
	 */
	public async openAndGenerateAllTrees(): Promise<void> {
		// Track results for summary
		interface TreeResult {
			success: boolean;
			familyName: string;
			peopleCount: number;
			fileName?: string;
			file?: TFile;
			error?: string;
		}

		const results: TreeResult[] = [];

		try {
			// Initialize services
			const graphService = this.plugin.createFamilyGraphService();

			// Find all family components
			logger.info('generate-all-trees', 'Finding all family components in vault');
			new Notice('Scanning vault for family groups...');
			const components = graphService.findAllFamilyComponents();

			if (components.length === 0) {
				new Notice('No family trees found in vault. Please add some person notes first.');
				return;
			}

			if (components.length === 1) {
				new Notice('Only one family tree found. Use "Generate tree" instead.');
				return;
			}

			logger.info('generate-all-trees', `Found ${components.length} family groups`, {
				sizes: components.map(c => c.size)
			});

			new Notice(`Found ${components.length} family groups. Generating trees...`);

			// Generate a tree for each component
			for (let i = 0; i < components.length; i++) {
				const component = components[i];
				const rep = component.representative;

				// Update progress
				new Notice(`Generating tree ${i + 1}/${components.length}: ${rep.name}...`, 2000);

				logger.info('generate-all-trees', `Generating tree ${i + 1}/${components.length}`, {
					representative: rep.name,
					size: component.size
				});

				try {
					// Generate full family tree for this component
					const treeOptions: TreeOptions = {
						rootCrId: rep.crId,
						treeType: 'full',
						maxGenerations: 0, // unlimited
						includeSpouses: true
					};

					const familyTree = graphService.generateTree(treeOptions);

					if (!familyTree) {
						logger.error('generate-all-trees', `Failed to generate tree for ${rep.name}: root not found`);
						results.push({
							success: false,
							familyName: component.collectionName || rep.name,
							peopleCount: component.size,
							error: 'Root person not found'
						});
						continue;
					}

					// Generate canvas with a numbered name
					const canvasGenerator = new CanvasGenerator();
					const canvasOptions = {
						nodeWidth: this.plugin.settings.defaultNodeWidth,
						nodeHeight: this.plugin.settings.defaultNodeHeight,
						nodeSpacingX: this.plugin.settings.horizontalSpacing,
						nodeSpacingY: this.plugin.settings.verticalSpacing,
						direction: 'vertical' as const,
						nodeColorScheme: this.plugin.settings.nodeColorScheme,
						showLabels: false,
						parentChildArrowStyle: this.plugin.settings.parentChildArrowStyle,
						spouseArrowStyle: this.plugin.settings.spouseArrowStyle,
						parentChildEdgeColor: this.plugin.settings.parentChildEdgeColor,
						spouseEdgeColor: this.plugin.settings.spouseEdgeColor,
						showSpouseEdges: this.plugin.settings.showSpouseEdges,
						spouseEdgeLabelFormat: this.plugin.settings.spouseEdgeLabelFormat,
						showSourceIndicators: this.plugin.settings.showSourceIndicators,
						showResearchCoverage: this.plugin.settings.trackFactSourcing,
						customRelationshipTypes: this.plugin.settings.customRelationshipTypes,
						canvasRootsMetadata: {
							plugin: 'charted-roots' as const,
							generation: {
								rootCrId: rep.crId,
								rootPersonName: rep.name,
								treeType: 'full' as const,
								maxGenerations: 0,
								includeSpouses: true,
								direction: 'vertical' as const,
								timestamp: Date.now()
							},
							layout: {
								nodeWidth: this.plugin.settings.defaultNodeWidth,
								nodeHeight: this.plugin.settings.defaultNodeHeight,
								nodeSpacingX: this.plugin.settings.horizontalSpacing,
								nodeSpacingY: this.plugin.settings.verticalSpacing
							}
						}
					};

					const canvasData = canvasGenerator.generateCanvas(familyTree, canvasOptions);

					// Create canvas file with collection name if available
					const fileName = component.collectionName
						? `${component.collectionName} - ${rep.name}.canvas`
						: `Family tree ${i + 1} - ${rep.name}.canvas`;
					const canvasContent = formatCanvasJson(canvasData);

					// Use canvasesFolder setting
					const folder = this.plugin.settings.canvasesFolder || 'Charted Roots/Canvases';
					await ensureFolderExists(this.app, folder);
					const filePath = normalizePath(`${folder}/${fileName}`);

					let file: TFile;
					const existingFile = this.app.vault.getAbstractFileByPath(filePath);
					if (existingFile instanceof TFile) {
						await this.app.vault.modify(existingFile, canvasContent);
						file = existingFile;
					} else {
						file = await this.app.vault.create(filePath, canvasContent);
					}

					results.push({
						success: true,
						familyName: component.collectionName || rep.name,
						peopleCount: canvasData.nodes.length,
						fileName,
						file
					});

					// Save to recent trees history
					const treeInfo: RecentTreeInfo = {
						canvasPath: file.path,
						canvasName: fileName,
						peopleCount: canvasData.nodes.length,
						edgeCount: canvasData.edges.length,
						rootPerson: rep.name,
						timestamp: Date.now()
					};

					// Ensure recentTrees array exists (defensive)
					if (!this.plugin.settings.recentTrees) {
						this.plugin.settings.recentTrees = [];
					}

					// Add to beginning of array and keep only last 10
					this.plugin.settings.recentTrees = [treeInfo, ...this.plugin.settings.recentTrees].slice(0, 10);

					logger.info('generate-all-trees', `Successfully generated tree ${i + 1}`, {
						fileName,
						nodeCount: canvasData.nodes.length
					});
				} catch (error: unknown) {
					logger.error('generate-all-trees', `Failed to generate tree for ${rep.name}`, error);
					results.push({
						success: false,
						familyName: component.collectionName || rep.name,
						peopleCount: component.size,
						error: getErrorMessage(error)
					});
				}
			}

			// Save settings with all the recent trees we just added
			await this.plugin.saveSettings();

			// Show results summary modal
			this.showGenerateAllTreesResults(results);
		} catch (error: unknown) {
			logger.error('generate-all-trees', 'Failed to generate all trees', error);
			throw error;
		}
	}

	/**
	 * Show results summary for Generate All Trees operation
	 */
	private showGenerateAllTreesResults(results: Array<{
		success: boolean;
		familyName: string;
		peopleCount: number;
		fileName?: string;
		file?: TFile;
		error?: string;
	}>): void {
		const successCount = results.filter(r => r.success).length;
		const failureCount = results.length - successCount;

		// Clear current content and show results
		this.contentContainer.empty();

		// Title
		this.contentContainer.createEl('h2', {
			text: 'Generate all trees - Results',
			cls: 'cr-card-title--no-margin'
		});

		// Summary stats
		const summaryCard = this.createCard({
			title: 'Summary',
			icon: 'check'
		});

		const summaryContent = summaryCard.querySelector('.crc-card__content') as HTMLElement;

		const statsGrid = summaryContent.createDiv({ cls: 'crc-stats-grid' });

		// Success count
		const successStat = statsGrid.createDiv({ cls: 'crc-stat' });
		successStat.createDiv({ cls: 'crc-stat__label', text: 'Successfully generated' });
		successStat.createDiv({
			cls: 'crc-stat__value',
			text: String(successCount)
		});

		// Failure count (if any)
		if (failureCount > 0) {
			const failureStat = statsGrid.createDiv({ cls: 'crc-stat' });
			failureStat.createDiv({ cls: 'crc-stat__label', text: 'Failed' });
			failureStat.createDiv({
				cls: 'crc-stat__value',
				text: String(failureCount)
			});
		}

		// Total trees
		const totalStat = statsGrid.createDiv({ cls: 'crc-stat' });
		totalStat.createDiv({ cls: 'crc-stat__label', text: 'Total family groups' });
		totalStat.createDiv({
			cls: 'crc-stat__value',
			text: String(results.length)
		});

		this.contentContainer.appendChild(summaryCard);

		// Success message or warning
		if (failureCount === 0) {
			const successMsg = this.contentContainer.createEl('p', {
				cls: 'crc-text-success crc-mt-3'
			});
			successMsg.createEl('strong', { text: '✓ All trees generated successfully!' });
		} else {
			const warningMsg = this.contentContainer.createEl('p', {
				cls: 'crc-text-warning crc-mt-3'
			});
			warningMsg.createEl('strong', { text: `⚠ ${failureCount} tree${failureCount === 1 ? '' : 's'} failed to generate.` });
			warningMsg.appendText(' See details below.');
		}

		// Details card
		const detailsCard = this.createCard({
			title: 'Generated trees',
			icon: 'file'
		});

		const detailsContent = detailsCard.querySelector('.crc-card__content') as HTMLElement;

		// List of results
		const resultsList = detailsContent.createDiv({ cls: 'crc-results-list' });

		results.forEach((result) => {
			const resultItem = resultsList.createDiv({
				cls: `crc-result-item ${result.success ? 'crc-result-item--success' : 'crc-result-item--error'}`
			});

			// Icon and family name
			const resultHeader = resultItem.createDiv({ cls: 'crc-result-item__header' });

			const icon = createLucideIcon(result.success ? 'check' : 'alert-circle', 16);
			resultHeader.appendChild(icon);

			resultHeader.createSpan({
				cls: 'crc-result-item__name',
				text: result.familyName
			});

			resultHeader.createSpan({
				cls: 'crc-result-item__count',
				text: `${result.peopleCount} people`
			});

			// Success: show file name and action buttons
			if (result.success && result.file) {
				const resultBody = resultItem.createDiv({ cls: 'crc-result-item__body' });

				resultBody.createEl('p', {
					cls: 'crc-text-muted',
					text: result.fileName || ''
				});

				// Action buttons
				const actions = resultBody.createDiv({ cls: 'crc-result-item__actions' });

				const openBtn = actions.createEl('button', {
					cls: 'crc-btn crc-btn--small',
					text: 'Open canvas'
				});
				const openIcon = createLucideIcon('external-link', 14);
				openBtn.prepend(openIcon);
				openBtn.addEventListener('click', () => {
					void (async () => {
						if (result.file) {
							const leaf = this.app.workspace.getLeaf(false);
							await leaf.openFile(result.file);
							this.close();
						}
					})();
				});

				const relayoutBtn = actions.createEl('button', {
					cls: 'crc-btn crc-btn--small crc-btn--secondary',
					text: 'Re-layout'
				});
				const relayoutIcon = createLucideIcon('refresh-cw', 14);
				relayoutBtn.prepend(relayoutIcon);
				relayoutBtn.addEventListener('click', () => {
					void (async () => {
						if (result.file) {
							// Call the plugin's regenerate method
							await this.plugin.regenerateCanvas(result.file);
						}
					})();
				});
			}

			// Failure: show error message
			if (!result.success && result.error) {
				const resultBody = resultItem.createDiv({ cls: 'crc-result-item__body' });

				resultBody.createEl('p', {
					cls: 'crc-text-error',
					text: `Error: ${result.error}`
				});
			}
		});

		this.contentContainer.appendChild(detailsCard);

		// Back button
		const backBtn = this.contentContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-btn--block crc-mt-3',
			text: 'Back to tree output'
		});
		const backIcon = createLucideIcon('chevron-right', 16);
		backBtn.prepend(backIcon);
		backBtn.addEventListener('click', () => {
			this.showTab('tree-generation');
		});

		// Final success notice
		if (failureCount === 0) {
			new Notice(`Successfully generated ${successCount} family trees!`, 5000);
		} else {
			new Notice(`Generated ${successCount} of ${results.length} trees. ${failureCount} failed.`, 5000);
		}
	}

	// ==========================================================================
	// TAB CONTENT METHODS
	// ==========================================================================

	/**
	 * Show Dashboard tab with quick actions and vault overview
	 */
	private showDashboardTab(): void {
		renderDashboardTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: this.createCard.bind(this),
			switchTab: this.switchTab.bind(this),
			closeModal: () => this.close()
		});
	}

	/**
	 * Show Status tab (legacy - kept for reference during migration)
	 */
	private async showStatusTab(): Promise<void> {
		const container = this.contentContainer;

		// Show loading state
		const loadingCard = this.createCard({
			title: 'Vault statistics',
			icon: 'activity'
		});
		const loadingContent = loadingCard.querySelector('.crc-card__content') as HTMLElement;
		loadingContent.createEl('p', { text: 'Loading statistics...', cls: 'crc-text-muted' });
		container.appendChild(loadingCard);

		// Collect statistics with error handling
		let stats: FullVaultStats;
		try {
			const statsService = new VaultStatsService(this.app);
			const folderFilter = this.plugin.getFolderFilter();
			if (folderFilter) {
				statsService.setFolderFilter(folderFilter);
			}
			statsService.setSettings(this.plugin.settings);
			stats = statsService.collectStats();
		} catch (error) {
			// Clear loading state and show error
			container.empty();
			const errorCard = this.createCard({
				title: 'Error loading statistics',
				icon: 'alert-triangle'
			});
			const errorContent = errorCard.querySelector('.crc-card__content') as HTMLElement;
			errorContent.createEl('p', {
				text: `Failed to collect vault statistics: ${getErrorMessage(error)}`,
				cls: 'crc-text-error'
			});
			errorContent.createEl('p', {
				text: 'Please check the developer console for more details.',
				cls: 'crc-text-muted'
			});
			container.appendChild(errorCard);
			console.error('Error collecting vault statistics:', error);
			return;
		}

		// Clear loading state
		container.empty();

		// People Statistics Card
		const peopleCard = this.createCard({
			title: 'People',
			icon: 'users'
		});
		const peopleContent = peopleCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(peopleContent, 'Total people', stats.people.totalPeople);
		this.createStatRow(peopleContent, 'With birth date', stats.people.peopleWithBirthDate);
		this.createStatRow(peopleContent, 'With death date', stats.people.peopleWithDeathDate);
		this.createStatRow(peopleContent, 'Living', stats.people.livingPeople, 'crc-text-success');
		this.createStatRow(peopleContent, 'Orphaned (no relationships)', stats.people.orphanedPeople,
			stats.people.orphanedPeople > 0 ? 'crc-text-warning' : undefined);

		// View full statistics link
		const statsLink = peopleContent.createDiv({ cls: 'cr-stats-link' });
		const link = statsLink.createEl('a', { text: 'View full statistics →', cls: 'crc-text-muted' });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			this.close();
			void this.plugin.activateStatisticsView();
		});

		container.appendChild(peopleCard);

		// Family Links Card (standard genealogical relationships)
		const relCard = this.createCard({
			title: 'Family links',
			icon: 'link'
		});
		const relContent = relCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(relContent, 'Total links', stats.relationships.totalRelationships);
		this.createStatRow(relContent, 'Father links', stats.relationships.totalFatherLinks);
		this.createStatRow(relContent, 'Mother links', stats.relationships.totalMotherLinks);
		this.createStatRow(relContent, getSpouseCompoundLabel(this.plugin.settings, 'links'), stats.relationships.totalSpouseLinks);
		this.createStatRow(relContent, 'People with father', stats.people.peopleWithFather);
		this.createStatRow(relContent, 'People with mother', stats.people.peopleWithMother);
		this.createStatRow(relContent, `People with ${getSpouseLabel(this.plugin.settings, { lowercase: true })}`, stats.people.peopleWithSpouse);

		container.appendChild(relCard);

		// Places Card
		const placesCard = this.createCard({
			title: 'Places',
			icon: 'map-pin'
		});
		const placesContent = placesCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(placesContent, 'Total places', stats.places.totalPlaces);
		this.createStatRow(placesContent, 'With coordinates', stats.places.placesWithCoordinates);

		// Show category breakdown if there are places
		if (stats.places.totalPlaces > 0) {
			const categories = Object.entries(stats.places.byCategory)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5); // Top 5 categories

			if (categories.length > 0) {
				const categoryLabel = placesContent.createDiv({ cls: 'crc-stat-row crc-mt-2' });
				categoryLabel.createDiv({ cls: 'crc-stat-label crc-text-muted', text: 'By category:' });

				for (const [category, count] of categories) {
					this.createStatRow(placesContent, `  ${category}`, count, 'crc-text-muted');
				}
			}
		}

		container.appendChild(placesCard);

		// Maps Card
		const mapsCard = this.createCard({
			title: 'Custom maps',
			icon: 'map'
		});
		const mapsContent = mapsCard.querySelector('.crc-card__content') as HTMLElement;

		mapsContent.createEl('p', {
			text: 'The built-in interactive map handles most real-world genealogy. Custom maps are for historical maps, cemetery plots, land surveys, or fictional worlds.',
			cls: 'crc-text-muted crc-mb-2'
		});

		this.createStatRow(mapsContent, 'Total custom maps', stats.maps.totalMaps);

		if (stats.maps.universes.length > 0) {
			const universesRow = mapsContent.createDiv({ cls: 'crc-stat-row crc-mt-2' });
			universesRow.createDiv({ cls: 'crc-stat-label', text: 'Universes' });
			universesRow.createDiv({
				cls: 'crc-stat-value crc-text-muted',
				text: stats.maps.universes.join(', ')
			});
		}

		// View full statistics link
		const mapsStatsLink = mapsContent.createDiv({ cls: 'cr-stats-link' });
		const mapsLink = mapsStatsLink.createEl('a', { text: 'View full statistics →', cls: 'crc-text-muted' });
		mapsLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.close();
			void this.plugin.activateStatisticsView();
		});

		container.appendChild(mapsCard);

		// Events Card
		const eventsCard = this.createCard({
			title: 'Events',
			icon: 'calendar'
		});
		const eventsContent = eventsCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(eventsContent, 'Total events', stats.events.totalEvents);

		// Show event type breakdown if there are events
		if (stats.events.totalEvents > 0) {
			const eventTypes = Object.entries(stats.events.byType)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5); // Top 5 types

			if (eventTypes.length > 0) {
				const typeLabel = eventsContent.createDiv({ cls: 'crc-stat-row crc-mt-2' });
				typeLabel.createDiv({ cls: 'crc-stat-label crc-text-muted', text: 'By type:' });

				for (const [eventType, count] of eventTypes) {
					this.createStatRow(eventsContent, `  ${eventType}`, count, 'crc-text-muted');
				}
			}
		}

		container.appendChild(eventsCard);

		// Sources Card
		const sourcesCard = this.createCard({
			title: 'Sources',
			icon: 'book-open'
		});
		const sourcesContent = sourcesCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(sourcesContent, 'Total sources', stats.sources.totalSources);

		// Show source type breakdown if there are sources
		if (stats.sources.totalSources > 0) {
			const sourceTypes = Object.entries(stats.sources.byType)
				.sort(([, a], [, b]) => b - a)
				.slice(0, 5); // Top 5 types

			if (sourceTypes.length > 0) {
				const typeLabel = sourcesContent.createDiv({ cls: 'crc-stat-row crc-mt-2' });
				typeLabel.createDiv({ cls: 'crc-stat-label crc-text-muted', text: 'By type:' });

				for (const [sourceType, count] of sourceTypes) {
					this.createStatRow(sourcesContent, `  ${sourceType}`, count, 'crc-text-muted');
				}
			}
		}

		container.appendChild(sourcesCard);

		// Canvases Card
		const canvasesCard = this.createCard({
			title: 'Canvases',
			icon: 'layout'
		});
		const canvasesContent = canvasesCard.querySelector('.crc-card__content') as HTMLElement;

		this.createStatRow(canvasesContent, 'Total canvases', stats.canvases.totalCanvases);

		container.appendChild(canvasesCard);

		// Vault Health Card
		const healthCard = this.createCard({
			title: 'Vault health',
			icon: 'heart'
		});
		const healthContent = healthCard.querySelector('.crc-card__content') as HTMLElement;

		const completeness = this.calculateCompleteness(stats);
		this.createHealthBar(healthContent, completeness);

		const healthInfo = healthContent.createDiv({ cls: 'crc-mt-4' });
		healthInfo.createEl('p', {
			text: `Data completeness: ${completeness}%`,
			cls: 'crc-mb-2'
		});

		const lastUpdated = healthContent.createDiv({ cls: 'crc-text-muted crc-mt-2' });
		lastUpdated.createEl('small', {
			text: `Last updated: ${stats.lastUpdated.toLocaleTimeString()}`
		});

		container.appendChild(healthCard);

		// Recent Trees Card
		// First, clean up deleted files from the history
		const existingTrees = this.plugin.settings.recentTrees.filter(tree => {
			const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
			return file instanceof TFile;
		});

		// Update settings if any were removed
		if (existingTrees.length !== this.plugin.settings.recentTrees.length) {
			this.plugin.settings.recentTrees = existingTrees;
			await this.plugin.saveSettings();
		}

		if (existingTrees.length > 0) {
			const recentTreesCard = this.createCard({
				title: 'Recently generated trees',
				icon: 'git-branch'
			});
			const recentTreesContent = recentTreesCard.querySelector('.crc-card__content') as HTMLElement;

			// Add clear history button to card header
			const cardHeader = recentTreesCard.querySelector('.crc-card__header') as HTMLElement;
			const clearButton = cardHeader.createEl('button', {
				cls: 'crc-button crc-button--small',
				text: 'Clear history'
			});
			clearButton.addEventListener('click', () => {
				void (async () => {
					this.plugin.settings.recentTrees = [];
					await this.plugin.saveSettings();
					new Notice('Tree history cleared');
					this.showTab('dashboard'); // Refresh the tab
				})();
			});

			existingTrees.forEach((tree) => {
				const treeRow = recentTreesContent.createDiv({ cls: 'crc-recent-tree' });

				// Tree name (clickable link)
				const treeHeader = treeRow.createDiv({ cls: 'crc-recent-tree__header' });
				const treeLink = treeHeader.createEl('a', {
					cls: 'crc-recent-tree__name',
					text: tree.canvasName
				});
				treeLink.addEventListener('click', (e) => {
					void (async () => {
						e.preventDefault();
						const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
						if (file instanceof TFile) {
							const leaf = this.app.workspace.getLeaf(false);
							await leaf.openFile(file);
							this.close();
						} else {
							new Notice(`Canvas file not found: ${tree.canvasPath}`);
						}
					})();
				});

				// Root person
				const rootInfo = treeHeader.createDiv({ cls: 'crc-recent-tree__root' });
				rootInfo.createEl('small', { text: `Root: ${tree.rootPerson}`, cls: 'crc-text-muted' });

				// Stats row
				const statsRow = treeRow.createDiv({ cls: 'crc-recent-tree__stats' });

				// People count
				const peopleCount = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const peopleIcon = createLucideIcon('users', 14);
				peopleCount.appendChild(peopleIcon);
				peopleCount.appendText(` ${tree.peopleCount} people`);

				// Edge count
				const edgeCount = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const edgeIcon = createLucideIcon('link', 14);
				edgeCount.appendChild(edgeIcon);
				edgeCount.appendText(` ${tree.edgeCount} edges`);

				// Timestamp
				const timestamp = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const timeIcon = document.createElement('span');
				timeIcon.classList.add('crc-icon');
				setIcon(timeIcon, 'clock');
				timestamp.appendChild(timeIcon);
				const timeAgo = this.formatTimeAgo(tree.timestamp);
				timestamp.appendText(` ${timeAgo}`);
			});

			container.appendChild(recentTreesCard);
		}

		// Recent Imports Section
		const recentImports = this.plugin.settings.recentImports;
		if (recentImports.length > 0) {
			const recentImportsCard = this.createCard({
				title: 'Recent GEDCOM imports',
				icon: 'upload'
			});
			const recentImportsContent = recentImportsCard.querySelector('.crc-card__content') as HTMLElement;

			// Add clear history button to card header
			const cardHeader = recentImportsCard.querySelector('.crc-card__header') as HTMLElement;
			const clearButton = cardHeader.createEl('button', {
				cls: 'crc-button crc-button--small',
				text: 'Clear history'
			});
			clearButton.addEventListener('click', () => {
				void (async () => {
					this.plugin.settings.recentImports = [];
					await this.plugin.saveSettings();
					new Notice('Import history cleared');
					this.showTab('dashboard'); // Refresh the tab
				})();
			});

			recentImports.forEach((importInfo) => {
				const importRow = recentImportsContent.createDiv({ cls: 'crc-recent-tree' });

				// Import file name
				const importHeader = importRow.createDiv({ cls: 'crc-recent-tree__header' });
				importHeader.createEl('span', {
					cls: 'crc-recent-tree__name',
					text: importInfo.fileName
				});

				// Stats row
				const statsRow = importRow.createDiv({ cls: 'crc-recent-tree__stats' });

				// Records imported
				const recordsCount = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const recordsIcon = createLucideIcon('folder', 14);
				recordsCount.appendChild(recordsIcon);
				recordsCount.appendText(` ${importInfo.recordsImported} records`);

				// Notes created
				const notesCount = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const notesIcon = createLucideIcon('file-text', 14);
				notesCount.appendChild(notesIcon);
				notesCount.appendText(` ${importInfo.notesCreated} notes`);

				// Timestamp
				const timestamp = statsRow.createDiv({ cls: 'crc-recent-tree__stat' });
				const timeIcon = document.createElement('span');
				timeIcon.classList.add('crc-icon');
				setIcon(timeIcon, 'clock');
				timestamp.appendChild(timeIcon);
				const timeAgo = this.formatTimeAgo(importInfo.timestamp);
				timestamp.appendText(` ${timeAgo}`);
			});

			container.appendChild(recentImportsCard);
		}
	}

	/**
	 * Format timestamp as relative time
	 */
	private formatTimeAgo(timestamp: number): string {
		const now = Date.now();
		const diff = now - timestamp;
		const seconds = Math.floor(diff / 1000);
		const minutes = Math.floor(seconds / 60);
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return days === 1 ? '1 day ago' : `${days} days ago`;
		} else if (hours > 0) {
			return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
		} else if (minutes > 0) {
			return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
		} else {
			return 'just now';
		}
	}

	/**
	 * Create a statistic row
	 */
	private createStatRow(
		container: HTMLElement,
		label: string,
		value: number,
		valueClass?: string
	): void {
		const row = container.createDiv({ cls: 'crc-stat-row' });
		row.createDiv({ cls: 'crc-stat-label', text: label });
		const valueEl = row.createDiv({ cls: 'crc-stat-value', text: value.toString() });
		if (valueClass) {
			valueEl.addClass(valueClass);
		}
	}

	/**
	 * Calculate data completeness percentage
	 */
	private calculateCompleteness(stats: FullVaultStats): number {
		if (stats.people.totalPeople === 0) return 0;

		const withBirth = stats.people.peopleWithBirthDate;
		const withDeath = stats.people.peopleWithDeathDate;
		const withRelationships = stats.people.totalPeople - stats.people.orphanedPeople;

		// Weight: 40% birth dates, 30% death dates, 30% relationships
		const birthScore = (withBirth / stats.people.totalPeople) * 40;
		const deathScore = (withDeath / stats.people.totalPeople) * 30;
		const relScore = (withRelationships / stats.people.totalPeople) * 30;

		return Math.round(birthScore + deathScore + relScore);
	}

	/**
	 * Create health bar visualization
	 */
	private createHealthBar(container: HTMLElement, percentage: number): HTMLElement {
		const barContainer = container.createDiv({ cls: 'crc-health-bar-container' });
		const bar = barContainer.createDiv({ cls: 'crc-health-bar' });
		const fill = bar.createDiv({ cls: 'crc-health-bar-fill' });
		fill.style.setProperty('width', `${percentage}%`);

		// Color based on percentage
		if (percentage >= 80) {
			fill.addClass('crc-health-bar-fill--success');
		} else if (percentage >= 50) {
			fill.addClass('crc-health-bar-fill--warning');
		} else {
			fill.addClass('crc-health-bar-fill--error');
		}

		return barContainer;
	}

	/**
	 * Show Guide tab - Quick start and getting started information
	 * Streamlined version with wiki links for detailed documentation
	 */
	private showGuideTab(): void {
		const container = this.contentContainer;
		const WIKI_BASE = 'https://github.com/banisterious/obsidian-charted-roots/wiki';

		// =========================================================================
		// Card 1: Welcome & Quick Start
		// =========================================================================
		const welcomeCard = this.createCard({
			title: 'Welcome to Charted Roots',
			icon: 'book-open'
		});
		const welcomeContent = welcomeCard.querySelector('.crc-card__content') as HTMLElement;

		welcomeContent.createEl('p', {
			text: 'Charted Roots generates family trees on the Obsidian canvas from your markdown notes. Get started in three steps:',
			cls: 'crc-mb-3'
		});

		const steps = [
			{ number: '1', title: 'Enter your data', tab: 'import-export', desc: 'Import GEDCOM, use Bases, or create notes manually' },
			{ number: '2', title: 'Generate the tree', tab: 'tree-generation', desc: 'Select a root person and generate' },
			{ number: '3', title: 'Maintain the layout', tab: null, desc: 'Right-click canvas → Regenerate after edits' }
		];

		steps.forEach((step) => {
			const stepEl = welcomeContent.createDiv({ cls: 'crc-guide-step' });
			const badge = stepEl.createDiv({ cls: 'crc-guide-step__badge' });
			badge.textContent = step.number;
			const content = stepEl.createDiv({ cls: 'crc-guide-step__content' });
			const titleEl = content.createEl('h4', { cls: 'crc-mb-1' });
			if (step.tab) {
				const link = titleEl.createEl('a', { text: step.title, cls: 'crc-link' });
				link.addEventListener('click', (e) => { e.preventDefault(); this.switchTab(step.tab); });
			} else {
				titleEl.textContent = step.title;
			}
			content.createEl('p', { text: step.desc, cls: 'crc-text-muted' });
		});

		const wikiLinkWrapper = welcomeContent.createDiv({ cls: 'cr-stats-link' });
		const wikiLink = wikiLinkWrapper.createEl('a', {
			text: 'Read the full Getting Started guide →',
			href: `${WIKI_BASE}/Getting-Started`,
			cls: 'crc-text-muted'
		});
		wikiLink.setAttr('target', '_blank');

		container.appendChild(welcomeCard);

		// =========================================================================
		// Card 2: After Importing
		// =========================================================================
		const afterImportCard = this.createCard({
			title: 'After importing',
			icon: 'sparkles',
			subtitle: 'Clean up and enhance your imported data'
		});
		const afterImportContent = afterImportCard.querySelector('.crc-card__content') as HTMLElement;

		afterImportContent.createEl('p', {
			text: 'Imported data often needs cleanup. GEDCOM files may have inconsistent dates, missing reciprocal relationships, or varied place name spellings.',
			cls: 'crc-mb-3'
		});

		const cleanupSteps = afterImportContent.createEl('ol', { cls: 'crc-cleanup-steps crc-mb-3' });
		[
			'Run the Quality Report to see what needs attention',
			'Fix bidirectional relationships for graph integrity',
			'Normalize dates and gender values',
			'Standardize and geocode places'
		].forEach(step => {
			cleanupSteps.createEl('li', { text: step });
		});

		const afterImportBtnRow = afterImportContent.createDiv({ cls: 'crc-btn-row' });
		const cleanupBtn = afterImportBtnRow.createEl('button', {
			text: 'Open Data Quality',
			cls: 'crc-btn crc-btn--primary'
		});
		cleanupBtn.addEventListener('click', () => {
			this.switchTab('data-quality');
		});

		const workflowLink = afterImportBtnRow.createEl('a', {
			text: 'Full workflow guide →',
			href: `${WIKI_BASE}/Data-Quality#post-import-cleanup-workflow`,
			cls: 'crc-link'
		});
		workflowLink.setAttr('target', '_blank');

		container.appendChild(afterImportCard);

		// =========================================================================
		// Card 3: Essential Properties (Collapsible)
		// =========================================================================
		const propsCard = this.createCard({
			title: 'Essential properties',
			icon: 'file-text',
			subtitle: 'YAML frontmatter fields for person, place, source, event, map, and universe notes'
		});
		const propsContent = propsCard.querySelector('.crc-card__content') as HTMLElement;

		// Person properties collapsible
		this.createCollapsible(propsContent, 'Person notes', 'user', (body) => {
			const aliasService = new PropertyAliasService(this.plugin);

			// Helper to get display name with alias indicator
			const getDisplayName = (canonical: string): string => {
				const alias = aliasService.getAlias(canonical);
				return alias ? `${alias}` : canonical;
			};

			// Helper for combined properties like "father / mother"
			const getCombinedDisplayName = (props: string[]): string => {
				return props.map(p => getDisplayName(p)).join(' / ');
			};

			const list = body.createEl('ul', { cls: 'crc-field-list' });

			// Properties with aliasing support
			const personProps = [
				{ canonical: 'cr_id', desc: 'Unique identifier', req: true },
				{ canonical: 'cr_type', desc: 'Must be "person"', req: true },
				{ canonical: 'name', desc: 'Full name', req: true },
				{ combined: ['father', 'mother'], desc: 'Wikilinks to parents', req: false },
				{ canonical: 'spouse', desc: 'Array of spouse wikilinks', req: false },
				{ combined: ['born', 'died'], desc: 'Dates (YYYY-MM-DD)', req: false }
			];

			personProps.forEach(p => {
				const li = list.createEl('li');
				let displayName: string;
				let hasAlias: boolean;

				if ('canonical' in p && p.canonical) {
					displayName = getDisplayName(p.canonical);
					hasAlias = aliasService.hasAlias(p.canonical);
				} else if ('combined' in p && p.combined) {
					displayName = getCombinedDisplayName(p.combined);
					hasAlias = p.combined.some(prop => aliasService.hasAlias(prop));
				} else {
					displayName = '';
					hasAlias = false;
				}

				const code = li.createEl('code', { text: displayName });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);

				// Show alias indicator if any property is aliased
				if (hasAlias) {
					const indicator = li.createEl('span', {
						text: ' (aliased)',
						cls: 'crc-text-muted cr-alias-indicator'
					});
					indicator.setAttribute('title', 'This property uses a custom name configured in Settings → Charted Roots');
				}
			});
		});

		// Place properties collapsible
		this.createCollapsible(propsContent, 'Place notes', 'map-pin', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "place"', req: true },
				{ name: 'cr_id', desc: 'Unique identifier', req: true },
				{ name: 'name', desc: 'Place name', req: true },
				{ name: 'coordinates', desc: 'lat/long for map display', req: false },
				{ name: 'parent_place', desc: 'Wikilink to parent place', req: false }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
		});

		// Map properties collapsible
		this.createCollapsible(propsContent, 'Custom map notes', 'globe', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "map"', req: true },
				{ name: 'map_id', desc: 'Unique map identifier', req: true },
				{ name: 'universe', desc: 'Universe for filtering places', req: true },
				{ name: 'image', desc: 'Path to map image', req: true },
				{ name: 'bounds', desc: 'Coordinate bounds (north/south/east/west)', req: true }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
		});

		// Source properties collapsible
		this.createCollapsible(propsContent, 'Source notes', 'archive', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "source"', req: true },
				{ name: 'cr_id', desc: 'Unique identifier', req: true },
				{ name: 'title', desc: 'Source title', req: true },
				{ name: 'source_type', desc: 'Type (census, vital_record, etc.)', req: true },
				{ name: 'source_repository', desc: 'Archive or website holding source', req: false },
				{ name: 'source_date', desc: 'Document date', req: false },
				{ name: 'confidence', desc: 'high, medium, low, or unknown', req: false }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
		});

		// Schema properties collapsible
		this.createCollapsible(propsContent, 'Schema notes', 'clipboard-check', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "schema"', req: true },
				{ name: 'cr_id', desc: 'Unique schema identifier', req: true },
				{ name: 'name', desc: 'Display name', req: true },
				{ name: 'applies_to_type', desc: 'Scope: collection, folder, universe, all', req: true },
				{ name: 'applies_to_value', desc: 'Value for scope (if not "all")', req: false }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
			body.createEl('p', {
				text: 'Schema definition goes in a json schema code block in the note body.',
				cls: 'crc-text-muted crc-mt-2'
			});
		});

		// Event properties collapsible
		this.createCollapsible(propsContent, 'Event notes', 'calendar', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "event"', req: true },
				{ name: 'cr_id', desc: 'Unique identifier', req: true },
				{ name: 'title', desc: 'Event title', req: true },
				{ name: 'event_type', desc: 'Type (birth, death, marriage, etc.)', req: true },
				{ name: 'date', desc: 'Event date (ISO format)', req: false },
				{ name: 'date_precision', desc: 'exact, month, year, decade, estimated, range', req: false },
				{ name: 'person', desc: 'Primary person wikilink', req: false },
				{ name: 'place', desc: 'Location wikilink', req: false },
				{ name: 'confidence', desc: 'high, medium, low, or unknown', req: false }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
		});

		// Universe properties collapsible
		this.createCollapsible(propsContent, 'Universe notes', 'globe', (body) => {
			const list = body.createEl('ul', { cls: 'crc-field-list' });
			[
				{ name: 'cr_type', desc: 'Must be "universe"', req: true },
				{ name: 'cr_id', desc: 'Unique identifier', req: true },
				{ name: 'name', desc: 'Universe name', req: true },
				{ name: 'description', desc: 'Brief description of the world', req: false },
				{ name: 'author', desc: 'Creator of the fictional world', req: false },
				{ name: 'genre', desc: 'Fantasy, sci-fi, historical, etc.', req: false },
				{ name: 'status', desc: 'active, draft, or archived', req: false },
				{ name: 'default_calendar', desc: 'Default calendar cr_id', req: false },
				{ name: 'default_map', desc: 'Default map cr_id', req: false }
			].forEach(p => {
				const li = list.createEl('li');
				const code = li.createEl('code', { text: p.name });
				if (p.req) code.addClass('crc-field--required');
				li.appendText(` - ${p.desc}`);
			});
		});

		const schemaLinkWrapper = propsContent.createDiv({ cls: 'cr-stats-link' });
		const schemaLink = schemaLinkWrapper.createEl('a', {
			text: 'Full frontmatter reference →',
			href: `${WIKI_BASE}/Frontmatter-Reference`,
			cls: 'crc-text-muted'
		});
		schemaLink.setAttr('target', '_blank');

		container.appendChild(propsCard);

		// =========================================================================
		// Card 4: Key Concepts
		// =========================================================================
		const conceptsCard = this.createCard({
			title: 'Key concepts',
			icon: 'lightbulb',
			subtitle: 'Important features to understand'
		});
		const conceptsContent = conceptsCard.querySelector('.crc-card__content') as HTMLElement;

		const concepts = [
			{
				title: 'Groups vs Collections',
				desc: 'Groups are auto-detected connected families. Collections are user-defined categories for organizing people across families.',
				wiki: 'Data-Management#groups-and-collections'
			},
			{
				title: 'Bidirectional sync',
				desc: 'When you set someone as a parent, the reciprocal child link is automatically created. Works for all relationships.',
				wiki: 'Data-Management#bidirectional-sync'
			},
			{
				title: 'Post-import cleanup',
				desc: 'After importing GEDCOM files, run cleanup operations to fix relationships, normalize dates, and standardize places.',
				wiki: 'Data-Quality#post-import-cleanup-workflow'
			},
			{
				title: 'Schema validation',
				desc: 'Define validation rules to ensure data consistency. Require properties, validate types, and create custom constraints.',
				wiki: 'Schema-Validation'
			},
			{
				title: 'Layout algorithms',
				desc: 'Choose Standard, Compact, Timeline, or Hourglass layouts depending on your tree size and visualization needs.',
				wiki: 'Tree-Generation#layout-algorithms'
			},
			{
				title: 'Universe notes',
				desc: 'Organize fictional worlds as first-class entities. Universes scope people, places, events, calendars, and maps.',
				wiki: 'Universe-Notes'
			}
		];

		concepts.forEach(c => {
			const item = conceptsContent.createDiv({ cls: 'crc-mb-3' });
			item.createEl('strong', { text: c.title });
			item.createEl('p', { text: c.desc, cls: 'crc-text-muted crc-mb-1' });
			const link = item.createEl('a', { text: 'Learn more →', href: `${WIKI_BASE}/${c.wiki}`, cls: 'crc-link' });
			link.setAttr('target', '_blank');
		});

		container.appendChild(conceptsCard);

		// =========================================================================
		// Card 5: Fictional Universes
		// =========================================================================
		const universesCard = this.createCard({
			title: 'Fictional universes',
			icon: 'globe',
			subtitle: 'For worldbuilders and fiction writers'
		});
		const universesContent = universesCard.querySelector('.crc-card__content') as HTMLElement;

		// Check if universes exist
		const universeService = new UniverseService(this.plugin);
		const universes = universeService.getAllUniverses();
		const hasUniverses = universes.length > 0;

		if (hasUniverses) {
			// Show universe summary
			universesContent.createEl('p', {
				text: `You have ${universes.length} universe${universes.length === 1 ? '' : 's'}:`,
				cls: 'crc-mb-2'
			});

			const universeList = universesContent.createEl('ul', { cls: 'crc-universe-list crc-mb-3' });
			// Show up to 3 universes
			const displayUniverses = universes.slice(0, 3);
			displayUniverses.forEach(universe => {
				const counts = universeService.getEntityCountsForUniverse(universe.crId);
				const countParts: string[] = [];
				if (counts.people > 0) countParts.push(`${counts.people} people`);
				if (counts.places > 0) countParts.push(`${counts.places} places`);
				if (counts.events > 0) countParts.push(`${counts.events} events`);

				const li = universeList.createEl('li');
				const nameLink = li.createEl('a', {
					text: universe.name,
					cls: 'crc-link'
				});
				nameLink.addEventListener('click', (e) => {
					e.preventDefault();
					this.close();
					const leaf = this.app.workspace.getLeaf(false);
					void leaf.openFile(universe.file);
				});
				if (countParts.length > 0) {
					li.createSpan({
						text: ` (${countParts.join(', ')})`,
						cls: 'crc-text-muted'
					});
				}
			});

			if (universes.length > 3) {
				universesContent.createEl('p', {
					text: `...and ${universes.length - 3} more`,
					cls: 'crc-text-muted crc-mb-3'
				});
			}

			// Buttons
			const btnRow = universesContent.createDiv({ cls: 'crc-btn-row' });
			const createBtn = btnRow.createEl('button', {
				text: 'Create universe',
				cls: 'crc-btn crc-btn--primary'
			});
			createBtn.addEventListener('click', () => {
				new UniverseWizardModal(this.plugin, {
					onComplete: () => this.switchTab('universes')
				}).open();
			});

			const manageBtn = btnRow.createEl('button', {
				text: 'Manage universes',
				cls: 'crc-btn crc-btn--secondary'
			});
			manageBtn.addEventListener('click', () => {
				this.switchTab('universes');
			});

			// Wiki link
			const wikiLinkWrapper = universesContent.createDiv({ cls: 'cr-stats-link' });
			const wikiLink = wikiLinkWrapper.createEl('a', {
				text: 'Learn more about universes →',
				href: `${WIKI_BASE}/Universe-Notes`,
				cls: 'crc-text-muted'
			});
			wikiLink.setAttr('target', '_blank');
		} else {
			// No universes - show explanation
			universesContent.createEl('p', {
				text: 'Universes help you organize fictional worlds. Create a universe to group related calendars, maps, places, and characters together.',
				cls: 'crc-mb-3'
			});

			universesContent.createEl('p', {
				text: 'No universes yet.',
				cls: 'crc-text-muted crc-mb-3'
			});

			// Buttons
			const btnRow = universesContent.createDiv({ cls: 'crc-btn-row' });
			const createBtn = btnRow.createEl('button', {
				text: 'Create universe',
				cls: 'crc-btn crc-btn--primary'
			});
			createBtn.addEventListener('click', () => {
				new UniverseWizardModal(this.plugin, {
					onComplete: () => this.switchTab('universes')
				}).open();
			});

			const learnLink = btnRow.createEl('a', {
				text: 'Learn more about universes →',
				href: `${WIKI_BASE}/Universe-Notes`,
				cls: 'crc-link'
			});
			learnLink.setAttr('target', '_blank');
		}

		container.appendChild(universesCard);

		// =========================================================================
		// Card 6: Common Tasks (Navigation Grid)
		// =========================================================================
		const tasksCard = this.createCard({
			title: 'Common tasks',
			icon: 'list-checks',
			subtitle: 'Quick links to frequently used features'
		});
		const tasksContent = tasksCard.querySelector('.crc-card__content') as HTMLElement;

		const tasks = [
			{ icon: 'upload', title: 'Import data', desc: 'GEDCOM, CSV, Gramps', tab: 'import-export' },
			{ icon: 'download', title: 'Export data', desc: 'GEDCOM, CSV formats', tab: 'import-export' },
			{ icon: 'shield-check', title: 'Clean up data', desc: 'Post-import workflow', tab: 'data-quality' },
			{ icon: 'git-branch', title: 'Generate tree', desc: 'Create visual canvas', tab: 'tree-generation' },
			{ icon: 'map', title: 'Open map view', desc: 'Geographic visualization', tab: null, command: 'charted-roots:open-map-view' },
			{ icon: 'users', title: 'Manage people', desc: 'Browse and edit', tab: 'people' },
			{ icon: 'clipboard-check', title: 'Validate schemas', desc: 'Check data consistency', tab: 'schemas' }
		];

		const taskGrid = tasksContent.createDiv({ cls: 'crc-task-grid' });
		tasks.forEach(task => {
			const taskEl = taskGrid.createDiv({ cls: 'crc-task-grid__item' });
			const iconWrap = taskEl.createDiv({ cls: 'crc-task-grid__icon' });
			setLucideIcon(iconWrap, task.icon as LucideIconName, 20);
			taskEl.createEl('strong', { text: task.title, cls: 'crc-task-grid__title' });
			taskEl.createEl('span', { text: task.desc, cls: 'crc-task-grid__desc' });

			taskEl.addEventListener('click', () => {
				if (task.command) {
					this.close();
					this.app.commands.executeCommandById(task.command);
				} else if (task.tab) {
					this.switchTab(task.tab);
				}
			});
		});

		container.appendChild(tasksCard);

		// =========================================================================
		// Card 6: Base Templates (Obsidian Bases)
		// =========================================================================
		const templatesCard = this.createCard({
			title: 'Base templates',
			icon: 'table-2',
			subtitle: 'Obsidian Bases integration'
		});
		const templatesContent = templatesCard.querySelector('.crc-card__content') as HTMLElement;

		templatesContent.createEl('p', {
			text: 'Quickly create bases for organizing your data:',
			cls: 'crc-mb-3'
		});

		const baseTemplates = [
			{ icon: 'user', title: 'People', desc: 'Family members with relationships', command: 'charted-roots:create-base-template' },
			{ icon: 'map-pin', title: 'Places', desc: 'Geographic locations', command: 'charted-roots:create-places-base-template' },
			{ icon: 'calendar', title: 'Events', desc: 'Life events and milestones', command: 'charted-roots:create-events-base-template' },
			{ icon: 'building', title: 'Organizations', desc: 'Businesses, churches, schools', command: 'charted-roots:create-organizations-base-template' },
			{ icon: 'book', title: 'Sources', desc: 'Citations and references', command: 'charted-roots:create-sources-base-template' },
			{ icon: 'globe', title: 'Universes', desc: 'Fictional worlds and settings', command: 'charted-roots:create-universes-base-template' }
		];

		const templateGrid = templatesContent.createDiv({ cls: 'crc-template-grid' });
		baseTemplates.forEach(template => {
			const templateEl = templateGrid.createDiv({ cls: 'crc-template-grid__item' });
			const iconWrap = templateEl.createDiv({ cls: 'crc-template-grid__icon' });
			setLucideIcon(iconWrap, template.icon as LucideIconName, 18);
			const textWrap = templateEl.createDiv({ cls: 'crc-template-grid__text' });
			textWrap.createEl('div', { text: template.title, cls: 'crc-template-grid__title' });
			textWrap.createEl('small', { text: template.desc });
			const btn = templateEl.createEl('button', { text: 'Create', cls: 'crc-btn crc-btn--small' });
			btn.addEventListener('click', () => {
				this.close();
				this.app.commands.executeCommandById(template.command);
			});
		});

		// Create all bases button
		const createAllContainer = templatesContent.createDiv({ cls: 'crc-mt-3' });
		const createAllBtn = createAllContainer.createEl('button', {
			text: 'Create all bases',
			cls: 'crc-btn crc-btn--secondary'
		});
		createAllBtn.addEventListener('click', () => {
			this.close();
			this.app.commands.executeCommandById('charted-roots:create-all-bases');
		});

		container.appendChild(templatesCard);

		// =========================================================================
		// Card 7: Learn More
		// =========================================================================
		const learnCard = this.createCard({
			title: 'Learn more',
			icon: 'book-open',
			subtitle: 'Documentation, templates, and tips'
		});
		const learnContent = learnCard.querySelector('.crc-card__content') as HTMLElement;

		// Documentation grid with categories
		const docsGrid = learnContent.createDiv({ cls: 'crc-docs-grid crc-mb-4' });

		const docCategories = [
			{
				title: 'Getting started',
				icon: 'rocket' as LucideIconName,
				links: [
					{ text: 'Getting started', wiki: 'Getting-Started' },
					{ text: 'Data entry', wiki: 'Data-Entry' },
					{ text: 'Templater integration', wiki: 'Templater-Integration' },
					{ text: 'Context menus', wiki: 'Context-Menus' }
				]
			},
			{
				title: 'Visualization',
				icon: 'git-branch' as LucideIconName,
				links: [
					{ text: 'Tree generation', wiki: 'Tree-Generation' },
					{ text: 'Geographic features', wiki: 'Geographic-Features' },
					{ text: 'Styling & theming', wiki: 'Styling-And-Theming' }
				]
			},
			{
				title: 'Data management',
				icon: 'database' as LucideIconName,
				links: [
					{ text: 'Import/Export', wiki: 'Import-Export' },
					{ text: 'Schema validation', wiki: 'Schema-Validation' },
					{ text: 'Evidence & sources', wiki: 'Evidence-And-Sources' }
				]
			},
			{
				title: 'Reference',
				icon: 'book-open' as LucideIconName,
				links: [
					{ text: 'Frontmatter reference', wiki: 'Frontmatter-Reference' },
					{ text: 'Settings & configuration', wiki: 'Settings-And-Configuration' },
					{ text: 'Fictional date systems', wiki: 'Fictional-Date-Systems' }
				]
			}
		];

		docCategories.forEach(category => {
			const categoryDiv = docsGrid.createDiv({ cls: 'crc-docs-category' });

			// Category title with icon
			const titleDiv = categoryDiv.createDiv({ cls: 'crc-docs-category__title' });
			const iconEl = titleDiv.createSpan({ cls: 'crc-docs-category__icon' });
			setLucideIcon(iconEl, category.icon, 14);
			titleDiv.createSpan({ text: category.title });

			// Links
			const linksList = categoryDiv.createEl('ul', { cls: 'crc-docs-category__links' });
			category.links.forEach(link => {
				const li = linksList.createEl('li');
				const a = li.createEl('a', { text: link.text, href: `${WIKI_BASE}/${link.wiki}` });
				a.setAttr('target', '_blank');
			});
		});

		// Templater section
		const templaterSection = learnContent.createDiv();
		templaterSection.createEl('h4', { text: 'Templater integration', cls: 'crc-mb-2' });
		templaterSection.createEl('p', {
			text: 'Use the Templater plugin to create notes with consistent formatting and unique cr_id values.',
			cls: 'crc-text-muted crc-mb-2'
		});
		const templaterBtnRow = templaterSection.createDiv({ cls: 'crc-btn-row' });
		const templaterBtn = templaterBtnRow.createEl('button', {
			text: 'View snippets',
			cls: 'crc-btn crc-btn--secondary'
		});
		templaterBtn.addEventListener('click', () => {
			new TemplateSnippetsModal(this.app, undefined, this.plugin.settings.propertyAliases).open();
		});
		const templaterDocsLink = templaterBtnRow.createEl('a', {
			text: 'Full guide →',
			href: `${WIKI_BASE}/Templater-Integration`,
			cls: 'crc-link'
		});
		templaterDocsLink.setAttr('target', '_blank');

		container.appendChild(learnCard);
	}

	/**
	 * Create a collapsible section within a card
	 */
	private createCollapsible(
		container: HTMLElement,
		title: string,
		icon: LucideIconName,
		renderContent: (body: HTMLElement) => void
	): HTMLElement {
		const wrapper = container.createDiv({ cls: 'crc-collapsible' });

		const header = wrapper.createDiv({ cls: 'crc-collapsible__header' });
		const headerLeft = header.createDiv({ cls: 'crc-collapsible__header-left' });
		const iconEl = headerLeft.createDiv({ cls: 'crc-collapsible__icon' });
		setLucideIcon(iconEl, icon, 16);
		headerLeft.createSpan({ text: title, cls: 'crc-collapsible__title' });

		const chevron = header.createDiv({ cls: 'crc-collapsible__chevron' });
		setLucideIcon(chevron, 'chevron-down', 16);

		const body = wrapper.createDiv({ cls: 'crc-collapsible__body' });
		renderContent(body);

		header.addEventListener('click', () => {
			wrapper.toggleClass('crc-collapsible--open', !wrapper.hasClass('crc-collapsible--open'));
		});

		return wrapper;
	}

	/**
	 * Create an accordion section for the Tree Output two-panel layout
	 */
	private createAccordionSection(
		container: HTMLElement,
		title: string,
		icon: LucideIconName,
		defaultExpanded: boolean,
		badge?: string,
		renderContent?: (body: HTMLElement) => void
	): { wrapper: HTMLElement; content: HTMLElement } {
		const wrapper = container.createDiv({ cls: 'crc-accordion-section' });

		const header = wrapper.createDiv({ cls: 'crc-accordion-header' });

		// Chevron
		const chevron = header.createSpan({ cls: 'crc-accordion-chevron' });
		setLucideIcon(chevron, defaultExpanded ? 'chevron-down' : 'chevron-right', 14);
		if (defaultExpanded) {
			chevron.addClass('crc-accordion-chevron--expanded');
		}

		// Icon
		const iconEl = header.createSpan({ cls: 'crc-accordion-icon' });
		setLucideIcon(iconEl, icon, 16);

		// Title
		header.createSpan({ text: title, cls: 'crc-accordion-title' });

		// Optional badge
		if (badge) {
			header.createSpan({ text: badge, cls: 'crc-accordion-badge' });
		}

		// Content
		const content = wrapper.createDiv({
			cls: defaultExpanded ? 'crc-accordion-content' : 'crc-accordion-content crc-accordion-content--collapsed'
		});

		// Render content if provided
		if (renderContent) {
			renderContent(content);
		}

		// Toggle handler
		header.addEventListener('click', () => {
			const isExpanded = !content.hasClass('crc-accordion-content--collapsed');
			content.toggleClass('crc-accordion-content--collapsed', isExpanded);
			chevron.toggleClass('crc-accordion-chevron--expanded', !isExpanded);
			setLucideIcon(chevron, isExpanded ? 'chevron-right' : 'chevron-down', 14);
		});

		return { wrapper, content };
	}

	/**
	 * Show People tab - combined statistics, actions, and person list
	 */
	private showPeopleTab(): void {
		const container = this.contentContainer;

		// Actions Card
		const actionsCard = this.createCard({
			title: 'Actions',
			icon: 'plus',
			subtitle: 'Create and manage person notes'
		});

		const actionsContent = actionsCard.querySelector('.crc-card__content') as HTMLElement;

		new Setting(actionsContent)
			.setName('Create new person note')
			.setDesc('Create a new person note with family relationships')
			.addButton(button => button
				.setButtonText('Create person')
				.setCta()
				.onClick(() => {
					// Use cached graph services and universes
					const familyGraph = this.getCachedFamilyGraph();
					const allUniverses = this.getCachedUniverses();

					new CreatePersonModal(this.app, {
						directory: this.plugin.settings.peopleFolder || '',
						familyGraph,
						propertyAliases: this.plugin.settings.propertyAliases,
						includeDynamicBlocks: false,
						dynamicBlockTypes: ['media', 'timeline', 'relationships'],
						existingUniverses: allUniverses,
						plugin: this.plugin,
						onCreated: () => {
							// Refresh the People tab and invalidate caches since data changed
							this.invalidateCaches();
							this.showTab('people');
						}
					}).open();
				}));

		new Setting(actionsContent)
			.setName('Create family group')
			.setDesc('Use the wizard to create multiple family members at once')
			.addButton(button => button
				.setButtonText('Create family')
				.onClick(() => {
					void import('./family-creation-wizard').then(({ FamilyCreationWizardModal }) => {
						new FamilyCreationWizardModal(this.app, this.plugin).open();
					});
				}));

		new Setting(actionsContent)
			.setName('Templater templates')
			.setDesc('Copy ready-to-use templates for Templater integration')
			.addButton(button => button
				.setButtonText('View templates')
				.onClick(() => {
					new TemplateSnippetsModal(this.app, undefined, this.plugin.settings.propertyAliases).open();
				}));

		new Setting(actionsContent)
			.setName('Create People base')
			.setDesc('Create an Obsidian base for managing People notes. After creating, click "Properties" to enable columns like Name, Parents, Spouse, Children, Birth, and Death.')
			.addButton(button => button
				.setButtonText('Create')
				.onClick(() => {
					this.app.commands.executeCommandById('charted-roots:create-base-template');
				}));

		new Setting(actionsContent)
			.setName('Link media')
			.setDesc('Open the Media Manager to browse, link, and organize media files for person notes')
			.addButton(button => button
				.setButtonText('Open Media Manager')
				.onClick(() => {
					new MediaManagerModal(this.app, this.plugin).open();
				}));

		container.appendChild(actionsCard);

		// Batch Operations Card
		const batchCard = this.createCard({
			title: 'Batch operations',
			icon: 'zap',
			subtitle: 'Fix common data issues across person notes'
		});

		const batchContent = batchCard.querySelector('.crc-card__content') as HTMLElement;

		// Navigation guidance
		const navInfo = batchContent.createEl('p', {
			cls: 'crc-text-muted',
			text: 'These operations work on all person notes in your vault. For comprehensive data quality analysis across all entities, see the '
		});
		const dataQualityLink = navInfo.createEl('a', {
			text: 'Data Quality tab',
			href: '#',
			cls: 'crc-text-link'
		});
		dataQualityLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.showTab('data-quality');
		});
		navInfo.appendText('.');

		new Setting(batchContent)
			.setName('Remove duplicate relationships')
			.setDesc('Clean up duplicate entries in spouse and children arrays')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewRemoveDuplicateRelationships();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.removeDuplicateRelationships();
				}));

		new Setting(batchContent)
			.setName('Remove placeholder values')
			.setDesc('Clean up placeholder text like "Unknown", "N/A", "???", and malformed wikilinks')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewRemovePlaceholders();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.removePlaceholders();
				}));

		new Setting(batchContent)
			.setName('Add cr_type property to person notes')
			.setDesc('Add cr_type: person to all person notes that don\'t have it (recommended for better compatibility)')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewAddPersonType();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.addPersonType();
				}));

		// Third operation: Normalize name formatting
		new Setting(batchContent)
			.setName('Normalize name formatting')
			.setDesc('Standardize name capitalization: "JOHN SMITH" → "John Smith", handle prefixes like van, de, Mac')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewNormalizeNames();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.normalizeNames();
				}));

		// Fourth operation: Fix bidirectional relationship inconsistencies
		new Setting(batchContent)
			.setName('Fix bidirectional relationship inconsistencies')
			.setDesc('Add missing reciprocal relationship links (parent↔child, spouse↔spouse)')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewFixBidirectionalRelationships();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.fixBidirectionalRelationships();
				}));

		// Fifth operation: Validate date formats
		new Setting(batchContent)
			.setName('Validate date formats')
			.setDesc('Check all date fields (born, died, birth_date, death_date) for format issues based on your date validation preferences')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewValidateDates();
				}))
			.addButton(button => button
				.setButtonText('Apply')
				.setCta()
				.onClick(() => {
					void this.validateDates();
				}));

		// Sixth operation: Detect impossible dates
		new Setting(batchContent)
			.setName('Detect impossible dates')
			.setDesc('Find logical date errors (birth after death, unrealistic lifespans, parent-child date conflicts)')
			.addButton(button => button
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewDetectImpossibleDates();
				}));

		container.appendChild(batchCard);

		// Parent Claim Conflicts Card
		const conflictsCard = this.createCard({
			title: 'Parent claim conflicts',
			icon: 'alert-triangle',
			subtitle: 'Children claimed by multiple parents'
		});
		const conflictsContent = conflictsCard.querySelector('.crc-card__content') as HTMLElement;
		conflictsContent.createEl('p', {
			text: 'Scanning for conflicts...',
			cls: 'crc-text--muted'
		});
		container.appendChild(conflictsCard);

		// Load conflicts asynchronously
		void this.loadParentClaimConflicts(conflictsContent);

		// Statistics Card
		const statsCard = this.createCard({
			title: 'Person statistics',
			icon: 'users',
			subtitle: 'Overview of person notes in your vault'
		});

		const statsContent = statsCard.querySelector('.crc-card__content') as HTMLElement;
		statsContent.createEl('p', {
			text: 'Loading statistics...',
			cls: 'crc-text--muted'
		});

		container.appendChild(statsCard);

		// Load statistics asynchronously
		void this.loadPersonStatistics(statsContent);

		// Person List Card
		const listCard = this.createCard({
			title: 'Person notes',
			icon: 'user',
			subtitle: 'All person notes in your vault'
		});

		const listContent = listCard.querySelector('.crc-card__content') as HTMLElement;
		listContent.createEl('p', {
			text: 'Loading people...',
			cls: 'crc-text--muted'
		});

		container.appendChild(listCard);

		// Load person list asynchronously
		void this.loadPersonList(listContent);
	}

	/**
	 * Load person statistics into container
	 */
	private loadPersonStatistics(container: HTMLElement): void {
		container.empty();

		const statsService = new VaultStatsService(this.app);
		statsService.setSettings(this.plugin.settings);
		const stats = statsService.collectStats();

		// If no people, show getting started message
		if (stats.people.totalPeople === 0) {
			const emptyState = container.createDiv({ cls: 'crc-empty-state' });
			emptyState.createEl('p', {
				text: 'No person notes found in your vault.',
				cls: 'crc-text--muted'
			});
			emptyState.createEl('p', {
				text: 'Person notes require a cr_id property in their frontmatter. Create person notes to start building your family tree.',
				cls: 'crc-text--muted crc-text--small'
			});
			return;
		}

		// Overview statistics grid
		const statsGrid = container.createDiv({ cls: 'crc-stats-grid' });

		// Total people
		this.createStatItem(statsGrid, 'Total people', stats.people.totalPeople.toString(), 'users');

		// With birth date
		const birthPercent = stats.people.totalPeople > 0
			? Math.round((stats.people.peopleWithBirthDate / stats.people.totalPeople) * 100)
			: 0;
		this.createStatItem(statsGrid, 'With birth date', `${stats.people.peopleWithBirthDate} (${birthPercent}%)`, 'calendar');

		// Living people
		this.createStatItem(statsGrid, 'Living', stats.people.livingPeople.toString(), 'heart');

		// Orphaned (no relationships)
		this.createStatItem(statsGrid, 'No relationships', stats.people.orphanedPeople.toString(), 'user-minus');

		// Relationship statistics section
		const relSection = container.createDiv({ cls: 'crc-mt-4' });
		relSection.createEl('h4', { text: 'Relationships', cls: 'crc-section-title' });

		const relGrid = relSection.createDiv({ cls: 'crc-stats-grid crc-stats-grid--compact' });

		// With father
		const fatherPercent = stats.people.totalPeople > 0
			? Math.round((stats.people.peopleWithFather / stats.people.totalPeople) * 100)
			: 0;
		this.createStatItem(relGrid, 'With father', `${stats.people.peopleWithFather} (${fatherPercent}%)`);

		// With mother
		const motherPercent = stats.people.totalPeople > 0
			? Math.round((stats.people.peopleWithMother / stats.people.totalPeople) * 100)
			: 0;
		this.createStatItem(relGrid, 'With mother', `${stats.people.peopleWithMother} (${motherPercent}%)`);

		// With spouse
		const spousePercent = stats.people.totalPeople > 0
			? Math.round((stats.people.peopleWithSpouse / stats.people.totalPeople) * 100)
			: 0;
		this.createStatItem(relGrid, `With ${getSpouseLabel(this.plugin.settings, { lowercase: true })}`, `${stats.people.peopleWithSpouse} (${spousePercent}%)`);

		// Total relationships
		this.createStatItem(relGrid, 'Total relationships', stats.relationships.totalRelationships.toString());

		// View full statistics link
		const statsLink = container.createDiv({ cls: 'cr-stats-link' });
		const link = statsLink.createEl('a', { text: 'View full statistics →', cls: 'crc-text-muted' });
		link.addEventListener('click', (e) => {
			e.preventDefault();
			this.close();
			void this.plugin.activateStatisticsView();
		});
	}

	/**
	 * Load parent claim conflicts into container
	 */
	private loadParentClaimConflicts(container: HTMLElement): void {
		container.empty();

		// Create services
		const folderFilter = new FolderFilterService(this.plugin.settings);
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();

		const dataQuality = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph,
			folderFilter,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQuality.setPersonIndex(this.plugin.personIndex);
		}

		// Detect conflicts
		const inconsistencies = dataQuality.detectBidirectionalInconsistencies();
		const conflicts = inconsistencies.filter(i => i.type === 'conflicting-parent-claim');

		if (conflicts.length === 0) {
			const emptyState = container.createDiv({ cls: 'crc-empty-state' });
			emptyState.createEl('p', {
				text: 'No parent claim conflicts found.',
				cls: 'crc-text--muted'
			});
			emptyState.createEl('p', {
				text: 'Conflicts occur when multiple people list the same child in their children_id field.',
				cls: 'crc-text--muted crc-text--small'
			});
			return;
		}

		// Explanation
		const explanation = container.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		explanation.createEl('p', {
			text: `Found ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} where multiple people claim the same child. Review each and choose which parent is correct.`,
			cls: 'crc-text--small'
		});

		// Create table
		const tableContainer = container.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table crc-conflicts-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Child' });
		headerRow.createEl('th', { text: 'Type' });
		headerRow.createEl('th', { text: 'Claimant 1' });
		headerRow.createEl('th', { text: 'Claimant 2' });
		headerRow.createEl('th', { text: 'Actions' });

		const tbody = table.createEl('tbody');

		for (const conflict of conflicts) {
			const child = conflict.relatedPerson;
			const claimant1 = conflict.person;  // Current parent in child's father_id/mother_id
			const claimant2 = conflict.conflictingPerson;  // Other claimant

			if (!claimant2) continue;

			const row = tbody.createEl('tr');

			// Child cell (clickable)
			const childCell = row.createEl('td');
			const childLink = childCell.createEl('a', {
				text: child.name || child.file.basename,
				cls: 'crc-person-link'
			});
			childLink.addEventListener('click', (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(child.file.path, '', false);
			});
			childLink.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				this.showPersonLinkContextMenu(child.file, e);
			});

			// Conflict type
			row.createEl('td', { text: conflict.conflictType === 'father' ? 'Father' : 'Mother' });

			// Claimant 1 cell - show name and cr_id for disambiguation
			const claimant1Cell = row.createEl('td');
			const claimant1Link = claimant1Cell.createEl('a', {
				text: claimant1.name || claimant1.file.basename,
				cls: 'crc-person-link'
			});
			claimant1Link.addEventListener('click', (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(claimant1.file.path, '', false);
			});
			claimant1Link.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				this.showPersonLinkContextMenu(claimant1.file, e);
			});
			claimant1Cell.createEl('span', {
				text: ` (${claimant1.crId})`,
				cls: 'crc-text--muted crc-text--small'
			});

			// Claimant 2 cell - show name and cr_id for disambiguation
			const claimant2Cell = row.createEl('td');
			const claimant2Link = claimant2Cell.createEl('a', {
				text: claimant2.name || claimant2.file.basename,
				cls: 'crc-person-link'
			});
			claimant2Link.addEventListener('click', (e) => {
				e.preventDefault();
				void this.app.workspace.openLinkText(claimant2.file.path, '', false);
			});
			claimant2Link.addEventListener('contextmenu', (e) => {
				e.preventDefault();
				this.showPersonLinkContextMenu(claimant2.file, e);
			});
			claimant2Cell.createEl('span', {
				text: ` (${claimant2.crId})`,
				cls: 'crc-text--muted crc-text--small'
			});

			// Actions cell
			const actionsCell = row.createEl('td', { cls: 'crc-conflict-actions' });

			// Keep Claimant 1 button
			const keepBtn1 = actionsCell.createEl('button', {
				text: 'Keep 1',
				cls: 'crc-btn-small',
				attr: { title: `Keep ${claimant1.name || claimant1.file.basename} as ${conflict.conflictType}` }
			});
			keepBtn1.addEventListener('click', () => {
				void (async () => {
					await this.resolveParentConflict(child, claimant1, claimant2, conflict.conflictType!, 'keep1');
					row.remove();
					this.updateConflictCardCount(container, tbody);
				})();
			});

			// Keep Claimant 2 button
			const keepBtn2 = actionsCell.createEl('button', {
				text: 'Keep 2',
				cls: 'crc-btn-small',
				attr: { title: `Keep ${claimant2.name || claimant2.file.basename} as ${conflict.conflictType}` }
			});
			keepBtn2.addEventListener('click', () => {
				void (async () => {
					await this.resolveParentConflict(child, claimant1, claimant2, conflict.conflictType!, 'keep2');
					row.remove();
					this.updateConflictCardCount(container, tbody);
				})();
			});
		}

		// Count display
		const countDiv = container.createDiv({ cls: 'crc-conflicts-count crc-mt-2' });
		countDiv.createSpan({
			text: `${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} to resolve`,
			cls: 'crc-text--muted'
		});
	}

	/**
	 * Resolve a parent claim conflict
	 */
	private async resolveParentConflict(
		child: PersonNode,
		claimant1: PersonNode,
		claimant2: PersonNode,
		conflictType: 'father' | 'mother',
		resolution: 'keep1' | 'keep2'
	): Promise<void> {
		const parentField = conflictType === 'father' ? 'father_id' : 'mother_id';
		const parentWikilinkField = conflictType === 'father' ? 'father' : 'mother';

		// Suspend linker during changes
		this.plugin.bidirectionalLinker?.suspend();

		try {
			if (resolution === 'keep1') {
				// Keep claimant1: remove child from claimant2's children_id
				await this.removeChildFromParent(claimant2.file, child.crId);
				new Notice(`Removed ${child.name || child.file.basename} from ${claimant2.name || claimant2.file.basename}'s children`);
			} else {
				// Keep claimant2: update child's parent field and remove from claimant1's children_id
				await this.app.fileManager.processFrontMatter(child.file, (fm) => {
					fm[parentField] = claimant2.crId;
					fm[parentWikilinkField] = `[[${claimant2.name || claimant2.file.basename}]]`;
				});
				await this.removeChildFromParent(claimant1.file, child.crId);
				new Notice(`Changed ${child.name || child.file.basename}'s ${conflictType} to ${claimant2.name || claimant2.file.basename}`);
			}

			// Reload cache
			const familyGraph = this.plugin.createFamilyGraphService();
			await familyGraph.reloadCache();
		} finally {
			// Resume linker after a short delay
			setTimeout(() => {
				this.plugin.bidirectionalLinker?.resume();
			}, 500);
		}
	}

	/**
	 * Remove a child from a parent's children_id array
	 */
	private async removeChildFromParent(parentFile: TFile, childCrId: string): Promise<void> {
		await this.app.fileManager.processFrontMatter(parentFile, (fm) => {
			if (fm.children_id) {
				if (Array.isArray(fm.children_id)) {
					fm.children_id = fm.children_id.filter((id: string) => id !== childCrId);
					if (fm.children_id.length === 0) {
						delete fm.children_id;
					}
				} else if (fm.children_id === childCrId) {
					delete fm.children_id;
				}
			}
		});
	}

	/**
	 * Update conflict card count after resolving one
	 */
	private updateConflictCardCount(container: HTMLElement, tbody: HTMLElement): void {
		const remainingRows = tbody.querySelectorAll('tr').length;
		const countEl = container.querySelector('.crc-conflicts-count span');

		if (remainingRows === 0) {
			// All conflicts resolved - show empty state
			container.empty();
			const emptyState = container.createDiv({ cls: 'crc-empty-state' });
			emptyState.createEl('p', {
				text: 'All parent claim conflicts have been resolved!',
				cls: 'crc-text--muted'
			});
		} else if (countEl) {
			countEl.textContent = `${remainingRows} conflict${remainingRows === 1 ? '' : 's'} to resolve`;
		}
	}

	/**
	 * Person list item for display (includes place info for action buttons)
	 */
	private personListItems: {
		crId: string;
		name: string;
		birthDate?: string;
		deathDate?: string;
		birthPlace?: PlaceInfo;
		deathPlace?: PlaceInfo;
		burialPlace?: PlaceInfo;
		file: TFile;
		mediaCount: number;
	}[] = [];

	/**
	 * Load person list into container
	 */
	/** Current person list filter */
	private personListFilter: 'all' | 'has-dates' | 'missing-dates' | 'unlinked-places' | 'living' = 'all';

	/** Current person list sort */
	private personListSort: 'name-asc' | 'name-desc' | 'birth-asc' | 'birth-desc' | 'death-asc' | 'death-desc' = 'name-asc';

	private loadPersonList(container: HTMLElement): void {
		container.empty();

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		if (people.length === 0) {
			container.createEl('p', {
				text: 'No person notes found. Create person notes with a cr_id in frontmatter.',
				cls: 'crc-text--muted'
			});
			return;
		}

		// Map to display format with place info
		this.personListItems = people.map(p => {
			// Get place info from frontmatter (need raw values for isLinked detection)
			const cache = this.app.metadataCache.getFileCache(p.file);
			const fm = cache?.frontmatter || {};

			return {
				crId: p.crId,
				name: p.name,
				birthDate: p.birthDate,
				deathDate: p.deathDate,
				birthPlace: extractPlaceInfo(fm.birth_place),
				deathPlace: extractPlaceInfo(fm.death_place),
				burialPlace: extractPlaceInfo(fm.burial_place),
				file: p.file,
				mediaCount: p.media?.length || 0
			};
		});

		// Create controls row (filter + sort + search)
		const controlsRow = container.createDiv({ cls: 'crc-person-controls' });

		// Filter dropdown
		const filterSelect = controlsRow.createEl('select', {
			cls: 'dropdown'
		});
		const filterOptions = [
			{ value: 'all', label: 'All people' },
			{ value: 'has-dates', label: 'Has dates' },
			{ value: 'missing-dates', label: 'Missing dates' },
			{ value: 'unlinked-places', label: 'Unlinked places' },
			{ value: 'living', label: 'Living (no death)' }
		];
		filterOptions.forEach(opt => {
			const option = filterSelect.createEl('option', { text: opt.label, value: opt.value });
			if (opt.value === this.personListFilter) option.selected = true;
		});

		// Sort dropdown
		const sortSelect = controlsRow.createEl('select', {
			cls: 'dropdown'
		});
		const sortOptions = [
			{ value: 'name-asc', label: 'Name (A–Z)' },
			{ value: 'name-desc', label: 'Name (Z–A)' },
			{ value: 'birth-asc', label: 'Birth (oldest)' },
			{ value: 'birth-desc', label: 'Birth (newest)' },
			{ value: 'death-asc', label: 'Death (oldest)' },
			{ value: 'death-desc', label: 'Death (newest)' }
		];
		sortOptions.forEach(opt => {
			const option = sortSelect.createEl('option', { text: opt.label, value: opt.value });
			if (opt.value === this.personListSort) option.selected = true;
		});

		// Search input
		const searchInput = controlsRow.createEl('input', {
			cls: 'crc-filter-input',
			attr: {
				type: 'text',
				placeholder: `Search ${this.personListItems.length} people...`
			}
		});

		// Usage hint
		const hint = container.createEl('p', {
			cls: 'crc-text-muted crc-text-small crc-mb-2'
		});
		hint.appendText('Click a row to edit. ');
		// File icon for "open note"
		const fileIconHint = createLucideIcon('file-text', 12);
		fileIconHint.addClass('crc-icon-inline');
		hint.appendChild(fileIconHint);
		hint.appendText(' opens the note. ');
		// Unlinked places badge
		const exampleBadge = hint.createEl('span', {
			cls: 'crc-person-list-badge crc-person-list-badge--unlinked crc-person-list-badge--hint'
		});
		const badgeIcon = createLucideIcon('map-pin', 10);
		exampleBadge.appendChild(badgeIcon);
		exampleBadge.appendText('1');
		hint.appendText(' creates place notes.');

		// List container
		const listContainer = container.createDiv({ cls: 'crc-person-list' });

		// Helper to check if person has unlinked places
		const hasUnlinkedPlaces = (p: typeof this.personListItems[0]): boolean => {
			return (p.birthPlace && !p.birthPlace.isLinked) ||
				(p.deathPlace && !p.deathPlace.isLinked) ||
				(p.burialPlace && !p.burialPlace.isLinked) || false;
		};

		// Apply filter, sort, and render
		const applyFiltersAndRender = () => {
			const query = searchInput.value.toLowerCase();

			// Filter by search query
			let filtered = this.personListItems.filter(p =>
				p.name.toLowerCase().includes(query) ||
				(p.birthDate && p.birthDate.includes(query)) ||
				(p.deathDate && p.deathDate.includes(query))
			);

			// Apply category filter
			switch (this.personListFilter) {
				case 'has-dates':
					filtered = filtered.filter(p => p.birthDate || p.deathDate);
					break;
				case 'missing-dates':
					filtered = filtered.filter(p => !p.birthDate && !p.deathDate);
					break;
				case 'unlinked-places':
					filtered = filtered.filter(hasUnlinkedPlaces);
					break;
				case 'living':
					filtered = filtered.filter(p => p.birthDate && !p.deathDate);
					break;
			}

			// Apply sort
			filtered.sort((a, b) => {
				switch (this.personListSort) {
					case 'name-asc':
						return a.name.localeCompare(b.name);
					case 'name-desc':
						return b.name.localeCompare(a.name);
					case 'birth-asc':
						return (a.birthDate || '9999').localeCompare(b.birthDate || '9999');
					case 'birth-desc':
						return (b.birthDate || '0000').localeCompare(a.birthDate || '0000');
					case 'death-asc':
						return (a.deathDate || '9999').localeCompare(b.deathDate || '9999');
					case 'death-desc':
						return (b.deathDate || '0000').localeCompare(a.deathDate || '0000');
					default:
						return 0;
				}
			});

			this.renderPersonListItems(listContainer, filtered);
		};

		// Event handlers
		searchInput.addEventListener('input', applyFiltersAndRender);

		filterSelect.addEventListener('change', () => {
			this.personListFilter = filterSelect.value as typeof this.personListFilter;
			applyFiltersAndRender();
		});

		sortSelect.addEventListener('change', () => {
			this.personListSort = sortSelect.value as typeof this.personListSort;
			applyFiltersAndRender();
		});

		// Initial render
		applyFiltersAndRender();
	}

	/** Maximum people to render initially (for performance) */
	private static readonly PERSON_LIST_PAGE_SIZE = 100;

	/**
	 * Render person list items as a table with pagination
	 */
	private renderPersonListItems(
		container: HTMLElement,
		people: {
			crId: string;
			name: string;
			birthDate?: string;
			deathDate?: string;
			birthPlace?: PlaceInfo;
			deathPlace?: PlaceInfo;
			burialPlace?: PlaceInfo;
			file: TFile;
			mediaCount: number;
		}[]
	): void {
		container.empty();

		if (people.length === 0) {
			container.createEl('p', {
				text: 'No matching people found.',
				cls: 'crc-text--muted'
			});
			return;
		}

		// For large lists, show count and paginate
		const totalCount = people.length;
		const needsPagination = totalCount > ControlCenterModal.PERSON_LIST_PAGE_SIZE;
		let renderedCount = 0;

		// Create table structure
		const table = container.createEl('table', { cls: 'crc-person-table' });
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Name', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: 'Born', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: 'Died', cls: 'crc-person-table__th' });
		headerRow.createEl('th', { text: 'Media', cls: 'crc-person-table__th crc-person-table__th--center' });
		headerRow.createEl('th', { text: '', cls: 'crc-person-table__th crc-person-table__th--icon' }); // For badges

		const tbody = table.createEl('tbody');

		const renderBatch = (startFrom: number, limit: number): number => {
			let rendered = 0;
			for (let i = startFrom; i < people.length && rendered < limit; i++) {
				this.renderPersonTableRow(tbody, people[i]);
				rendered++;
			}
			return rendered;
		};

		// Initial render
		renderedCount = renderBatch(0, ControlCenterModal.PERSON_LIST_PAGE_SIZE);

		// Show "Load more" button if needed
		if (needsPagination && renderedCount < totalCount) {
			const loadMoreContainer = container.createDiv({ cls: 'crc-load-more-container' });
			const loadMoreBtn = loadMoreContainer.createEl('button', {
				cls: 'crc-btn crc-btn--secondary',
				text: `Load more (${renderedCount} of ${totalCount} shown)`
			});

			loadMoreBtn.addEventListener('click', () => {
				const newRendered = renderBatch(renderedCount, ControlCenterModal.PERSON_LIST_PAGE_SIZE);
				renderedCount += newRendered;

				if (renderedCount >= totalCount) {
					loadMoreContainer.remove();
				} else {
					loadMoreBtn.setText(`Load more (${renderedCount} of ${totalCount} shown)`);
				}
			});
		}
	}

	/**
	 * Render a single person as a table row
	 */
	private renderPersonTableRow(
		tbody: HTMLElement,
		person: {
			crId: string;
			name: string;
			birthDate?: string;
			deathDate?: string;
			birthPlace?: PlaceInfo;
			deathPlace?: PlaceInfo;
			burialPlace?: PlaceInfo;
			file: TFile;
			mediaCount: number;
		}
	): void {
		const row = tbody.createEl('tr', { cls: 'crc-person-table__row' });

		// Name cell
		row.createEl('td', {
			text: person.name,
			cls: 'crc-person-table__td crc-person-table__td--name'
		});

		// Birth date cell
		row.createEl('td', {
			text: person.birthDate ? formatDisplayDate(person.birthDate) : '—',
			cls: 'crc-person-table__td crc-person-table__td--date'
		});

		// Death date cell
		row.createEl('td', {
			text: person.deathDate ? formatDisplayDate(person.deathDate) : '—',
			cls: 'crc-person-table__td crc-person-table__td--date'
		});

		// Media count cell
		const mediaCell = row.createEl('td', {
			cls: 'crc-person-table__td crc-person-table__td--media'
		});
		if (person.mediaCount > 0) {
			const mediaBadge = mediaCell.createEl('span', {
				cls: 'crc-person-list-badge crc-person-list-badge--media',
				attr: { title: `${person.mediaCount} media file${person.mediaCount !== 1 ? 's' : ''}` }
			});
			const mediaIcon = createLucideIcon('image', 12);
			mediaBadge.appendChild(mediaIcon);
			mediaBadge.appendText(person.mediaCount.toString());

			// Click to open manage media modal
			mediaBadge.addEventListener('click', (e) => {
				e.stopPropagation();
				this.plugin.openManageMediaModal(person.file, 'person', person.name);
			});
		} else {
			mediaCell.createEl('span', { text: '—', cls: 'crc-text-muted' });
		}

		// Actions cell (timeline badge + unlinked places badge + open note button)
		const actionsCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--actions' });

		// Timeline badge
		const eventService = this.plugin.getEventService();
		if (eventService) {
			const personLink = `[[${person.file.basename}]]`;
			const events = eventService.getEventsForPerson(personLink);

			if (events.length > 0) {
				const summary = createTimelineSummary(events);
				const timelineBadge = actionsCell.createEl('span', {
					cls: 'crc-person-list-badge crc-person-list-badge--timeline',
					attr: {
						title: summary.dateRange
							? `${summary.count} events (${summary.dateRange})`
							: `${summary.count} events`
					}
				});
				const calendarIcon = createLucideIcon('calendar', 12);
				timelineBadge.appendChild(calendarIcon);
				timelineBadge.appendText(summary.count.toString());

				// Click to show timeline in modal
				timelineBadge.addEventListener('click', (e) => {
					e.stopPropagation();
					this.showPersonTimelineModal(person.file, person.name, eventService);
				});
			}
		}

		// Check for unlinked places
		const unlinkedPlaces: { type: string; info: PlaceInfo }[] = [];
		if (person.birthPlace && !person.birthPlace.isLinked) {
			unlinkedPlaces.push({ type: 'Birth', info: person.birthPlace });
		}
		if (person.deathPlace && !person.deathPlace.isLinked) {
			unlinkedPlaces.push({ type: 'Death', info: person.deathPlace });
		}
		if (person.burialPlace && !person.burialPlace.isLinked) {
			unlinkedPlaces.push({ type: 'Burial', info: person.burialPlace });
		}

		if (unlinkedPlaces.length > 0) {
			const badge = actionsCell.createEl('span', {
				cls: 'crc-person-list-badge crc-person-list-badge--unlinked',
				attr: {
					title: `${unlinkedPlaces.length} unlinked place${unlinkedPlaces.length !== 1 ? 's' : ''}: ${unlinkedPlaces.map(p => p.info.placeName).join(', ')}`
				}
			});
			const mapIcon = createLucideIcon('map-pin', 12);
			badge.appendChild(mapIcon);
			badge.appendText(unlinkedPlaces.length.toString());

			// Click to show place creation options
			badge.addEventListener('click', (e) => {
				e.stopPropagation();
				this.showUnlinkedPlacesMenu(unlinkedPlaces, e);
			});
		}

		// Research coverage badge (when fact-level source tracking is enabled)
		if (this.plugin.settings.trackFactSourcing) {
			const evidenceService = new EvidenceService(this.app, this.plugin.settings);
			const coverage = evidenceService.getFactCoverageForFile(person.file);

			if (coverage && coverage.totalFactCount > 0) {
				// Determine badge class based on coverage percent
				let badgeClass = 'crc-person-list-badge';
				if (coverage.coveragePercent >= 75) {
					badgeClass += ' crc-person-list-badge--coverage-high';
				} else if (coverage.coveragePercent >= 50) {
					badgeClass += ' crc-person-list-badge--coverage-medium';
				} else {
					badgeClass += ' crc-person-list-badge--coverage-low';
				}

				const coverageBadge = actionsCell.createEl('span', {
					cls: badgeClass,
					attr: {
						title: `Research coverage: ${coverage.coveragePercent}% (${coverage.sourcedFactCount}/${coverage.totalFactCount} facts sourced)`
					}
				});
				const bookIcon = createLucideIcon('book-open', 12);
				coverageBadge.appendChild(bookIcon);
				coverageBadge.appendText(`${coverage.coveragePercent}%`);
			}
		}

		// Open note button
		const openBtn = actionsCell.createEl('button', {
			cls: 'crc-person-table__open-btn clickable-icon',
			attr: { 'aria-label': 'Open note' }
		});
		const fileIcon = createLucideIcon('file-text', 14);
		openBtn.appendChild(fileIcon);
		openBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void (async () => {
				await this.plugin.trackRecentFile(person.file, 'person');
				void this.app.workspace.getLeaf(false).openFile(person.file);
			})();
		});

		// Click row to open edit modal
		row.addEventListener('click', () => {
			// Get full person data from frontmatter for edit modal
			const cache = this.app.metadataCache.getFileCache(person.file);
			const fm = cache?.frontmatter || {};

			// Extract relationship data
			const fatherId = fm.father_id || fm.father;
			const motherId = fm.mother_id || fm.mother;
			const spouseIds = fm.spouse_id || fm.spouse;
			const childIds = fm.children_id || fm.child;
			const parentIds = fm.parents_id;

			// Extract child names from wikilinks
			const extractName = (value: unknown): string | undefined => {
				if (!value || typeof value !== 'string') return undefined;
				const match = value.match(/\[\[([^\]]+)\]\]/);
				return match ? match[1] : value;
			};
			let childNames: string[] | undefined;
			if (fm.child) {
				const children = Array.isArray(fm.child) ? fm.child : [fm.child];
				childNames = children.map(c => extractName(String(c))).filter((n): n is string => !!n);
			}

			// Extract source IDs and names
			const sourceIds = fm.sources_id;
			let sourceNames: string[] | undefined;
			if (fm.sources) {
				const sources = Array.isArray(fm.sources) ? fm.sources : [fm.sources];
				sourceNames = sources.map(s => extractName(String(s))).filter((n): n is string => !!n);
			}

			// Extract gender-neutral parent names
			let parentNames: string[] | undefined;
			if (fm.parents) {
				const parents = Array.isArray(fm.parents) ? fm.parents : [fm.parents];
				parentNames = parents.map(p => extractName(String(p))).filter((n): n is string => !!n);
			}

			// Use cached graph services and universes to avoid expensive recomputation on every click
			const familyGraph = this.getCachedFamilyGraph();
			const placeGraph = this.getCachedPlaceGraph();
			const allUniverses = this.getCachedUniverses();

			const modal = new CreatePersonModal(this.app, {
				editFile: person.file,
				editPersonData: {
					crId: person.crId,
					name: person.name,
					personType: fm.personType,
					sex: fm.sex,
					gender: fm.gender,
					pronouns: fm.pronouns,
					// Name components (#174, #192)
					givenName: fm.given_name,
					surnames: Array.isArray(fm.surnames) ? fm.surnames : (fm.surnames ? [fm.surnames] : undefined),
					maidenName: fm.maiden_name,
					marriedNames: Array.isArray(fm.married_names) ? fm.married_names : (fm.married_names ? [fm.married_names] : undefined),
					// Other
					cr_living: typeof fm.cr_living === 'boolean' ? fm.cr_living : (fm.cr_living === 'true' ? true : (fm.cr_living === 'false' ? false : undefined)),
					born: person.birthDate,
					died: person.deathDate,
					birthPlace: person.birthPlace?.placeName,
					deathPlace: person.deathPlace?.placeName,
					birthPlaceId: fm.birth_place_id,
					birthPlaceName: person.birthPlace?.placeName,
					deathPlaceId: fm.death_place_id,
					deathPlaceName: person.deathPlace?.placeName,
					occupation: fm.occupation,
					fatherId: typeof fatherId === 'string' ? fatherId : undefined,
					motherId: typeof motherId === 'string' ? motherId : undefined,
					spouseIds: Array.isArray(spouseIds) ? spouseIds : (spouseIds ? [spouseIds] : undefined),
					childIds: Array.isArray(childIds) ? childIds : (childIds ? [childIds] : undefined),
					childNames: childNames,
					sourceIds: Array.isArray(sourceIds) ? sourceIds : (sourceIds ? [sourceIds] : undefined),
					sourceNames: sourceNames,
					parentIds: Array.isArray(parentIds) ? parentIds : (parentIds ? [parentIds] : undefined),
					parentNames: parentNames,
					collection: fm.collection,
					universe: fm.universe,
					// DNA tracking fields
					dnaSharedCm: typeof fm.dna_shared_cm === 'number' ? fm.dna_shared_cm : undefined,
					dnaTestingCompany: fm.dna_testing_company,
					dnaKitId: fm.dna_kit_id,
					dnaMatchType: fm.dna_match_type,
					dnaEndogamyFlag: typeof fm.dna_endogamy_flag === 'boolean' ? fm.dna_endogamy_flag : undefined,
					dnaNotes: fm.dna_notes
				},
				familyGraph,
				placeGraph,
				settings: this.plugin.settings,
				propertyAliases: this.plugin.settings.propertyAliases,
				existingUniverses: allUniverses,
				plugin: this.plugin,
				onUpdated: () => {
					// Refresh the People tab and invalidate caches since data changed
					this.invalidateCaches();
					this.showTab('people');
				}
			});
			modal.open();
		});

		// Context menu for row
		row.addEventListener('contextmenu', (e) => {
			e.preventDefault();
			this.showPersonContextMenu(person, e);
		});
	}

	/**
	 * Show menu for creating unlinked place notes
	 */
	private showUnlinkedPlacesMenu(
		unlinkedPlaces: { type: string; info: PlaceInfo }[],
		event: MouseEvent
	): void {
		const menu = new Menu();

		for (const { type, info } of unlinkedPlaces) {
			menu.addItem((item) => {
				item
					.setTitle(`Create "${info.placeName}" (${type.toLowerCase()})`)
					.setIcon('map-pin')
					.onClick(() => {
						void this.showQuickCreatePlaceModal(info.placeName);
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	/**
	 * Show context menu for a person list item
	 */
	private showPersonContextMenu(
		person: {
			crId: string;
			name: string;
			birthDate?: string;
			deathDate?: string;
			birthPlace?: PlaceInfo;
			deathPlace?: PlaceInfo;
			burialPlace?: PlaceInfo;
			file: TFile;
		},
		event: MouseEvent
	): void {
		const menu = new Menu();
		const useSubmenu = Platform.isDesktop && !Platform.isMobile;

		// Open actions
		menu.addItem((item) => {
			item
				.setTitle('Open note')
				.setIcon('file')
				.onClick(async () => {
					await this.plugin.trackRecentFile(person.file, 'person');
					void this.app.workspace.getLeaf(false).openFile(person.file);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(async () => {
					await this.plugin.trackRecentFile(person.file, 'person');
					void this.app.workspace.getLeaf('tab').openFile(person.file);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Show in Family Chart')
				.setIcon('git-fork')
				.onClick(() => {
					this.close();
					void this.plugin.activateFamilyChartView(person.crId);
				});
		});

		menu.addSeparator();

		// Events actions - submenu on desktop, flat on mobile
		if (useSubmenu) {
			menu.addItem((item) => {
				item
					.setTitle('Events')
					.setIcon('calendar');
				const submenu = item.setSubmenu();

				submenu.addItem((subitem) => {
					subitem
						.setTitle('Create event for this person')
						.setIcon('calendar-plus')
						.onClick(() => {
							const eventService = this.plugin.getEventService();
							if (eventService) {
								new CreateEventModal(
									this.app,
									eventService,
									this.plugin.settings,
									{
										initialPerson: { name: person.name, crId: person.crId }
									}
								).open();
							}
						});
				});

				submenu.addItem((subitem) => {
					subitem
						.setTitle('Export timeline to Canvas')
						.setIcon('layout')
						.onClick(() => {
							void this.exportPersonTimeline(person, 'canvas');
						});
				});

				submenu.addItem((subitem) => {
					subitem
						.setTitle('Export timeline to Excalidraw')
						.setIcon('edit')
						.onClick(() => {
							void this.exportPersonTimeline(person, 'excalidraw');
						});
				});
			});
		} else {
			// Mobile: flat menu with descriptive titles
			menu.addItem((item) => {
				item
					.setTitle('Create event for this person')
					.setIcon('calendar-plus')
					.onClick(() => {
						const eventService = this.plugin.getEventService();
						if (eventService) {
							new CreateEventModal(
								this.app,
								eventService,
								this.plugin.settings,
								{
									initialPerson: { name: person.name, crId: person.crId }
								}
							).open();
						}
					});
			});

			menu.addItem((item) => {
				item
					.setTitle('Export timeline to Canvas')
					.setIcon('layout')
					.onClick(() => {
						void this.exportPersonTimeline(person, 'canvas');
					});
			});

			menu.addItem((item) => {
				item
					.setTitle('Export timeline to Excalidraw')
					.setIcon('edit')
					.onClick(() => {
						void this.exportPersonTimeline(person, 'excalidraw');
					});
			});
		}

		// Media actions - submenu on desktop, flat on mobile
		if (useSubmenu) {
			menu.addItem((item) => {
				item
					.setTitle('Media')
					.setIcon('image');
				const submenu = item.setSubmenu();

				submenu.addItem((subitem) => {
					subitem
						.setTitle('Link media...')
						.setIcon('image-plus')
						.onClick(() => {
							this.plugin.openLinkMediaModal(person.file, 'person', person.name);
						});
				});

				submenu.addItem((subitem) => {
					subitem
						.setTitle('Manage media...')
						.setIcon('images')
						.onClick(() => {
							this.plugin.openManageMediaModal(person.file, 'person', person.name);
						});
				});
			});
		} else {
			// Mobile: flat menu with descriptive titles
			menu.addItem((item) => {
				item
					.setTitle('Link media...')
					.setIcon('image-plus')
					.onClick(() => {
						this.plugin.openLinkMediaModal(person.file, 'person', person.name);
					});
			});

			menu.addItem((item) => {
				item
					.setTitle('Manage media...')
					.setIcon('images')
					.onClick(() => {
						this.plugin.openManageMediaModal(person.file, 'person', person.name);
					});
			});
		}

		menu.showAtMouseEvent(event);
	}

	/**
	 * Show a simple context menu for person links with open options
	 */
	private showPersonLinkContextMenu(file: TFile, event: MouseEvent): void {
		const menu = new Menu();

		menu.addItem((item) => {
			item
				.setTitle('Open')
				.setIcon('file')
				.onClick(async () => {
					await this.plugin.trackRecentFile(file, 'person');
					void this.app.workspace.getLeaf(false).openFile(file);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Open in new tab')
				.setIcon('file-plus')
				.onClick(async () => {
					await this.plugin.trackRecentFile(file, 'person');
					void this.app.workspace.getLeaf('tab').openFile(file);
				});
		});

		menu.addItem((item) => {
			item
				.setTitle('Open in new window')
				.setIcon('external-link')
				.onClick(async () => {
					await this.plugin.trackRecentFile(file, 'person');
					void this.app.workspace.getLeaf('window').openFile(file);
				});
		});

		menu.showAtMouseEvent(event);
	}

	/**
	 * Export a person's timeline to Canvas or Excalidraw
	 */
	private async exportPersonTimeline(
		person: {
			crId: string;
			name: string;
			file: TFile;
		},
		format: 'canvas' | 'excalidraw' = 'canvas'
	): Promise<void> {
		const eventService = this.plugin.getEventService();
		if (!eventService) {
			new Notice('Event service not available');
			return;
		}

		const allEvents = eventService.getAllEvents();
		const personLink = `[[${person.name}]]`;

		// Filter events for this person
		const personEvents = allEvents.filter(e => {
			if (e.person) {
				const normalizedPerson = e.person.replace(/^\[\[/, '').replace(/\]\]$/, '').toLowerCase();
				return normalizedPerson === person.name.toLowerCase();
			}
			return false;
		});

		if (personEvents.length === 0) {
			new Notice(`No events found for ${person.name}`);
			return;
		}

		try {
			const { TimelineCanvasExporter } = await import('../events/services/timeline-canvas-exporter');
			const exporter = new TimelineCanvasExporter(this.app, this.plugin.settings);

			const result = await exporter.exportToCanvas(allEvents, {
				title: `${person.name} Timeline`,
				filterPerson: personLink,
				layoutStyle: 'horizontal',
				colorScheme: 'event_type',
				includeOrderingEdges: true
			});

			if (result.success && result.path) {
				if (format === 'excalidraw') {
					// Convert to Excalidraw
					const { ExcalidrawExporter } = await import('../excalidraw/excalidraw-exporter');
					const excalidrawExporter = new ExcalidrawExporter(this.app);

					const canvasFile = this.app.vault.getAbstractFileByPath(result.path);
					if (!(canvasFile instanceof TFile)) {
						throw new Error('Canvas file not found after export');
					}

					const excalidrawResult = await excalidrawExporter.exportToExcalidraw({
						canvasFile,
						fileName: result.path.replace('.canvas', '').split('/').pop(),
						preserveColors: true
					});

					if (excalidrawResult.success && excalidrawResult.excalidrawContent) {
						const excalidrawPath = result.path.replace('.canvas', '.excalidraw.md');
						await this.app.vault.create(excalidrawPath, excalidrawResult.excalidrawContent);
						new Notice(`Timeline exported to ${excalidrawPath}`);
						const file = this.app.vault.getAbstractFileByPath(excalidrawPath);
						if (file instanceof TFile) {
							void this.app.workspace.getLeaf(false).openFile(file);
						}
					} else {
						new Notice(`Excalidraw export failed: ${excalidrawResult.errors?.join(', ') || 'Unknown error'}`);
					}
				} else {
					new Notice(`Timeline exported to ${result.path}`);
					const file = this.app.vault.getAbstractFileByPath(result.path);
					if (file instanceof TFile) {
						void this.app.workspace.getLeaf(false).openFile(file);
					}
				}
			} else {
				new Notice(`Export failed: ${result.error || 'Unknown error'}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			new Notice(`Export failed: ${message}`);
		}
	}

	/**
	 * Render a timeline badge for a person list item
	 */
	private renderPersonTimelineBadge(
		item: HTMLElement,
		mainRow: HTMLElement,
		file: TFile,
		personName: string
	): void {
		const eventService = this.plugin.getEventService();
		if (!eventService) return;

		// Get events for this person
		const personLink = `[[${file.basename}]]`;
		const events = eventService.getEventsForPerson(personLink);

		// Don't show badge if no events
		if (events.length === 0) return;

		// Get summary info
		const summary = createTimelineSummary(events);

		// Create badge
		const badge = mainRow.createEl('span', {
			cls: 'crc-person-list-badge crc-person-list-badge--timeline',
			attr: {
				title: summary.dateRange
					? `${summary.count} events (${summary.dateRange})`
					: `${summary.count} events`
			}
		});
		const calendarIcon = createLucideIcon('calendar', 12);
		badge.appendChild(calendarIcon);
		badge.appendText(summary.count.toString());

		// Create expandable timeline section
		const timelineSection = item.createDiv({
			cls: 'crc-person-list-details crc-person-list-details--hidden crc-person-timeline-section'
		});

		// Toggle on badge click
		badge.addEventListener('click', (e) => {
			e.stopPropagation();
			const isHidden = timelineSection.hasClass('crc-person-list-details--hidden');
			timelineSection.toggleClass('crc-person-list-details--hidden', !isHidden);
			badge.toggleClass('crc-person-list-badge--active', isHidden);

			// Render timeline on first expand (lazy loading)
			if (isHidden && timelineSection.childElementCount === 0) {
				renderPersonTimeline(
					timelineSection,
					file,
					personName,
					this.app,
					this.plugin.settings,
					eventService,
					{
						maxEvents: 10,
						showEmptyState: false,
						onEventClick: (event) => {
							void this.app.workspace.getLeaf(false).openFile(event.file);
						}
					}
				);
			}
		});
	}

	/**
	 * Render a family timeline badge for a person list item
	 */
	private renderFamilyTimelineBadge(
		item: HTMLElement,
		mainRow: HTMLElement,
		file: TFile
	): void {
		const eventService = this.plugin.getEventService();
		if (!eventService) return;

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();

		// Get family timeline summary
		const summary = getFamilyTimelineSummary(file, eventService, familyGraph);

		// Only show badge if there are family members with events beyond just the person
		// (memberCount > 1 means there are spouses/children)
		if (summary.memberCount <= 1 || summary.totalEvents === 0) return;

		// Create badge
		const badge = mainRow.createEl('span', {
			cls: 'crc-person-list-badge crc-person-list-badge--family-timeline',
			attr: {
				title: summary.dateRange
					? `Family: ${summary.totalEvents} events, ${summary.memberCount} members (${summary.dateRange})`
					: `Family: ${summary.totalEvents} events, ${summary.memberCount} members`
			}
		});
		const usersIcon = createLucideIcon('users', 12);
		badge.appendChild(usersIcon);
		badge.appendText(summary.totalEvents.toString());

		// Create expandable family timeline section
		const familySection = item.createDiv({
			cls: 'crc-person-list-details crc-person-list-details--hidden crc-family-timeline-section'
		});

		// Toggle on badge click
		badge.addEventListener('click', (e) => {
			e.stopPropagation();
			const isHidden = familySection.hasClass('crc-person-list-details--hidden');
			familySection.toggleClass('crc-person-list-details--hidden', !isHidden);
			badge.toggleClass('crc-person-list-badge--active', isHidden);

			// Render family timeline on first expand (lazy loading)
			if (isHidden && familySection.childElementCount === 0) {
				renderFamilyTimeline(
					familySection,
					file,
					this.app,
					this.plugin.settings,
					eventService,
					familyGraph,
					{
						maxEvents: 20,
						showEmptyState: false,
						onEventClick: (event) => {
							void this.app.workspace.getLeaf(false).openFile(event.file);
						}
					}
				);
			}
		});
	}

	/**
	 * Render a research coverage badge for a person list item
	 */
	private renderPersonResearchCoverageBadge(
		item: HTMLElement,
		mainRow: HTMLElement,
		file: TFile
	): void {
		const evidenceService = new EvidenceService(this.app, this.plugin.settings);
		const coverage = evidenceService.getFactCoverageForFile(file);

		if (!coverage) return;

		// Determine badge color based on coverage percent
		let badgeClass = 'crc-person-list-badge--coverage';
		if (coverage.coveragePercent >= 75) {
			badgeClass += ' crc-person-list-badge--coverage-good';
		} else if (coverage.coveragePercent >= 50) {
			badgeClass += ' crc-person-list-badge--coverage-warning';
		} else {
			badgeClass += ' crc-person-list-badge--coverage-poor';
		}

		const badge = mainRow.createEl('span', {
			cls: `crc-person-list-badge ${badgeClass}`,
			attr: {
				title: `Research coverage: ${coverage.coveragePercent}% (${coverage.sourcedFactCount}/${coverage.totalFactCount} facts sourced)`
			}
		});
		const bookIcon = createLucideIcon('book-open', 12);
		badge.appendChild(bookIcon);
		badge.appendText(`${coverage.coveragePercent}%`);

		// Create expandable details section
		const detailsSection = item.createDiv({ cls: 'crc-person-list-details crc-person-list-details--hidden crc-research-coverage-details' });

		// Toggle on badge click
		badge.addEventListener('click', (e) => {
			e.stopPropagation();
			detailsSection.toggleClass('crc-person-list-details--hidden', !detailsSection.hasClass('crc-person-list-details--hidden'));
			badge.toggleClass('crc-person-list-badge--active', !badge.hasClass('crc-person-list-badge--active'));
		});

		// Render fact coverage details
		this.renderFactCoverageDetails(detailsSection, coverage);
	}

	/**
	 * Render fact coverage details in an expandable section
	 */
	private renderFactCoverageDetails(container: HTMLElement, coverage: PersonResearchCoverage): void {
		// Summary header
		const header = container.createDiv({ cls: 'crc-coverage-header' });
		header.createSpan({
			text: `Research coverage: ${coverage.coveragePercent}%`,
			cls: 'crc-coverage-title'
		});

		// Progress bar
		const progressContainer = header.createDiv({ cls: 'crc-progress-bar crc-progress-bar--inline' });
		const progressFill = progressContainer.createDiv({ cls: 'crc-progress-bar__fill' });
		progressFill.style.setProperty('width', `${coverage.coveragePercent}%`);
		if (coverage.coveragePercent < 50) {
			progressFill.addClass('crc-progress-bar__fill--danger');
		} else if (coverage.coveragePercent < 75) {
			progressFill.addClass('crc-progress-bar__fill--warning');
		}

		// Quality summary (count facts by quality level)
		const qualityCounts = this.calculateQualityCounts(coverage);
		if (qualityCounts.total > 0) {
			const qualitySummary = container.createDiv({ cls: 'crc-quality-summary' });

			if (qualityCounts.primary > 0) {
				const item = qualitySummary.createDiv({ cls: 'crc-quality-summary-item' });
				item.createSpan({ cls: 'crc-quality-dot crc-quality-dot--primary' });
				item.createSpan({ cls: 'crc-quality-summary-count', text: String(qualityCounts.primary) });
				item.createSpan({ text: 'primary', cls: 'crc-text--muted' });
			}

			if (qualityCounts.secondary > 0) {
				const item = qualitySummary.createDiv({ cls: 'crc-quality-summary-item' });
				item.createSpan({ cls: 'crc-quality-dot crc-quality-dot--secondary' });
				item.createSpan({ cls: 'crc-quality-summary-count', text: String(qualityCounts.secondary) });
				item.createSpan({ text: 'secondary', cls: 'crc-text--muted' });
			}

			if (qualityCounts.derivative > 0) {
				const item = qualitySummary.createDiv({ cls: 'crc-quality-summary-item' });
				item.createSpan({ cls: 'crc-quality-dot crc-quality-dot--derivative' });
				item.createSpan({ cls: 'crc-quality-summary-count', text: String(qualityCounts.derivative) });
				item.createSpan({ text: 'derivative', cls: 'crc-text--muted' });
			}

			if (qualityCounts.unsourced > 0) {
				const item = qualitySummary.createDiv({ cls: 'crc-quality-summary-item' });
				item.createSpan({ cls: 'crc-quality-dot', attr: { style: 'background: var(--text-faint)' } });
				item.createSpan({ cls: 'crc-quality-summary-count', text: String(qualityCounts.unsourced) });
				item.createSpan({ text: 'unsourced', cls: 'crc-text--muted' });
			}
		}

		// Fact list
		const factList = container.createDiv({ cls: 'crc-coverage-fact-list' });

		for (const fact of coverage.facts) {
			const factRow = factList.createDiv({ cls: 'crc-coverage-fact-row' });

			// Status icon
			const statusIcon = factRow.createSpan({ cls: `crc-coverage-status crc-coverage-status--${fact.status}` });
			const iconName = this.getFactStatusIcon(fact.status);
			setIcon(statusIcon, iconName);

			// Fact label
			factRow.createSpan({
				text: FACT_KEY_LABELS[fact.factKey],
				cls: 'crc-coverage-fact-label'
			});

			// Source count and quality badge
			if (fact.sourceCount > 0) {
				const sourceInfo = factRow.createSpan({ cls: 'crc-coverage-source-info' });
				sourceInfo.textContent = `${fact.sourceCount} source${fact.sourceCount !== 1 ? 's' : ''}`;

				// Quality badge (color-coded)
				if (fact.bestQuality) {
					const qualityBadge = factRow.createSpan({
						cls: `crc-quality-badge crc-quality-badge--${fact.bestQuality}`,
						attr: { 'aria-label': SOURCE_QUALITY_LABELS[fact.bestQuality].description }
					});
					qualityBadge.textContent = SOURCE_QUALITY_LABELS[fact.bestQuality].label;
				}
			}

			// Add source button for each fact
			const addBtn = factRow.createEl('button', {
				cls: 'crc-icon-button crc-icon-button--small crc-coverage-add-btn',
				attr: { 'aria-label': `Add source for ${FACT_KEY_LABELS[fact.factKey]}` }
			});
			setIcon(addBtn, 'plus');
			addBtn.addEventListener('click', (e) => {
				e.stopPropagation();
				this.addSourceCitationForFact(coverage.filePath, fact.factKey);
			});
		}

		// Proof Summaries section
		this.renderProofSummariesSection(container, coverage);
	}

	/**
	 * Render proof summaries section for a person
	 */
	private renderProofSummariesSection(container: HTMLElement, coverage: PersonResearchCoverage): void {
		const proofService = new ProofSummaryService(this.app, this.plugin.settings);
		if (this.plugin.personIndex) {
			proofService.setPersonIndex(this.plugin.personIndex);
		}
		const proofs = proofService.getProofsForPerson(coverage.personCrId);

		// Section container
		const section = container.createDiv({ cls: 'crc-proof-section' });

		// Header with "Create proof" button
		const sectionHeader = section.createDiv({ cls: 'crc-proof-section-header' });
		const headerTitle = sectionHeader.createSpan({ cls: 'crc-proof-section-title' });
		const scaleIcon = createLucideIcon('scale', 14);
		headerTitle.appendChild(scaleIcon);
		headerTitle.appendText(`Proof summaries (${proofs.length})`);

		const headerActions = sectionHeader.createDiv({ cls: 'crc-proof-section-actions' });

		const createBtn = headerActions.createEl('button', {
			cls: 'crc-btn crc-btn--small',
			text: 'New proof'
		});
		createBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			new CreateProofModal(this.app, this.plugin, {
				subjectPerson: `[[${coverage.personName}]]`,
				onSuccess: () => {
					// Refresh the view
					this.showPeopleTab();
				}
			}).open();
		});

		const templateBtn = headerActions.createEl('button', {
			cls: 'crc-btn crc-btn--small crc-btn--icon',
			attr: { 'aria-label': 'View proof templates' }
		});
		const templateIcon = createLucideIcon('file-code', 14);
		templateBtn.appendChild(templateIcon);
		templateBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			new TemplateSnippetsModal(this.app, 'proof', this.plugin.settings.propertyAliases).open();
		});

		// Proof list
		if (proofs.length === 0) {
			section.createDiv({
				cls: 'crc-proof-list-empty',
				text: 'No proof summaries yet. Create one to document your research reasoning.'
			});
		} else {
			const proofList = section.createDiv({ cls: 'crc-proof-list' });

			for (const proof of proofs) {
				this.renderProofCard(proofList, proof, () => this.showPeopleTab());
			}
		}
	}

	/**
	 * Render a single proof summary card
	 */
	private renderProofCard(container: HTMLElement, proof: ProofSummaryNote, onRefresh?: () => void): void {
		const card = container.createDiv({ cls: `crc-proof-card crc-proof-card--${proof.confidence}` });

		// Header row
		const header = card.createDiv({ cls: 'crc-proof-card-header' });

		const title = header.createSpan({ cls: 'crc-proof-card-title', text: proof.title });
		title.addEventListener('click', () => {
			void this.app.workspace.openLinkText(proof.filePath, '', true);
		});

		// Actions (edit/delete)
		const actions = header.createDiv({ cls: 'crc-proof-card-actions' });

		// Edit button
		const editBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon',
			attr: { 'aria-label': 'Edit proof summary' }
		});
		const editIcon = createLucideIcon('edit', 14);
		editBtn.appendChild(editIcon);
		editBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			const file = this.app.vault.getAbstractFileByPath(proof.filePath);
			if (file instanceof TFile) {
				new CreateProofModal(this.app, this.plugin, {
					editProof: proof,
					editFile: file,
					onUpdated: () => {
						if (onRefresh) onRefresh();
					}
				}).open();
			}
		});

		// Delete button
		const deleteBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--icon crc-btn--danger',
			attr: { 'aria-label': 'Delete proof summary' }
		});
		const deleteIcon = createLucideIcon('trash', 14);
		deleteBtn.appendChild(deleteIcon);
		deleteBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			void this.deleteProofSummary(proof, onRefresh);
		});

		// Badges
		const badges = header.createDiv({ cls: 'crc-proof-card-badges' });

		// Status badge
		const statusBadge = badges.createSpan({
			cls: `crc-proof-badge crc-proof-badge--status crc-proof-badge--${proof.status}`,
			text: PROOF_STATUS_LABELS[proof.status].label
		});
		statusBadge.setAttribute('title', PROOF_STATUS_LABELS[proof.status].description);

		// Confidence badge
		const confidenceBadge = badges.createSpan({
			cls: 'crc-proof-badge crc-proof-badge--confidence',
			text: PROOF_CONFIDENCE_LABELS[proof.confidence].label
		});
		confidenceBadge.setAttribute('title', PROOF_CONFIDENCE_LABELS[proof.confidence].description);

		// Conclusion (truncated)
		if (proof.conclusion) {
			const maxLen = 100;
			const conclusionText = proof.conclusion.length > maxLen
				? proof.conclusion.substring(0, maxLen) + '...'
				: proof.conclusion;

			card.createDiv({ cls: 'crc-proof-card-conclusion', text: conclusionText });
		}

		// Meta info
		const meta = card.createDiv({ cls: 'crc-proof-card-meta' });

		// Fact type
		const factItem = meta.createSpan({ cls: 'crc-proof-card-meta-item' });
		const tagIcon = createLucideIcon('hash', 12);
		factItem.appendChild(tagIcon);
		factItem.appendText(FACT_KEY_LABELS[proof.factType]);

		// Evidence count
		const evidenceItem = meta.createSpan({ cls: 'crc-proof-card-meta-item' });
		const archiveIcon = createLucideIcon('archive', 12);
		evidenceItem.appendChild(archiveIcon);
		evidenceItem.appendText(`${proof.evidence.length} source${proof.evidence.length !== 1 ? 's' : ''}`);

		// Date if available
		if (proof.dateWritten) {
			const dateItem = meta.createSpan({ cls: 'crc-proof-card-meta-item' });
			const calendarIcon = createLucideIcon('calendar', 12);
			dateItem.appendChild(calendarIcon);
			dateItem.appendText(proof.dateWritten);
		}
	}

	/**
	 * Delete a proof summary with confirmation
	 */
	private deleteProofSummary(proof: ProofSummaryNote, onRefresh?: () => void): void {
		const file = this.app.vault.getAbstractFileByPath(proof.filePath);
		if (!(file instanceof TFile)) {
			new Notice('Proof summary file not found.');
			return;
		}

		// Confirmation modal
		const confirmModal = new Modal(this.app);
		confirmModal.titleEl.setText('Delete proof summary');

		const content = confirmModal.contentEl;
		content.createEl('p', {
			text: `Are you sure you want to delete "${proof.title}"?`
		});
		content.createEl('p', {
			text: 'The file will be moved to trash.',
			cls: 'mod-warning'
		});

		const buttonContainer = content.createDiv({ cls: 'crc-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn'
		});
		cancelBtn.addEventListener('click', () => confirmModal.close());

		const deleteBtn = buttonContainer.createEl('button', {
			text: 'Delete',
			cls: 'crc-btn crc-btn--danger'
		});
		deleteBtn.addEventListener('click', () => {
			void (async () => {
				try {
					await this.app.fileManager.trashFile(file);
					new Notice(`Deleted proof summary: ${proof.title}`);
					confirmModal.close();
					if (onRefresh) onRefresh();
				} catch (error) {
					console.error('Failed to delete proof summary:', error);
					new Notice('Failed to delete proof summary.');
				}
			})();
		});

		confirmModal.open();
	}

	/**
	 * Get the icon name for a fact coverage status
	 */
	private getFactStatusIcon(status: FactCoverageStatus): string {
		switch (status) {
			case 'well-sourced':
				return 'check-circle-2';
			case 'sourced':
				return 'check-circle';
			case 'weakly-sourced':
				return 'alert-circle';
			case 'unsourced':
				return 'circle';
			default:
				return 'circle';
		}
	}

	/**
	 * Calculate counts of facts by source quality level
	 */
	private calculateQualityCounts(coverage: PersonResearchCoverage): {
		primary: number;
		secondary: number;
		derivative: number;
		unsourced: number;
		total: number;
	} {
		const counts = { primary: 0, secondary: 0, derivative: 0, unsourced: 0, total: 0 };

		for (const fact of coverage.facts) {
			if (fact.status === 'unsourced') {
				counts.unsourced++;
			} else if (fact.bestQuality === 'primary') {
				counts.primary++;
			} else if (fact.bestQuality === 'secondary') {
				counts.secondary++;
			} else if (fact.bestQuality === 'derivative') {
				counts.derivative++;
			} else {
				// Has sources but no quality determined - count as secondary
				counts.secondary++;
			}
			counts.total++;
		}

		return counts;
	}

	/**
	 * Add a source citation to a specific fact on a person note
	 */
	private addSourceCitationForFact(personFilePath: string, factKey: FactKey): void {
		const file = this.app.vault.getAbstractFileByPath(personFilePath);
		if (!(file instanceof TFile)) {
			new Notice('Could not find person file');
			return;
		}

		// Open source picker modal
		new SourcePickerModal(this.app, this.plugin, {
			onSelect: async (source) => {
				// Create wikilink from source file path
				const sourceFileName = source.filePath.split('/').pop()?.replace('.md', '') || source.title;
				const wikilink = `[[${sourceFileName}]]`;

				// Update using new flat sourced_* property
				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					const propName = FACT_KEY_TO_SOURCED_PROPERTY[factKey];

					// Get existing sources array (normalize to array)
					let sources: string[] = [];
					if (frontmatter[propName]) {
						if (Array.isArray(frontmatter[propName])) {
							sources = frontmatter[propName] as string[];
						} else {
							sources = [String(frontmatter[propName])];
						}
					}

					// Add the source if not already present
					if (!sources.includes(wikilink)) {
						sources.push(wikilink);
						frontmatter[propName] = sources;
						new Notice(`Added "${source.title}" as source for ${FACT_KEY_LABELS[factKey]}`);
					} else {
						new Notice(`"${source.title}" is already linked to ${FACT_KEY_LABELS[factKey]}`);
					}
				});

				// Refresh the people tab to show updated coverage
				this.showPeopleTab();
			}
		}).open();
	}

	/**
	 * Create a person note
	 */
	private async createPersonNote(
		name: string,
		birthDate: string,
		deathDate: string,
		autoGenUuid: boolean,
		manualUuid: string,
		fatherCrId: string | undefined,
		motherCrId: string | undefined,
		spouseCrId: string | undefined,
		openNote: boolean
	): Promise<void> {
		// Validate required fields
		if (!name || name.trim() === '') {
			new Notice('⚠️ Name is required');
			return;
		}

		// Validate manual UUID if provided
		if (!autoGenUuid && manualUuid) {
			const { validateCrId } = await import('../core/uuid');
			if (!validateCrId(manualUuid)) {
				new Notice('⚠️ Invalid cr_id format. Expected: abc-123-def-456');
				return;
			}
		}

		// Build person data with dual storage (names + cr_ids)
		const personData: PersonData = {
			name: name.trim(),
			crId: autoGenUuid ? undefined : manualUuid || undefined,
			birthDate: birthDate || undefined,
			deathDate: deathDate || undefined,
			fatherCrId: fatherCrId || undefined,
			fatherName: this.fatherField.name || undefined,
			motherCrId: motherCrId || undefined,
			motherName: this.motherField.name || undefined,
			spouseCrId: spouseCrId ? [spouseCrId] : undefined,
			spouseName: this.spouseField.name ? [this.spouseField.name] : undefined
		};

		// Debug logging
		logger.info('create-person', `Creating person note - name: ${personData.name}, crId: ${personData.crId}, birthDate: ${personData.birthDate}, deathDate: ${personData.deathDate}, fatherCrId: ${personData.fatherCrId}, motherCrId: ${personData.motherCrId}, spouseCrId: ${JSON.stringify(personData.spouseCrId)}`);

		try {
			// Create the note
			const file = await createPersonNote(this.app, personData, {
				directory: this.plugin.settings.peopleFolder || '',
				openAfterCreate: openNote
			});

			// Sync bidirectional relationships if enabled
			if (this.plugin.settings.enableBidirectionalSync) {
				const bidirectionalLinker = new BidirectionalLinker(this.app);
				await bidirectionalLinker.syncRelationships(file);
			}

			// Show success message
			new Notice(`✅ Created person note: ${file.basename}`);

			// Close modal if opening the note
			if (openNote) {
				this.close();
			}
		} catch (error: unknown) {
			console.error('Failed to create person note:', error);
			new Notice(`❌ Failed to create person note: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Render the Canvas Trees tab — delegates to extracted module
	 */
	private showTreeGenerationTab(): void {
		renderTreesTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.switchTab(tabId),
			closeModal: () => this.close(),
			openCanvasTree: (path) => this.openCanvasTree(path),
			showRecentTreeContextMenu: (event, tree) => this.showRecentTreeContextMenu(event, tree),
			openAndGenerateAllTrees: () => this.openAndGenerateAllTrees(),
			formatTimeAgo: (timestamp) => this.formatTimeAgo(timestamp),
			getCachedFamilyGraph: () => this.getCachedFamilyGraph()
		});
	}

	/**
	 * Show Collections tab — delegates to extracted module
	 */
	private showCollectionsTab(): void {
		renderCollectionsTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.switchTab(tabId),
			closeModal: () => this.close(),
			formatCanvasJson: (data) => formatCanvasJson(data)
		});
	}

	/**
	 * Show the Places tab with geographic statistics
	 */
	private showPlacesTab(): void {
		renderPlacesTab(
			this.contentContainer,
			this.plugin,
			this.createCard.bind(this),
			this.showTab.bind(this)
		);
	}

	// ==========================================================================
	// Maps Tab
	// ==========================================================================

	/**
	 * Show the Maps tab content
	 */
	private showMapsTab(): void {
		renderMapsTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.switchTab(tabId),
			closeModal: () => this.close()
		});
	}

	/**
	 * Quick-create a single place note from an unlinked place name
	 */
	private showQuickCreatePlaceModal(placeName: string): void {
		const modal = new CreatePlaceModal(this.app, {
			directory: this.plugin.settings.placesFolder || '',
			initialName: placeName,
			familyGraph: this.plugin.createFamilyGraphService(),
			placeGraph: new PlaceGraphService(this.app),
			settings: this.plugin.settings,
			plugin: this.plugin,
			onCreated: () => {
				new Notice(`Created place note: ${placeName}`);
				// Refresh the Places tab
				this.showTab('places');
			}
		});
		modal.open();
	}

	/**
	 * Show a modal with the person's timeline
	 */
	private showPersonTimelineModal(
		personFile: TFile,
		personName: string,
		eventService: EventService
	): void {
		const modal = new Modal(this.app);
		modal.titleEl.setText(`Timeline: ${personName}`);
		modal.modalEl.addClass('crc-person-timeline-modal');

		const content = modal.contentEl.createDiv({ cls: 'crc-person-timeline-modal__content' });

		renderPersonTimeline(
			content,
			personFile,
			personName,
			this.app,
			this.plugin.settings,
			eventService,
			{
				showEmptyState: true,
				onEventClick: (event) => {
					modal.close();
					void this.app.workspace.getLeaf(false).openFile(event.file);
				}
			}
		);

		modal.open();
	}

	/**
	 * Create a stat item for the statistics grid
	 */
	private createStatItem(container: HTMLElement, label: string, value: string, icon?: LucideIconName): void {
		createStatItemShared(container, label, value, icon);
	}

	// ============================================
	// SCHEMAS TAB
	// ============================================

	/**
	 * Show Schemas tab — delegates to extracted module
	 */
	private async showSchemasTab(): Promise<void> {
		await renderSchemasTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.switchTab(tabId),
			closeModal: () => this.close()
		});
	}

	/**
	 * Render research gaps section in Data Quality tab
	 * Shows summary of unsourced facts aligned with GPS methodology
	 */
	private renderResearchGapsSection(container: HTMLElement): void {
		// Create card for Research Gaps
		const card = this.createCard({
			title: 'Research gaps',
			icon: 'search',
			subtitle: 'Track unsourced and weakly sourced facts'
		});
		const section = card.querySelector('.crc-card__content') as HTMLElement;
		section.addClass('crc-research-gaps-section');

		// Explanation
		const explanation = section.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		explanation.createEl('p', {
			text: 'Identify facts that need sources or stronger evidence. Focus research efforts on gaps in your documentation.',
			cls: 'crc-text--small'
		});

		// Header actions
		const header = section.createDiv({ cls: 'crc-section-header' });

		const headerActions = header.createDiv({ cls: 'crc-section-header-actions' });

		// Export button
		const exportBtn = headerActions.createEl('button', {
			cls: 'crc-icon-button',
			attr: { 'aria-label': 'Export research gaps to CSV' }
		});
		setIcon(exportBtn, 'download');
		exportBtn.addEventListener('click', () => {
			this.exportResearchGapsToCSV();
		});

		const sourcesLink = headerActions.createEl('button', {
			cls: 'crc-link-button',
			text: 'Open sources tab'
		});
		setIcon(sourcesLink.createSpan({ cls: 'crc-button-icon-right' }), 'external-link');
		sourcesLink.addEventListener('click', () => {
			this.showTab('sources');
		});

		// Get research gaps data
		const evidenceService = new EvidenceService(this.app, this.plugin.settings);
		const gaps = evidenceService.getResearchGaps(10);

		// Summary stats
		const statsRow = section.createDiv({ cls: 'crc-schema-summary-row' });

		// People tracked
		const trackedStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
		setIcon(trackedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'users');
		trackedStat.createSpan({
			text: `${gaps.totalPeopleTracked} tracked`,
			cls: 'crc-schema-stat-text'
		});

		// Count total unsourced
		const totalUnsourced = Object.values(gaps.unsourcedByFact).reduce((a, b) => a + b, 0);
		const unsourcedStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-warning' });
		setIcon(unsourcedStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'alert-triangle');
		unsourcedStat.createSpan({
			text: `${totalUnsourced} unsourced facts`,
			cls: 'crc-schema-stat-text'
		});

		// Count weakly sourced
		const totalWeakly = Object.values(gaps.weaklySourcedByFact).reduce((a, b) => a + b, 0);
		const weaklyStat = statsRow.createDiv({ cls: 'crc-schema-stat crc-schema-stat-info' });
		setIcon(weaklyStat.createSpan({ cls: 'crc-schema-stat-icon' }), 'info');
		weaklyStat.createSpan({
			text: `${totalWeakly} weakly sourced`,
			cls: 'crc-schema-stat-text'
		});

		// Quality filter dropdown
		const filterRow = section.createDiv({ cls: 'crc-filter-row' });
		filterRow.createSpan({ text: 'Filter by:', cls: 'crc-filter-label' });
		const qualityFilter = filterRow.createEl('select', { cls: 'dropdown crc-filter-select' });
		qualityFilter.createEl('option', { value: 'all', text: 'All research gaps' });
		qualityFilter.createEl('option', { value: 'unsourced', text: 'Unsourced only' });
		qualityFilter.createEl('option', { value: 'weakly-sourced', text: 'Weakly sourced only' });
		qualityFilter.createEl('option', { value: 'needs-primary', text: 'Needs primary source' });

		// Store current filter state
		let currentQualityFilter = 'all';

		// Re-render function for when filter changes
		const rerenderBreakdown = (): void => {
			// Remove existing breakdown and people sections
			section.querySelectorAll('.crc-research-gaps-breakdown, .crc-research-gaps-lowest').forEach(el => el.remove());

			// Filter data based on selection
			const filteredGaps = this.filterResearchGapsByQuality(gaps, currentQualityFilter);

			// Render breakdown
			this.renderResearchGapsBreakdown(section, filteredGaps, currentQualityFilter);

			// Render lowest coverage people
			this.renderLowestCoveragePeople(section, filteredGaps.lowestCoverage, evidenceService, currentQualityFilter);
		};

		qualityFilter.addEventListener('change', () => {
			currentQualityFilter = qualityFilter.value;
			rerenderBreakdown();
		});

		// If no tracking data, show empty state
		if (gaps.totalPeopleTracked === 0 && gaps.totalPeopleUntracked > 0) {
			const emptyState = section.createDiv({ cls: 'crc-empty-state crc-compact' });
			setIcon(emptyState.createSpan({ cls: 'crc-empty-icon' }), 'file-search');
			emptyState.createEl('p', {
				text: `No fact-level source tracking data found. Add sourced_* properties to your person notes to track research coverage.`
			});
			container.appendChild(card);
			return;
		}

		// Render initial breakdown and people list
		this.renderResearchGapsBreakdown(section, gaps, 'all');
		this.renderLowestCoveragePeople(section, gaps.lowestCoverage, evidenceService, 'all');

		container.appendChild(card);
	}

	/**
	 * Render source conflicts section
	 * Shows proofs with conflicting evidence that need resolution
	 */
	private renderSourceConflictsSection(container: HTMLElement): void {
		const proofService = new ProofSummaryService(this.app, this.plugin.settings);
		if (this.plugin.personIndex) {
			proofService.setPersonIndex(this.plugin.personIndex);
		}
		const conflictedProofs = proofService.getProofsByStatus('conflicted');

		// Create card for Source Conflicts
		const card = this.createCard({
			title: 'Source conflicts',
			icon: 'scale',
			subtitle: 'Resolve conflicting evidence in your research'
		});
		const section = card.querySelector('.crc-card__content') as HTMLElement;
		section.addClass('crc-conflicts-section');

		// Explanation
		const explanation = section.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		explanation.createEl('p', {
			text: 'Track and resolve cases where multiple sources provide conflicting information about the same fact.',
			cls: 'crc-text--small'
		});

		// Summary stats
		const statsRow = section.createDiv({ cls: 'crc-schema-summary-row' });

		// Count of conflicted proofs
		const conflictStat = statsRow.createDiv({
			cls: `crc-schema-stat ${conflictedProofs.length > 0 ? 'crc-schema-stat-warning' : ''}`
		});
		const conflictIcon = conflictStat.createSpan({ cls: 'crc-schema-stat-icon' });
		setIcon(conflictIcon, conflictedProofs.length > 0 ? 'alert-triangle' : 'check');
		conflictStat.createSpan({
			text: `${conflictedProofs.length} unresolved conflict${conflictedProofs.length !== 1 ? 's' : ''}`,
			cls: 'crc-schema-stat-text'
		});

		// Total proofs
		const allProofs = proofService.getAllProofs();
		const proofStat = statsRow.createDiv({ cls: 'crc-schema-stat' });
		const proofIcon = proofStat.createSpan({ cls: 'crc-schema-stat-icon' });
		setIcon(proofIcon, 'scale');
		proofStat.createSpan({
			text: `${allProofs.length} proof summar${allProofs.length !== 1 ? 'ies' : 'y'}`,
			cls: 'crc-schema-stat-text'
		});

		// Empty state if no proofs
		if (allProofs.length === 0) {
			const emptyState = section.createDiv({ cls: 'crc-empty-state crc-compact' });
			const emptyIcon = emptyState.createSpan({ cls: 'crc-empty-icon' });
			setIcon(emptyIcon, 'scale');
			emptyState.createEl('p', {
				text: 'No proof summaries created yet. Use proof summaries to document your research reasoning and resolve conflicting evidence.'
			});

			// Buttons container
			const buttonRow = emptyState.createDiv({ cls: 'crc-empty-state-buttons' });

			// Create proof button
			const createBtn = buttonRow.createEl('button', {
				cls: 'crc-btn crc-btn--primary',
				text: 'Create proof summary'
			});
			createBtn.addEventListener('click', () => {
				new CreateProofModal(this.app, this.plugin, {
					onSuccess: () => {
						this.showDataQualityTab();
					}
				}).open();
			});

			// View templates button
			const templateBtn = buttonRow.createEl('button', {
				cls: 'crc-btn',
				text: 'View templates'
			});
			const templateIcon = createLucideIcon('file-code', 14);
			templateBtn.insertBefore(templateIcon, templateBtn.firstChild);
			templateBtn.addEventListener('click', () => {
				new TemplateSnippetsModal(this.app, 'proof', this.plugin.settings.propertyAliases).open();
			});

			container.appendChild(card);
			return;
		}

		// If no conflicts, show success state
		if (conflictedProofs.length === 0) {
			const successState = section.createDiv({ cls: 'crc-dq-no-issues' });
			const successIcon = successState.createDiv({ cls: 'crc-dq-no-issues-icon' });
			setIcon(successIcon, 'check');
			successState.createSpan({ text: 'No unresolved source conflicts' });
			container.appendChild(card);
			return;
		}

		// Show conflicted proofs
		const conflictList = section.createDiv({ cls: 'crc-conflicts-list' });

		for (const proof of conflictedProofs) {
			this.renderConflictItem(conflictList, proof);
		}

		container.appendChild(card);
	}

	/**
	 * Render a single conflict item
	 */
	private renderConflictItem(container: HTMLElement, proof: ProofSummaryNote): void {
		const item = container.createDiv({ cls: 'crc-conflict-item' });

		// Header with alert icon
		const header = item.createDiv({ cls: 'crc-conflict-item-header' });
		const alertIcon = header.createSpan({ cls: 'crc-conflict-icon' });
		setIcon(alertIcon, 'alert-triangle');

		// Title (clickable)
		const title = header.createSpan({ cls: 'crc-conflict-title', text: proof.title });
		title.addEventListener('click', () => {
			void this.app.workspace.openLinkText(proof.filePath, '', true);
		});

		// Fact type badge
		header.createSpan({
			cls: 'crc-proof-badge',
			text: FACT_KEY_LABELS[proof.factType]
		});

		// Subject person
		const personRow = item.createDiv({ cls: 'crc-conflict-person' });
		const personIcon = personRow.createSpan();
		setIcon(personIcon, 'user');
		personRow.createSpan({ text: proof.subjectPerson.replace(/\[\[|\]\]/g, '') });

		// Conflicting evidence
		const evidenceSection = item.createDiv({ cls: 'crc-conflict-evidence' });
		evidenceSection.createSpan({ cls: 'crc-conflict-evidence-label', text: 'Conflicting evidence:' });

		const evidenceList = evidenceSection.createDiv({ cls: 'crc-conflict-evidence-list' });

		for (const ev of proof.evidence) {
			const evItem = evidenceList.createDiv({
				cls: `crc-conflict-evidence-item ${ev.supports === 'conflicts' ? 'crc-conflict-evidence-item--conflicts' : ''}`
			});

			// Support indicator
			const supportIcon = evItem.createSpan({ cls: 'crc-conflict-support-icon' });
			if (ev.supports === 'conflicts') {
				setIcon(supportIcon, 'x');
			} else {
				setIcon(supportIcon, 'check');
			}

			// Source name
			evItem.createSpan({
				cls: 'crc-conflict-source',
				text: ev.source.replace(/\[\[|\]\]/g, '')
			});

			// Information (claim)
			if (ev.information) {
				evItem.createSpan({
					cls: 'crc-conflict-claim',
					text: `: "${ev.information}"`
				});
			}
		}

		// Resolve button
		const actions = item.createDiv({ cls: 'crc-conflict-actions' });
		const resolveBtn = actions.createEl('button', {
			cls: 'crc-btn crc-btn--small',
			text: 'Open to resolve'
		});
		resolveBtn.addEventListener('click', () => {
			void this.app.workspace.openLinkText(proof.filePath, '', true);
		});
	}

	/**
	 * Filter research gaps data by quality level
	 */
	private filterResearchGapsByQuality(
		gaps: ResearchGapsSummary,
		filter: string
	): ResearchGapsSummary {
		if (filter === 'all') {
			return gaps;
		}

		// Create filtered copy
		const filtered: ResearchGapsSummary = {
			totalPeopleTracked: gaps.totalPeopleTracked,
			totalPeopleUntracked: gaps.totalPeopleUntracked,
			unsourcedByFact: { ...gaps.unsourcedByFact },
			weaklySourcedByFact: { ...gaps.weaklySourcedByFact },
			lowestCoverage: []
		};

		// Filter the people list based on selected criteria
		for (const person of gaps.lowestCoverage) {
			const hasMatchingGap = person.facts.some(fact => {
				switch (filter) {
					case 'unsourced':
						return fact.status === 'unsourced';
					case 'weakly-sourced':
						return fact.status === 'weakly-sourced';
					case 'needs-primary':
						// Any fact that doesn't have a primary source
						return fact.bestQuality !== 'primary';
					default:
						return true;
				}
			});

			if (hasMatchingGap) {
				filtered.lowestCoverage.push(person);
			}
		}

		return filtered;
	}

	/**
	 * Render research gaps breakdown by fact type
	 */
	private renderResearchGapsBreakdown(
		container: HTMLElement,
		gaps: ResearchGapsSummary,
		filter: string
	): void {
		// Determine which counts to show based on filter
		let factCounts: Record<FactKey, number>;
		let title: string;

		switch (filter) {
			case 'unsourced':
				factCounts = gaps.unsourcedByFact;
				title = 'Unsourced facts by type';
				break;
			case 'weakly-sourced':
				factCounts = gaps.weaklySourcedByFact;
				title = 'Weakly sourced facts by type';
				break;
			case 'needs-primary':
				// Combine unsourced + weakly sourced for "needs primary"
				factCounts = {} as Record<FactKey, number>;
				for (const key of FACT_KEYS) {
					factCounts[key] = (gaps.unsourcedByFact[key] || 0) + (gaps.weaklySourcedByFact[key] || 0);
				}
				title = 'Facts needing primary sources';
				break;
			default: // 'all'
				factCounts = gaps.unsourcedByFact;
				title = 'Unsourced facts by type';
		}

		const totalCount = Object.values(factCounts).reduce((a, b) => a + b, 0);
		if (totalCount === 0) return;

		const breakdownSection = container.createDiv({ cls: 'crc-research-gaps-breakdown' });
		breakdownSection.createEl('h4', { text: title, cls: 'crc-section-subtitle' });

		const grid = breakdownSection.createDiv({ cls: 'crc-schema-error-grid' });

		// Sort by count descending
		const sortedFacts = (Object.entries(factCounts) as [FactKey, number][])
			.filter(([, count]) => count > 0)
			.sort((a, b) => b[1] - a[1]);

		for (const [factKey, count] of sortedFacts) {
			const item = grid.createDiv({ cls: 'crc-schema-error-item' });
			item.createSpan({ text: FACT_KEY_LABELS[factKey], cls: 'crc-schema-error-label' });
			item.createSpan({ text: String(count), cls: 'crc-schema-error-count' });
		}
	}

	/**
	 * Render lowest coverage people list
	 */
	private renderLowestCoveragePeople(
		container: HTMLElement,
		people: PersonResearchCoverage[],
		_evidenceService: EvidenceService,
		filter: string
	): void {
		if (people.length === 0) {
			const emptySection = container.createDiv({ cls: 'crc-research-gaps-lowest' });
			emptySection.createEl('p', {
				text: `No people match the "${filter}" filter.`,
				cls: 'crc-text--muted'
			});
			return;
		}

		const lowestSection = container.createDiv({ cls: 'crc-research-gaps-lowest' });
		lowestSection.createEl('h4', { text: 'Lowest research coverage', cls: 'crc-section-subtitle' });

		const list = lowestSection.createDiv({ cls: 'crc-research-gaps-list' });

		for (const person of people.slice(0, 5)) {
			const item = list.createDiv({ cls: 'crc-research-gaps-person' });

			// Progress bar
			const progressBar = item.createDiv({ cls: 'crc-progress-bar crc-progress-bar--small' });
			const progressFill = progressBar.createDiv({ cls: 'crc-progress-bar__fill' });
			progressFill.style.setProperty('width', `${person.coveragePercent}%`);

			// Adjust color based on coverage
			if (person.coveragePercent < 25) {
				progressFill.addClass('crc-progress-bar__fill--danger');
			} else if (person.coveragePercent < 50) {
				progressFill.addClass('crc-progress-bar__fill--warning');
			}

			// Name and stats
			const info = item.createDiv({ cls: 'crc-research-gaps-info' });
			const nameLink = info.createEl('a', {
				text: person.personName,
				cls: 'crc-link',
				href: '#'
			});
			nameLink.addEventListener('click', (e) => {
				e.preventDefault();
				const file = this.app.vault.getAbstractFileByPath(person.filePath);
				if (file instanceof TFile) {
					void this.app.workspace.openLinkText(file.path, '', false);
				}
			});

			info.createSpan({
				text: `${person.coveragePercent}% (${person.sourcedFactCount}/${person.totalFactCount} facts)`,
				cls: 'crc-text-muted crc-text-small'
			});
		}
	}

	/**
	 * Export research gaps data to CSV and copy to clipboard
	 */
	private exportResearchGapsToCSV(): void {
		const evidenceService = new EvidenceService(this.app, this.plugin.settings);
		const gaps = evidenceService.getResearchGaps(1000); // Get all, not just top 10

		if (gaps.lowestCoverage.length === 0) {
			new Notice('No research coverage data to export');
			return;
		}

		// Build CSV with headers
		const headers = ['Name', 'File Path', 'Coverage %', 'Sourced Facts', 'Total Facts', ...FACT_KEYS.map(k => FACT_KEY_LABELS[k])];
		const rows: string[][] = [];

		for (const person of gaps.lowestCoverage) {
			const row: string[] = [
				`"${person.personName.replace(/"/g, '""')}"`,
				`"${person.filePath.replace(/"/g, '""')}"`,
				String(person.coveragePercent),
				String(person.sourcedFactCount),
				String(person.totalFactCount)
			];

			// Add status for each fact type
			for (const factKey of FACT_KEYS) {
				const fact = person.facts.find(f => f.factKey === factKey);
				if (fact) {
					row.push(fact.status);
				} else {
					row.push('unsourced');
				}
			}

			rows.push(row);
		}

		const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

		void navigator.clipboard.writeText(csv).then(() => {
			new Notice(`Research gaps exported: ${gaps.lowestCoverage.length} people copied to clipboard as CSV`);
		}).catch(() => {
			new Notice('Failed to copy to clipboard');
		});
	}

	// ==========================================================================
	// RELATIONSHIPS TAB
	// ==========================================================================

	/**
	 * Show Relationships tab with type management and relationship overview
	 */
	private showRelationshipsTab(): void {
		const container = this.contentContainer;
		renderRelationshipsTab(
			container,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId)
		);
	}

	/**
	 * Show Events tab with date systems and temporal statistics
	 */
	private showEventsTab(): void {
		const container = this.contentContainer;
		renderEventsTab(
			container,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId)
		);
	}

	/**
	 * Show Organizations tab with organization list and statistics
	 */
	private showOrganizationsTab(): void {
		const container = this.contentContainer;
		renderOrganizationsTab(
			container,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId)
		);
	}

	/**
	 * Show Universes tab -- delegates to extracted module
	 */
	private showUniversesTab(): void {
		renderUniversesTab(
			this.contentContainer,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId),
			() => this.close()
		);
	}

	/**
	 * Show Statistics tab with vault statistics and data quality metrics
	 */
	private showStatisticsTab(): void {
		const container = this.contentContainer;
		renderStatisticsTab(
			container,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId),
			() => this.close()
		);
	}

	/**
	 * Show Sources tab with source list and statistics
	 */
	private showSourcesTab(): void {
		const container = this.contentContainer;
		renderSourcesTab(
			container,
			this.plugin,
			(options) => this.createCard(options),
			(tabId) => this.switchTab(tabId)
		);
	}

	/**
	 * Get contrasting text color for a background color
	 */
	private getContrastColor(hexColor: string): string {
		return getContrastColorShared(hexColor);
	}

	/**
	 * Show placeholder for unimplemented tabs
	 */
	private showPlaceholderTab(tabId: string): void {
		const container = this.contentContainer;
		const tabConfig = TAB_CONFIGS.find(t => t.id === tabId);

		const card = this.createCard({
			title: tabConfig?.name || 'Coming soon',
			icon: tabConfig?.icon || 'info'
		});

		const content = card.querySelector('.crc-card__content') as HTMLElement;
		content.createEl('p', {
			text: tabConfig?.description || 'This tab is under construction.',
			cls: 'crc-text-muted'
		});

		container.appendChild(card);
	}

	// ==========================================================================
	// UTILITY METHODS
	// ==========================================================================

	/**
	 * Create a Material Design card
	 */
	private createCard(options: {
		title: string;
		icon?: LucideIconName;
		subtitle?: string;
		elevation?: number;
	}): HTMLElement {
		const card = document.createElement('div');
		card.className = 'crc-card';

		if (options.elevation) {
			card.classList.add(`crc-elevation-${options.elevation}`);
		}

		// Header
		const header = card.createDiv({ cls: 'crc-card__header' });
		const titleContainer = header.createDiv({ cls: 'crc-card__title' });

		if (options.icon) {
			const icon = createLucideIcon(options.icon, 24);
			titleContainer.appendChild(icon);
		}

		titleContainer.appendText(options.title);

		if (options.subtitle) {
			const subtitle = header.createDiv({ cls: 'crc-card__subtitle' });
			subtitle.textContent = options.subtitle;
		}

		// Content (empty, to be filled by caller)
		card.createDiv({ cls: 'crc-card__content' });

		return card;
	}

	/**
	 * Create a relationship field with link button
	 */
	private createRelationshipField(
		container: HTMLElement,
		label: string,
		placeholder: string,
		fieldData: RelationshipField
	): { input: HTMLInputElement; linkBtn: HTMLButtonElement; helpEl: HTMLElement } {
		const group = container.createDiv({ cls: 'crc-form-group' });
		group.createDiv({ cls: 'crc-form-label', text: label });

		// Input container with button
		const inputContainer = group.createDiv({ cls: 'crc-input-with-button' });

		const input = inputContainer.createEl('input', {
			cls: 'crc-form-input',
			attr: {
				type: 'text',
				placeholder: placeholder,
				readonly: true
			}
		});

		const linkBtn = inputContainer.createEl('button', {
			cls: 'crc-btn crc-btn--secondary crc-input-button',
			attr: {
				type: 'button'
			}
		});
		const linkIcon = createLucideIcon('link', 16);
		linkBtn.appendChild(linkIcon);
		linkBtn.appendText('Link');

		// Help text
		const helpText = group.createDiv({ cls: 'crc-form-help' });
		this.updateHelpText(helpText, fieldData);

		// Link button handler
		linkBtn.addEventListener('click', () => {
			const picker = new PersonPickerModal(this.app, (person: PersonInfo) => {
				fieldData.name = person.name;
				fieldData.crId = person.crId;
				input.value = person.name;
				input.addClass('crc-input--linked');
				linkBtn.textContent = '';
				const unlinkIcon = createLucideIcon('unlink', 16);
				linkBtn.appendChild(unlinkIcon);
				linkBtn.appendText('Unlink');
				this.updateHelpText(helpText, fieldData);
			}, { familyGraph: this.getCachedFamilyGraph() });
			picker.open();
		});

		return { input, linkBtn, helpEl: helpText };
	}

	/**
	 * Update help text for relationship field
	 */
	private updateHelpText(helpEl: HTMLElement, fieldData: RelationshipField): void {
		helpEl.empty();
		if (fieldData.crId) {
			helpEl.appendText('Linked to: ');
			helpEl.createEl('code', {
				text: fieldData.name,
				cls: 'crc-help-badge'
			});
		} else {
			helpEl.appendText('Click "Link" to select a person from your vault');
		}
	}

	/**
	 * Setup unlink functionality for a relationship field
	 */
	private setupUnlinkButton(
		input: HTMLInputElement,
		button: HTMLButtonElement,
		fieldData: RelationshipField,
		helpEl: HTMLElement
	): void {
		button.addEventListener('click', () => {
			if (fieldData.crId) {
				// Unlink
				fieldData.name = '';
				fieldData.crId = undefined;
				input.value = '';
				input.removeClass('crc-input--linked');
				button.textContent = '';
				const linkIcon = createLucideIcon('link', 16);
				button.appendChild(linkIcon);
				button.appendText('Link');
				this.updateHelpText(helpEl, fieldData);
			}
		});
	}

	/**
	 * Extract person info from file (for inline person browser)
	 */
	private extractPersonInfoFromFile(file: TFile): PersonInfo | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;

		const fm = cache.frontmatter;

		// Only include person notes (not events, sources, places, etc.)
		if (!isPersonNote(fm, cache, this.plugin.settings.noteTypeDetection)) return null;

		const crId = fm.cr_id;
		if (!crId) return null;

		// Note: Frontmatter uses 'born'/'died' properties, mapped to birthDate/deathDate internally
		// Convert Date objects to ISO strings if necessary (Obsidian parses YAML dates as Date objects)
		const birthDate = fm.born instanceof Date ? fm.born.toISOString().split('T')[0] : fm.born;
		const deathDate = fm.died instanceof Date ? fm.died.toISOString().split('T')[0] : fm.died;

		return {
			name: file.basename,
			crId: crId,
			birthDate,
			deathDate,
			sex: cache.frontmatter.sex,
			birthPlace: extractPlaceInfo(fm.birth_place),
			deathPlace: extractPlaceInfo(fm.death_place),
			burialPlace: extractPlaceInfo(fm.burial_place),
			file: file
		};
	}

	/**
	 * Clear all relationship fields (data and UI)
	 */
	private clearRelationshipFields(): void {
		// Clear data
		this.fatherField = { name: '' };
		this.motherField = { name: '' };
		this.spouseField = { name: '' };

		// Clear UI elements if they exist
		if (this.fatherInput) {
			this.fatherInput.value = '';
			this.fatherInput.removeClass('crc-input--linked');
		}
		if (this.fatherBtn) {
			this.fatherBtn.textContent = '';
			const linkIcon = createLucideIcon('link', 16);
			this.fatherBtn.appendChild(linkIcon);
			this.fatherBtn.appendText('Link');
		}
		if (this.fatherHelp) {
			this.updateHelpText(this.fatherHelp, this.fatherField);
		}

		if (this.motherInput) {
			this.motherInput.value = '';
			this.motherInput.removeClass('crc-input--linked');
		}
		if (this.motherBtn) {
			this.motherBtn.textContent = '';
			const linkIcon = createLucideIcon('link', 16);
			this.motherBtn.appendChild(linkIcon);
			this.motherBtn.appendText('Link');
		}
		if (this.motherHelp) {
			this.updateHelpText(this.motherHelp, this.motherField);
		}

		if (this.spouseInput) {
			this.spouseInput.value = '';
			this.spouseInput.removeClass('crc-input--linked');
		}
		if (this.spouseBtn) {
			this.spouseBtn.textContent = '';
			const linkIcon = createLucideIcon('link', 16);
			this.spouseBtn.appendChild(linkIcon);
			this.spouseBtn.appendText('Link');
		}
		if (this.spouseHelp) {
			this.updateHelpText(this.spouseHelp, this.spouseField);
		}
	}

	/**
	 * Sync bidirectional relationships for all person notes after GEDCOM import
	 */
	private async syncImportedRelationships(): Promise<void> {
		const peopleFolder = this.plugin.settings.peopleFolder || '';
		const folder = this.app.vault.getAbstractFileByPath(peopleFolder);

		if (!(folder instanceof TFolder)) {
			logger.warn('gedcom-sync', 'People folder not found, skipping relationship sync');
			return;
		}

		// Get all person notes in the folder
		const personFiles: TFile[] = [];
		const getAllMarkdownFiles = (folder: TFolder) => {
			for (const child of folder.children) {
				if (child instanceof TFile && child.extension === 'md') {
					const cache = this.app.metadataCache.getFileCache(child);
					if (cache?.frontmatter?.cr_id) {
						personFiles.push(child);
					}
				} else if (child instanceof TFolder) {
					getAllMarkdownFiles(child);
				}
			}
		};
		getAllMarkdownFiles(folder);

		if (personFiles.length === 0) {
			logger.info('gedcom-sync', 'No person notes found to sync');
			return;
		}

		logger.info('gedcom-sync', `Syncing relationships for ${personFiles.length} person notes`);

		// Show progress notice
		const progressNotice = new Notice(
			`Syncing relationships for ${personFiles.length} people...`,
			0 // Don't auto-dismiss
		);

		try {
			const bidirectionalLinker = new BidirectionalLinker(this.app);
			let syncedCount = 0;

			// Sync all person notes
			for (const file of personFiles) {
				try {
					await bidirectionalLinker.syncRelationships(file);
					syncedCount++;

					// Update progress every 10 files
					if (syncedCount % 10 === 0) {
						progressNotice.setMessage(
							`Syncing relationships: ${syncedCount}/${personFiles.length} people processed`
						);
					}
				} catch (error: unknown) {
					logger.error('gedcom-sync', `Failed to sync relationships for ${file.path}`, {
						error: getErrorMessage(error)
					});
				}
			}

			// Hide progress notice and show completion
			progressNotice.hide();
			new Notice(`✓ Relationships synced for ${syncedCount} people`);

			logger.info('gedcom-sync', `Relationship sync complete: ${syncedCount}/${personFiles.length} files processed`);
		} catch (error: unknown) {
			progressNotice.hide();
			const errorMsg = getErrorMessage(error);
			logger.error('gedcom-sync', 'Failed to sync imported relationships', {
				error: errorMsg
			});
			new Notice(`Relationship sync failed: ${errorMsg}`);
		}
	}

	// =========================================================================
	// DATA QUALITY TAB
	// =========================================================================

	/**
	 * Show Data Quality tab - analyze data quality and find issues
	 */
	private showDataQualityTab(): void {
		const container = this.contentContainer;
		container.empty();

		// Quick Start Guidance Card
		const quickStartCard = this.createCard({
			title: 'Quick start',
			icon: 'info',
			subtitle: 'Where to find data quality tools'
		});
		const quickStartContent = quickStartCard.querySelector('.crc-card__content') as HTMLElement;

		const guidanceText = quickStartContent.createEl('p', {
			cls: 'crc-text-muted'
		});
		guidanceText.appendText('Data quality tools are organized by entity type for convenience. This tab provides vault-wide analysis and cross-domain operations.');

		// Domain-specific links
		const linksList = quickStartContent.createEl('ul', { cls: 'crc-text-muted' });

		const peopleItem = linksList.createEl('li');
		peopleItem.appendText('For person-specific batch operations, see the ');
		const peopleLink = peopleItem.createEl('a', {
			text: 'People tab',
			href: '#',
			cls: 'crc-text-link'
		});
		peopleLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.showTab('people');
		});

		const placesItem = linksList.createEl('li');
		placesItem.appendText('For place-specific data quality, see the ');
		const placesLink = placesItem.createEl('a', {
			text: 'Places tab',
			href: '#',
			cls: 'crc-text-link'
		});
		placesLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.showTab('places');
		});

		const schemasItem = linksList.createEl('li');
		schemasItem.appendText('For schema validation, see the ');
		const schemasLink = schemasItem.createEl('a', {
			text: 'Schemas tab',
			href: '#',
			cls: 'crc-text-link'
		});
		schemasLink.addEventListener('click', (e) => {
			e.preventDefault();
			this.showTab('schemas');
		});

		// Cleanup Wizard button
		const wizardSection = quickStartContent.createDiv({ cls: 'crc-mt-3' });
		const wizardBtn = wizardSection.createEl('button', {
			cls: 'crc-btn crc-btn--primary'
		});
		const wizardIcon = wizardBtn.createSpan({ cls: 'crc-btn-icon' });
		setIcon(wizardIcon, 'sparkles');
		wizardBtn.createSpan({ text: 'Run Cleanup Wizard' });
		wizardBtn.addEventListener('click', () => {
			this.close();
			void import('./cleanup-wizard-modal').then(({ CleanupWizardModal }) => {
				new CleanupWizardModal(this.app, this.plugin).open();
			});
		});

		container.appendChild(quickStartCard);

		// Research Gaps Section (only when fact-level tracking is enabled)
		if (this.plugin.settings.trackFactSourcing) {
			this.renderResearchGapsSection(container);

			// Source Conflicts Section
			this.renderSourceConflictsSection(container);
		}

		// === VAULT-WIDE ANALYSIS ===
		const analysisCard = this.createCard({
			title: 'Vault-wide analysis',
			icon: 'search',
			subtitle: 'Comprehensive data quality report across all entities'
		});
		const analysisContent = analysisCard.querySelector('.crc-card__content') as HTMLElement;

		// Explanation
		const analysisExplanation = analysisContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		analysisExplanation.createEl('p', {
			text: 'Scan your genealogy data to identify data issues like missing dates, invalid values, ' +
				'circular relationships, and orphaned parent references.',
			cls: 'crc-text--small'
		});

		let selectedScope: 'all' | 'staging' | 'folder' = 'all';
		const selectedFolder = '';

		new Setting(analysisContent)
			.setName('Analysis scope')
			.setDesc('Choose which records to analyze')
			.addDropdown(dropdown => dropdown
				.addOption('all', 'All records (main tree)')
				.addOption('staging', 'Staging folder only')
				.setValue(selectedScope)
				.onChange(value => {
					selectedScope = value as 'all' | 'staging' | 'folder';
				})
			);

		// Results container (initially empty)
		const resultsContainer = analysisContent.createDiv({ cls: 'crc-data-quality-results' });

		// Run analysis button
		new Setting(analysisContent)
			.setName('Run analysis')
			.setDesc('Scan records for data quality issues')
			.addButton(button => button
				.setButtonText('Analyze')
				.setCta()
				.onClick(() => {
					this.runDataQualityAnalysis(resultsContainer, selectedScope, selectedFolder);
				}));

		container.appendChild(analysisCard);

		// === CROSS-DOMAIN BATCH OPERATIONS ===
		const batchCard = this.createCard({
			title: 'Cross-domain batch operations',
			icon: 'zap',
			subtitle: 'Standardization operations across all entity types'
		});
		const batchContent = batchCard.querySelector('.crc-card__content') as HTMLElement;

		// Explanation
		const batchExplanation = batchContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		batchExplanation.createEl('p', {
			text: 'These operations work across people, places, events, and sources. Use Preview to see what will change before applying. For entity-specific operations, see the domain tabs (People, Places, etc.).',
			cls: 'crc-text--small'
		});

		// Normalize dates
		new Setting(batchContent)
			.setName('Normalize date formats')
			.setDesc('Convert dates to standard YYYY-MM-DD format')
			.addButton(btn => btn
				.setButtonText('Preview')
				.onClick(() => {
					void this.previewBatchOperation('dates', selectedScope, selectedFolder);
				})
			)
			.addButton(btn => btn
				.setButtonText('Apply')
				.setCta()
				.onClick(() => void this.runBatchOperation('dates', selectedScope, selectedFolder))
			);

		// Normalize sex
		new Setting(batchContent)
			.setName('Normalize sex values')
			.setDesc('Standardize to M/F format. Uses biological sex to match historical records and GEDCOM standards.')
			.addButton(btn => btn
				.setButtonText('Preview')
				.onClick(() => void this.previewBatchOperation('sex', selectedScope, selectedFolder))
			)
			.addButton(btn => btn
				.setButtonText('Apply')
				.setCta()
				.onClick(() => void this.runBatchOperation('sex', selectedScope, selectedFolder))
			);

		// Clear orphan references
		new Setting(batchContent)
			.setName('Clear orphan references')
			.setDesc('Remove parent references that point to non-existent records')
			.addButton(btn => btn
				.setButtonText('Preview')
				.onClick(() => void this.previewBatchOperation('orphans', selectedScope, selectedFolder))
			)
			.addButton(btn => btn
				.setButtonText('Apply')
				.setWarning()
				.onClick(() => void this.runBatchOperation('orphans', selectedScope, selectedFolder))
			);

		// Repair missing relationship IDs
		new Setting(batchContent)
			.setName('Repair missing relationship IDs')
			.setDesc('Populate _id fields from resolvable wikilinks (e.g., father_id from father)')
			.addButton(btn => btn
				.setButtonText('Preview')
				.onClick(() => void this.previewBatchOperation('missing_ids', selectedScope, selectedFolder))
			)
			.addButton(btn => btn
				.setButtonText('Apply')
				.setCta()
				.onClick(() => void this.runBatchOperation('missing_ids', selectedScope, selectedFolder))
			);

		// Migrate legacy type property (only show if cr_type is the primary)
		if (this.plugin.settings.noteTypeDetection?.primaryTypeProperty === 'cr_type') {
			new Setting(batchContent)
				.setName('Migrate legacy type property')
				.setDesc('Convert type to cr_type for all Charted Roots notes')
				.addButton(btn => btn
					.setButtonText('Preview')
					.onClick(() => void this.previewBatchOperation('legacy_type', selectedScope, selectedFolder))
				)
				.addButton(btn => btn
					.setButtonText('Apply')
					.setCta()
					.onClick(() => void this.runBatchOperation('legacy_type', selectedScope, selectedFolder))
				);
		}

		// Flatten nested properties
		new Setting(batchContent)
			.setName('Flatten nested properties')
			.setDesc('Convert nested YAML (e.g., coordinates: { lat, long }) to flat properties')
			.addButton(btn => btn
				.setButtonText('Open')
				.setCta()
				.onClick(() => {
					new FlattenNestedPropertiesModal(this.app).open();
				})
			);

		container.appendChild(batchCard);

		// === DATA ENHANCEMENT ===
		// Data Enhancement card
		const enhancementCard = this.createCard({
			title: 'Data enhancement',
			icon: 'sparkles',
			subtitle: 'Create missing notes from existing data'
		});
		const enhancementContent = enhancementCard.querySelector('.crc-card__content') as HTMLElement;

		// Explanation
		const enhancementExplanation = enhancementContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		enhancementExplanation.createEl('p', {
			text: 'Enhance your notes by generating place notes from place strings in person and event notes. ' +
				'Useful for data imported from CSV, manually entered records, or vaults created before place notes were supported.',
			cls: 'crc-text--small'
		});

		// Generate place notes
		new Setting(enhancementContent)
			.setName('Generate place notes')
			.setDesc('Create place notes from place strings and update references to use wikilinks')
			.addButton(btn => btn
				.setButtonText('Open')
				.setCta()
				.onClick(() => {
					const placeGraph = new PlaceGraphService(this.app);
					new PlaceGeneratorModal(this.app, this.plugin.settings, {}, placeGraph).open();
				})
			);

		container.appendChild(enhancementCard);

		// Data Tools card
		const toolsCard = this.createCard({
			title: 'Data tools',
			icon: 'sliders',
			subtitle: 'Utility tools for managing your data'
		});
		const toolsContent = toolsCard.querySelector('.crc-card__content') as HTMLElement;

		// Explanation
		const toolsExplanation = toolsContent.createDiv({ cls: 'crc-info-callout crc-mb-3' });
		toolsExplanation.createEl('p', {
			text: 'Create Obsidian Bases to view and manage your data in spreadsheet-like table views.',
			cls: 'crc-text--small'
		});

		const baseTypes = [
			{ value: 'people', label: 'People', command: 'charted-roots:create-base-template' },
			{ value: 'places', label: 'Places', command: 'charted-roots:create-places-base-template' },
			{ value: 'events', label: 'Events', command: 'charted-roots:create-events-base-template' },
			{ value: 'organizations', label: 'Organizations', command: 'charted-roots:create-organizations-base-template' },
			{ value: 'sources', label: 'Sources', command: 'charted-roots:create-sources-base-template' },
			{ value: 'universes', label: 'Universes', command: 'charted-roots:create-universes-base-template' }
		];

		let selectedBaseType = baseTypes[0];

		new Setting(toolsContent)
			.setName('Create base')
			.setDesc('Create an Obsidian Base for managing your data in table view')
			.addDropdown(dropdown => dropdown
				.addOptions(Object.fromEntries(baseTypes.map(t => [t.value, t.label])))
				.setValue(selectedBaseType.value)
				.onChange(value => {
					selectedBaseType = baseTypes.find(t => t.value === value) || baseTypes[0];
				})
			)
			.addButton(btn => btn
				.setButtonText('Create')
				.setCta()
				.onClick(() => {
					this.close();
					this.app.commands.executeCommandById(selectedBaseType.command);
				})
			);

		// Bulk media linking
		new Setting(toolsContent)
			.setName('Bulk link media')
			.setDesc('Link media files to multiple entities (people, events, places, etc.) at once')
			.addButton(btn => btn
				.setButtonText('Open')
				.onClick(() => {
					new BulkMediaLinkModal(this.app, this.plugin).open();
				})
			);

		container.appendChild(toolsCard);
	}

	/**
	 * Run data quality analysis and display results
	 */
	private runDataQualityAnalysis(
		container: HTMLElement,
		scope: 'all' | 'staging' | 'folder',
		folderPath?: string
	): void {
		container.empty();

		// Show loading
		const loadingEl = container.createDiv({ cls: 'crc-loading' });
		loadingEl.createSpan({ text: 'Analyzing data quality...' });

		// Create service and run analysis
		const familyGraph = new FamilyGraphService(this.app);
		const folderFilter = new FolderFilterService(this.plugin.settings);
		familyGraph.setFolderFilter(folderFilter);
		familyGraph.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph.setValueAliases(this.plugin.settings.valueAliases);

		const dataQualityService = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph,
			folderFilter,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQualityService.setPersonIndex(this.plugin.personIndex);
		}

		// Run analysis (synchronous)
		const report = dataQualityService.analyze({
			scope,
			folderPath,
		});

		// Clear loading and show results
		container.empty();
		this.renderDataQualityReport(container, report);
	}

	/**
	 * Render data quality report
	 */
	private renderDataQualityReport(
		container: HTMLElement,
		report: DataQualityReport
	): void {
		const { summary, issues } = report;

		// Summary section
		const summarySection = container.createDiv({ cls: 'crc-dq-summary' });

		// Quality score
		const scoreEl = summarySection.createDiv({ cls: 'crc-dq-score' });
		const scoreValue = scoreEl.createDiv({ cls: 'crc-dq-score-value' });
		scoreValue.setText(String(summary.qualityScore));

		// Color based on score
		if (summary.qualityScore >= 80) {
			scoreValue.addClass('crc-dq-score--good');
		} else if (summary.qualityScore >= 50) {
			scoreValue.addClass('crc-dq-score--warning');
		} else {
			scoreValue.addClass('crc-dq-score--poor');
		}

		scoreEl.createDiv({ cls: 'crc-dq-score-label', text: 'Quality score' });

		// Stats grid
		const statsGrid = summarySection.createDiv({ cls: 'crc-dq-stats-grid' });

		this.renderDqStatCard(statsGrid, 'People analyzed', String(summary.totalPeople), 'users');
		this.renderDqStatCard(statsGrid, 'Total issues', String(summary.totalIssues), 'alert-circle');
		this.renderDqStatCard(statsGrid, 'Errors', String(summary.bySeverity.error), 'alert-triangle');
		this.renderDqStatCard(statsGrid, 'Warnings', String(summary.bySeverity.warning), 'alert-circle');

		// Completeness metrics
		const completenessSection = container.createDiv({ cls: 'crc-section' });
		completenessSection.createEl('h3', { text: 'Data completeness' });

		const completenessGrid = completenessSection.createDiv({ cls: 'crc-dq-completeness-grid' });

		const total = summary.totalPeople || 1; // Avoid division by zero
		this.renderCompletenessBar(completenessGrid, 'Birth date', summary.completeness.withBirthDate, total);
		this.renderCompletenessBar(completenessGrid, 'Death date', summary.completeness.withDeathDate, total);
		this.renderCompletenessBar(completenessGrid, 'Gender', summary.completeness.withGender, total);
		this.renderCompletenessBar(completenessGrid, 'Both parents', summary.completeness.withBothParents, total);
		this.renderCompletenessBar(completenessGrid, 'At least one parent', summary.completeness.withAtLeastOneParent, total);
		this.renderCompletenessBar(completenessGrid, 'Has spouse', summary.completeness.withSpouse, total);
		this.renderCompletenessBar(completenessGrid, 'Has children', summary.completeness.withChildren, total);

		// Issues by category
		if (issues.length > 0) {
			const issuesSection = container.createDiv({ cls: 'crc-section' });
			issuesSection.createEl('h3', { text: 'Issues found' });

			// Category filter
			const filterRow = issuesSection.createDiv({ cls: 'crc-dq-filter-row' });
			let selectedCategory: IssueCategory | 'all' = 'all';
			let selectedSeverity: IssueSeverity | 'all' = 'all';

			new Setting(filterRow)
				.setName('Category')
				.addDropdown(dropdown => dropdown
					.addOption('all', 'All categories')
					.addOption('date_inconsistency', 'Date issues')
					.addOption('relationship_inconsistency', 'Relationship issues')
					.addOption('missing_data', 'Missing data')
					.addOption('data_format', 'Format issues')
					.addOption('orphan_reference', 'Orphan references')
					.addOption('nested_property', 'Nested properties')
					.setValue(selectedCategory)
					.onChange(value => {
						selectedCategory = value as IssueCategory | 'all';
						this.renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity);
					})
				);

			new Setting(filterRow)
				.setName('Severity')
				.addDropdown(dropdown => dropdown
					.addOption('all', 'All severities')
					.addOption('error', 'Errors only')
					.addOption('warning', 'Warnings only')
					.addOption('info', 'Info only')
					.setValue(selectedSeverity)
					.onChange(value => {
						selectedSeverity = value as IssueSeverity | 'all';
						this.renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity);
					})
				);

			const issuesList = issuesSection.createDiv({ cls: 'crc-dq-issues-list' });
			this.renderIssuesList(issuesList, issues, selectedCategory, selectedSeverity);
		} else {
			const noIssuesEl = container.createDiv({ cls: 'crc-dq-no-issues' });
			setIcon(noIssuesEl.createSpan({ cls: 'crc-dq-no-issues-icon' }), 'check');
			noIssuesEl.createSpan({ text: 'No issues found! Your data looks great.' });
		}
	}

	/**
	 * Render a data quality stat card
	 */
	private renderDqStatCard(
		container: HTMLElement,
		label: string,
		value: string,
		icon: LucideIconName
	): void {
		const card = container.createDiv({ cls: 'crc-dq-stat-card' });
		const iconEl = card.createDiv({ cls: 'crc-dq-stat-icon' });
		setIcon(iconEl, icon);
		card.createDiv({ cls: 'crc-dq-stat-value', text: value });
		card.createDiv({ cls: 'crc-dq-stat-label', text: label });
	}

	/**
	 * Render a completeness bar
	 */
	private renderCompletenessBar(
		container: HTMLElement,
		label: string,
		count: number,
		total: number
	): void {
		const percent = Math.round((count / total) * 100);
		const row = container.createDiv({ cls: 'crc-dq-completeness-row' });

		row.createDiv({ cls: 'crc-dq-completeness-label', text: label });

		const barContainer = row.createDiv({ cls: 'crc-dq-completeness-bar-container' });
		const bar = barContainer.createDiv({ cls: 'crc-dq-completeness-bar' });
		bar.style.setProperty('width', `${percent}%`);

		// Color based on percentage
		if (percent >= 80) {
			bar.addClass('crc-dq-completeness-bar--good');
		} else if (percent >= 50) {
			bar.addClass('crc-dq-completeness-bar--warning');
		} else {
			bar.addClass('crc-dq-completeness-bar--poor');
		}

		row.createDiv({ cls: 'crc-dq-completeness-value', text: `${count}/${total} (${percent}%)` });
	}

	/**
	 * Render filtered issues list
	 */
	private renderIssuesList(
		container: HTMLElement,
		issues: DataQualityIssue[],
		category: IssueCategory | 'all',
		severity: IssueSeverity | 'all'
	): void {
		container.empty();

		const filtered = issues.filter(issue => {
			if (category !== 'all' && issue.category !== category) return false;
			if (severity !== 'all' && issue.severity !== severity) return false;
			return true;
		});

		if (filtered.length === 0) {
			container.createDiv({
				cls: 'crc-dq-no-matches',
				text: 'No issues match the selected filters.'
			});
			return;
		}

		// Show count
		container.createDiv({
			cls: 'crc-dq-issues-count',
			text: `Showing ${filtered.length} issue${filtered.length === 1 ? '' : 's'}`
		});

		// Render issues (limit to first 100 for performance)
		const displayIssues = filtered.slice(0, 100);
		for (const issue of displayIssues) {
			this.renderIssueItem(container, issue);
		}

		if (filtered.length > 100) {
			container.createDiv({
				cls: 'crc-dq-more-issues',
				text: `... and ${filtered.length - 100} more issues`
			});
		}
	}

	/**
	 * Render a single issue item
	 */
	private renderIssueItem(container: HTMLElement, issue: DataQualityIssue): void {
		const item = container.createDiv({ cls: `crc-dq-issue crc-dq-issue--${issue.severity}` });

		// Severity icon
		const iconEl = item.createDiv({ cls: 'crc-dq-issue-icon' });
		const iconName = issue.severity === 'error' ? 'alert-triangle' :
			issue.severity === 'warning' ? 'alert-circle' : 'info';
		setIcon(iconEl, iconName);

		// Content
		const content = item.createDiv({ cls: 'crc-dq-issue-content' });

		// Person name as clickable link
		const personLink = content.createEl('a', {
			cls: 'crc-dq-issue-person',
			text: issue.person.name
		});
		personLink.addEventListener('click', (e) => {
			e.preventDefault();
			// Open the person's file
			const file = issue.person.file;
			if (file) {
				void this.app.workspace.openLinkText(file.path, '', false);
				this.close();
			}
		});

		// Issue message
		content.createDiv({ cls: 'crc-dq-issue-message', text: issue.message });

		// Category badge
		const badge = item.createDiv({ cls: 'crc-dq-issue-badge' });
		badge.setText(this.formatCategoryName(issue.category));
	}

	/**
	 * Format category name for display
	 */
	private formatCategoryName(category: IssueCategory): string {
		const names: Record<IssueCategory, string> = {
			date_inconsistency: 'Date',
			relationship_inconsistency: 'Relationship',
			missing_data: 'Missing data',
			data_format: 'Format',
			orphan_reference: 'Orphan ref',
			nested_property: 'Nested',
			legacy_type_property: 'Legacy type',
			legacy_membership: 'Legacy membership',
		};
		return names[category] || category;
	}

	/**
	 * Preview a batch operation
	 */
	private async previewBatchOperation(
		operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
		scope: 'all' | 'staging' | 'folder',
		folderPath?: string
	): Promise<void> {
		// Create service
		const familyGraph = new FamilyGraphService(this.app);
		const folderFilter = new FolderFilterService(this.plugin.settings);
		familyGraph.setFolderFilter(folderFilter);
		familyGraph.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph.setValueAliases(this.plugin.settings.valueAliases);

		const dataQualityService = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph,
			folderFilter,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQualityService.setPersonIndex(this.plugin.personIndex);
		}

		// Get preview
		const preview = await dataQualityService.previewNormalization({ scope, folderPath });

		// Check if sex normalization is disabled
		const sexNormalizationDisabled = operation === 'sex' &&
			this.plugin.settings.sexNormalizationMode === 'disabled';

		// Show preview modal
		const modal = new BatchPreviewModal(
			this.app,
			operation,
			preview,
			async () => await this.runBatchOperation(operation, scope, folderPath),
			sexNormalizationDisabled
		);
		modal.open();
	}

	/**
	 * Run a batch operation
	 */
	private async runBatchOperation(
		operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
		scope: 'all' | 'staging' | 'folder',
		folderPath?: string
	): Promise<void> {
		// Create service
		const familyGraph = new FamilyGraphService(this.app);
		const folderFilter = new FolderFilterService(this.plugin.settings);
		familyGraph.setFolderFilter(folderFilter);
		familyGraph.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph.setValueAliases(this.plugin.settings.valueAliases);

		const dataQualityService = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph,
			folderFilter,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQualityService.setPersonIndex(this.plugin.personIndex);
		}

		let result: BatchOperationResult;
		let operationName: string;

		try {
			switch (operation) {
				case 'dates':
					operationName = 'Date normalization';
					result = await dataQualityService.normalizeDateFormats({ scope, folderPath });
					break;
				case 'sex':
					operationName = 'Sex normalization';
					result = await dataQualityService.normalizeGenderValues({ scope, folderPath });
					break;
				case 'orphans':
					operationName = 'Orphan reference clearing';
					result = await dataQualityService.clearOrphanReferences({ scope, folderPath });
					break;
				case 'legacy_type':
					operationName = 'Legacy type migration';
					result = await dataQualityService.migrateLegacyTypeProperty({ scope, folderPath });
					break;
				case 'missing_ids':
					operationName = 'Missing ID repair';
					result = await dataQualityService.repairMissingIds({ scope, folderPath });
					break;
			}

			// Show result
			if (result.modified > 0) {
				new Notice(`${operationName}: Modified ${result.modified} of ${result.processed} files`);
			} else {
				new Notice(`${operationName}: No changes needed`);
			}

			if (result.errors.length > 0) {
				new Notice(`${result.errors.length} errors occurred. Check console for details.`);
				console.error('Batch operation errors:', result.errors);
			}

			// Refresh the family graph cache
			await familyGraph.reloadCache();

		} catch (error) {
			new Notice(`${operation} failed: ${getErrorMessage(error)}`);
		}
	}

	/**
	 * Preview removing duplicate relationships
	 */
	private previewRemoveDuplicateRelationships(): void {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		const changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];

		for (const person of people) {
			const cache = this.app.metadataCache.getFileCache(person.file);
			if (!cache?.frontmatter) continue;

			const fm = cache.frontmatter as Record<string, unknown>;

			// Check spouse array for duplicates
			if (Array.isArray(fm.spouse) && fm.spouse.length > 1) {
				const unique = [...new Set(fm.spouse)];
				const dupCount = fm.spouse.length - unique.length;
				if (dupCount > 0) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field: 'spouse',
						oldValue: `${fm.spouse.length} ${fm.spouse.length === 1 ? 'entry' : 'entries'} (${dupCount} ${dupCount === 1 ? 'duplicate' : 'duplicates'})`,
						newValue: `${unique.length} ${unique.length === 1 ? 'entry' : 'entries'} (deduplicated)`,
						file: person.file
					});
				}
			}

			// Check spouse_id array for duplicates
			if (Array.isArray(fm.spouse_id) && fm.spouse_id.length > 1) {
				const unique = [...new Set(fm.spouse_id)];
				const dupCount = fm.spouse_id.length - unique.length;
				if (dupCount > 0) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field: 'spouse_id',
						oldValue: `${fm.spouse_id.length} ${fm.spouse_id.length === 1 ? 'entry' : 'entries'} (${dupCount} ${dupCount === 1 ? 'duplicate' : 'duplicates'})`,
						newValue: `${unique.length} ${unique.length === 1 ? 'entry' : 'entries'} (deduplicated)`,
						file: person.file
					});
				}
			}

			// Check children/child arrays for duplicates
			const childrenArray = fm.children || fm.child;
			if (Array.isArray(childrenArray) && childrenArray.length > 1) {
				const unique = [...new Set(childrenArray)];
				const dupCount = childrenArray.length - unique.length;
				if (dupCount > 0) {
					const fieldName = fm.children ? 'children' : 'child';
					changes.push({
						person: { name: person.name || 'Unknown' },
						field: fieldName,
						oldValue: `${childrenArray.length} ${childrenArray.length === 1 ? 'entry' : 'entries'} (${dupCount} ${dupCount === 1 ? 'duplicate' : 'duplicates'})`,
						newValue: `${unique.length} ${unique.length === 1 ? 'entry' : 'entries'} (deduplicated)`,
						file: person.file
					});
				}
			}

			// Check children_id array for duplicates
			if (Array.isArray(fm.children_id) && fm.children_id.length > 1) {
				const unique = [...new Set(fm.children_id)];
				const dupCount = fm.children_id.length - unique.length;
				if (dupCount > 0) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field: 'children_id',
						oldValue: `${fm.children_id.length} ${fm.children_id.length === 1 ? 'entry' : 'entries'} (${dupCount} ${dupCount === 1 ? 'duplicate' : 'duplicates'})`,
						newValue: `${unique.length} ${unique.length === 1 ? 'entry' : 'entries'} (deduplicated)`,
						file: person.file
					});
				}
			}
		}

		if (changes.length === 0) {
			new Notice('No duplicate relationships found');
			return;
		}

		// Show preview modal
		const modal = new DuplicateRelationshipsPreviewModal(
			this.app,
			changes,
			async () => await this.removeDuplicateRelationships()
		);
		modal.open();
	}

	/**
	 * Remove duplicate relationships
	 */
	private async removeDuplicateRelationships(): Promise<void> {
		new Notice('Removing duplicate relationships...');

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		let modified = 0;
		const errors: string[] = [];

		for (const person of people) {

			try {
				const cache = this.app.metadataCache.getFileCache(person.file);
				if (!cache?.frontmatter) continue;

				const fm = cache.frontmatter as Record<string, unknown>;
				let hasChanges = false;

				await this.app.fileManager.processFrontMatter(person.file, (frontmatter) => {
					// Deduplicate spouse array
					if (Array.isArray(fm.spouse) && fm.spouse.length > 1) {
						const unique = [...new Set(fm.spouse)];
						if (unique.length < fm.spouse.length) {
							frontmatter.spouse = unique;
							hasChanges = true;
						}
					}

					// Deduplicate spouse_id array
					if (Array.isArray(fm.spouse_id) && fm.spouse_id.length > 1) {
						const unique = [...new Set(fm.spouse_id)];
						if (unique.length < fm.spouse_id.length) {
							frontmatter.spouse_id = unique;
							hasChanges = true;
						}
					}

					// Deduplicate and normalize children arrays
					// Prefer 'children' (plural), migrate from 'child' (legacy) if present
					const childrenArray = fm.children || fm.child;
					if (Array.isArray(childrenArray) && childrenArray.length > 0) {
						const unique = [...new Set(childrenArray)];
						// Always write to 'children' (preferred name)
						frontmatter.children = unique.length === 1 ? unique[0] : unique;
						// Remove legacy 'child' property if present
						if (fm.child) {
							delete frontmatter.child;
							hasChanges = true;
						}
						if (unique.length < childrenArray.length) {
							hasChanges = true;
						}
					}

					// Deduplicate children_id array
					if (Array.isArray(fm.children_id) && fm.children_id.length > 1) {
						const unique = [...new Set(fm.children_id)];
						if (unique.length < fm.children_id.length) {
							frontmatter.children_id = unique;
							hasChanges = true;
						}
					}
				});

				if (hasChanges) {
					modified++;
				}
			} catch (error) {
				errors.push(`${person.file.path}: ${getErrorMessage(error)}`);
			}
		}

		// Show result
		if (modified > 0) {
			new Notice(`✓ Removed duplicates from ${modified} ${modified === 1 ? 'file' : 'files'}`);
		} else {
			new Notice('No duplicate relationships found');
		}

		if (errors.length > 0) {
			new Notice(`⚠ ${errors.length} errors occurred. Check console for details.`);
			console.error('Remove duplicates errors:', errors);
		}

		// Refresh the family graph cache
		await familyGraph.reloadCache();

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview removing empty/placeholder values
	 */
	private previewRemovePlaceholders(): void {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		const changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];

		// Common placeholder patterns (actual placeholder text, not empty values)
		const placeholderPatterns = [
			'(unknown)',
			'(Unknown)',
			'unknown',
			'Unknown',
			'UNKNOWN',
			'N/A',
			'n/a',
			'???',
			'...',
			'Empty',
			'empty',
			'EMPTY',
			'None',
			'none',
			'NONE',
		];

		const isPlaceholder = (value: unknown): boolean => {
			// Note: null, undefined, and empty strings are NOT placeholders - they're
			// intentionally empty fields, which is valid for optional properties.
			// We only flag actual placeholder text like "Unknown", "N/A", etc.
			if (value === null || value === undefined) return false;
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed === '') return false;
				if (placeholderPatterns.includes(trimmed)) return true;
				// Check for malformed wikilinks like "[[unknown) ]]"
				if (/^\[\[.*?\)\s*\]\]$/.test(trimmed)) return true;
				// Check for strings that are just commas and spaces
				if (/^[,\s]+$/.test(trimmed)) return true;
			}
			return false;
		};

		const cleanPlaceValue = (value: string): string | null => {
			// Handle comma-separated values like ", , , Canada"
			const parts = value.split(',').map(p => p.trim()).filter(p => p && !isPlaceholder(p));
			if (parts.length === 0) return null;
			return parts.join(', ');
		};

		for (const person of people) {
			const cache = this.app.metadataCache.getFileCache(person.file);
			if (!cache?.frontmatter) continue;

			const fm = cache.frontmatter as Record<string, unknown>;

			// Check name field
			if (fm.name && isPlaceholder(fm.name)) {
				changes.push({
					person: { name: person.name || 'Unknown' },
					field: 'name',
					oldValue: String(fm.name as string),
					newValue: '(remove field)',
					file: person.file
				});
			}

			// Check place fields with comma cleanup
			const placeFields = ['birth_place', 'death_place', 'burial_place', 'residence'];
			for (const field of placeFields) {
				const value = fm[field];
				if (typeof value === 'string' && value.trim()) {
					const cleaned = cleanPlaceValue(value);
					if (cleaned === null) {
						// Entirely placeholder
						changes.push({
							person: { name: person.name || 'Unknown' },
							field,
							oldValue: value,
							newValue: '(remove field)',
							file: person.file
						});
					} else if (cleaned !== value) {
						// Has cleanup needed
						changes.push({
							person: { name: person.name || 'Unknown' },
							field,
							oldValue: value,
							newValue: cleaned,
							file: person.file
						});
					}
				} else if (field in fm && isPlaceholder(value)) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field,
						oldValue: String(value),
						newValue: '(remove field)',
						file: person.file
					});
				}
			}

			// Check relationship fields (spouse, father, mother, child/children)
			const relationshipFields = ['spouse', 'father', 'mother', 'child', 'children'];
			for (const field of relationshipFields) {
				const value = fm[field];
				if (Array.isArray(value)) {
					// Check if array contains only placeholders
					const nonPlaceholders = value.filter(v => !isPlaceholder(v));
					if (nonPlaceholders.length === 0 && value.length > 0) {
						changes.push({
							person: { name: person.name || 'Unknown' },
							field,
							oldValue: `[${value.length} placeholder ${value.length === 1 ? 'entry' : 'entries'}]`,
							newValue: '(remove field)',
							file: person.file
						});
					} else if (nonPlaceholders.length < value.length) {
						changes.push({
							person: { name: person.name || 'Unknown' },
							field,
							oldValue: `${value.length} entries (${value.length - nonPlaceholders.length} placeholders)`,
							newValue: `${nonPlaceholders.length} entries (cleaned)`,
							file: person.file
						});
					}
				} else if (field in fm && isPlaceholder(value)) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field,
						oldValue: String(value),
						newValue: '(remove field)',
						file: person.file
					});
				}
			}

			// Note: Empty parent/spouse fields (null, undefined, '') are intentionally
			// NOT flagged as issues - they represent unknown/missing data which is valid.
		}

		if (changes.length === 0) {
			new Notice('No placeholder values found');
			return;
		}

		// Show preview modal
		const modal = new PlaceholderRemovalPreviewModal(
			this.app,
			changes,
			async () => await this.removePlaceholders()
		);
		modal.open();
	}

	/**
	 * Remove empty/placeholder values
	 */
	private async removePlaceholders(): Promise<void> {
		new Notice('Removing placeholder values...');

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		let modified = 0;
		const errors: string[] = [];

		// Common placeholder patterns (actual placeholder text, not empty values)
		const placeholderPatterns = [
			'(unknown)',
			'(Unknown)',
			'unknown',
			'Unknown',
			'UNKNOWN',
			'N/A',
			'n/a',
			'???',
			'...',
			'Empty',
			'empty',
			'EMPTY',
			'None',
			'none',
			'NONE',
		];

		const isPlaceholder = (value: unknown): boolean => {
			// Note: null, undefined, and empty strings are NOT placeholders - they're
			// intentionally empty fields, which is valid for optional properties.
			// We only flag actual placeholder text like "Unknown", "N/A", etc.
			if (value === null || value === undefined) return false;
			if (typeof value === 'string') {
				const trimmed = value.trim();
				if (trimmed === '') return false;
				if (placeholderPatterns.includes(trimmed)) return true;
				// Check for malformed wikilinks like "[[unknown) ]]"
				if (/^\[\[.*?\)\s*\]\]$/.test(trimmed)) return true;
				// Check for strings that are just commas and spaces
				if (/^[,\s]+$/.test(trimmed)) return true;
			}
			return false;
		};

		const cleanPlaceValue = (value: string): string | null => {
			// Handle comma-separated values like ", , , Canada"
			const parts = value.split(',').map(p => p.trim()).filter(p => p && !isPlaceholder(p));
			if (parts.length === 0) return null;
			return parts.join(', ');
		};

		for (const person of people) {

			try {
				const cache = this.app.metadataCache.getFileCache(person.file);
				if (!cache?.frontmatter) continue;

				let hasChanges = false;

				await this.app.fileManager.processFrontMatter(person.file, (frontmatter) => {
					// Remove placeholder name
					if (frontmatter.name && isPlaceholder(frontmatter.name)) {
						delete frontmatter.name;
						hasChanges = true;
					}

					// Clean or remove place fields
					const placeFields = ['birth_place', 'death_place', 'burial_place', 'residence'];
					for (const field of placeFields) {
						const value = frontmatter[field];
						if (typeof value === 'string' && value.trim()) {
							const cleaned = cleanPlaceValue(value);
							if (cleaned === null) {
								delete frontmatter[field];
								hasChanges = true;
							} else if (cleaned !== value) {
								frontmatter[field] = cleaned;
								hasChanges = true;
							}
						} else if (field in frontmatter && isPlaceholder(value)) {
							delete frontmatter[field];
							hasChanges = true;
						}
					}

					// Clean relationship arrays or remove if all placeholders
					const relationshipFields = ['spouse', 'child', 'children'];
					for (const field of relationshipFields) {
						const value = frontmatter[field];
						if (Array.isArray(value)) {
							const nonPlaceholders = value.filter(v => !isPlaceholder(v));
							if (nonPlaceholders.length === 0) {
								delete frontmatter[field];
								hasChanges = true;
							} else if (nonPlaceholders.length < value.length) {
								frontmatter[field] = nonPlaceholders;
								hasChanges = true;
							}
						} else if (field in frontmatter && isPlaceholder(value)) {
							delete frontmatter[field];
							hasChanges = true;
						}
					}

					// Remove placeholder parent fields
					const parentFields = ['father', 'mother'];
					for (const field of parentFields) {
						if (field in frontmatter && isPlaceholder(frontmatter[field])) {
							delete frontmatter[field];
							hasChanges = true;
						}
					}
				});

				if (hasChanges) {
					modified++;
				}
			} catch (error) {
				errors.push(`${person.file.path}: ${getErrorMessage(error)}`);
			}
		}

		// Show result
		if (modified > 0) {
			new Notice(`✓ Removed placeholders from ${modified} ${modified === 1 ? 'file' : 'files'}`);
		} else {
			new Notice('No placeholder values found');
		}

		if (errors.length > 0) {
			new Notice(`⚠ ${errors.length} errors occurred. Check console for details.`);
			console.error('Remove placeholders errors:', errors);
		}

		// Wait for file system to sync before reloading
		// Brief delay to ensure all file writes are complete
		if (modified > 0) {
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		// Refresh the family graph cache
		await familyGraph.reloadCache();

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview adding cr_type: person to person notes
	 */
	private previewAddPersonType(): void {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		console.debug(`[DEBUG] previewAddPersonType: Found ${people.length} people from getAllPeople()`);

		const changes: Array<{ person: { name: string }; file: TFile }> = [];

		for (const person of people) {
			const cache = this.app.metadataCache.getFileCache(person.file);
			if (!cache?.frontmatter) continue;

			const fm = cache.frontmatter as Record<string, unknown>;

			// Check if cr_type already exists
			if (!fm.cr_type) {
				changes.push({
					person: { name: person.name || 'Unknown' },
					file: person.file
				});
			}
		}

		console.debug(`[DEBUG] previewAddPersonType: Found ${changes.length} people needing cr_type`);

		// Show preview modal
		new AddPersonTypePreviewModal(
			this.app,
			changes,
			async () => await this.addPersonType()
		).open();
	}

	/**
	 * Add cr_type: person to all person notes
	 */
	private async addPersonType(): Promise<void> {
		new Notice('Adding cr_type property...');

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		let modified = 0;
		const errors: string[] = [];

		for (const person of people) {

			try {
				const cache = this.app.metadataCache.getFileCache(person.file);
				if (!cache?.frontmatter) continue;

				let hasChanges = false;

				await this.app.fileManager.processFrontMatter(person.file, (frontmatter) => {
					// Add cr_type if it doesn't exist
					if (!frontmatter.cr_type) {
						frontmatter.cr_type = 'person';
						hasChanges = true;
					}
				});

				if (hasChanges) {
					modified++;
				}
			} catch (error) {
				errors.push(`${person.file.path}: ${getErrorMessage(error)}`);
			}
		}

		// Show result
		if (modified > 0) {
			new Notice(`✓ Added cr_type property to ${modified} ${modified === 1 ? 'file' : 'files'}`);
		} else {
			new Notice('All person notes already have cr_type property');
		}

		if (errors.length > 0) {
			new Notice(`⚠ ${errors.length} errors occurred. Check console for details.`);
			console.error('Add person type errors:', errors);
		}

		// Refresh the family graph cache
		await familyGraph.reloadCache();

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview name formatting normalization
	 */
	private previewNormalizeNames(): void {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		const changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];

		/**
		 * Normalize a name to proper Title Case with smart handling of prefixes
		 */
		const normalizeName = (name: string): string | null => {
			if (!name || typeof name !== 'string') return null;

			// Trim and collapse multiple spaces
			const cleaned = name.trim().replace(/\s+/g, ' ');
			if (!cleaned) return null;

			// Helper function to normalize a single word/segment
			const normalizeWord = (word: string, isFirstWord: boolean): string => {
				if (!word) return word;

				const lowerWord = word.toLowerCase();

				// Preserve initials (A., B., A.B., H.G., etc.)
				// Matches patterns like "A.", "A.B.", "H.G.", etc.
				if (/^([a-z]\.)+$/i.test(word)) {
					return word.toUpperCase();
				}

				// Preserve Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
				if (/^[ivx]+$/i.test(word)) {
					return word.toUpperCase();
				}

				// Common surname prefixes that should stay lowercase (unless at start)
				const lowercasePrefixes = ['van', 'von', 'de', 'del', 'della', 'di', 'da', 'le', 'la', 'den', 'der', 'ten', 'ter', 'du'];
				if (!isFirstWord && lowercasePrefixes.includes(lowerWord)) {
					return lowerWord;
				}

				// Handle Mac prefix (but not "Mack" as a standalone name)
				// Only apply if there are at least 2 more letters after "Mac"
				if (lowerWord.startsWith('mac') && word.length > 5) {
					return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
				}

				// Handle Mc prefix
				if (lowerWord.startsWith('mc') && word.length > 2) {
					return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
				}

				// Handle O' prefix
				if (lowerWord.startsWith("o'") && word.length > 2) {
					return "O'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
				}

				// Handle hyphenated names (Abdul-Aziz, Mary-Jane, etc.)
				if (word.includes('-')) {
					return word.split('-')
						.map(part => normalizeWord(part, false))
						.join('-');
				}

				// Standard title case
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			};

			// Split by spaces to get words
			const words = cleaned.split(' ');
			const normalized = words.map((word, index) => {
				// Handle parentheses - preserve content inside and apply title case
				if (word.startsWith('(') && word.endsWith(')')) {
					const inner = word.slice(1, -1);
					return '(' + normalizeWord(inner, false) + ')';
				}

				// Handle opening parenthesis
				if (word.startsWith('(')) {
					const inner = word.slice(1);
					return '(' + normalizeWord(inner, index === 0);
				}

				// Handle closing parenthesis
				if (word.endsWith(')')) {
					const inner = word.slice(0, -1);
					return normalizeWord(inner, false) + ')';
				}

				return normalizeWord(word, index === 0);
			});

			const result = normalized.join(' ');

			// Only return if it's different from the input
			return result !== cleaned ? result : null;
		};

		for (const person of people) {
			const cache = this.app.metadataCache.getFileCache(person.file);
			if (!cache?.frontmatter) continue;

			const fm = cache.frontmatter as Record<string, unknown>;

			// Check name field
			if (fm.name && typeof fm.name === 'string') {
				const normalized = normalizeName(fm.name);
				if (normalized) {
					changes.push({
						person: { name: person.name || 'Unknown' },
						field: 'name',
						oldValue: fm.name,
						newValue: normalized,
						file: person.file
					});
				}
			}
		}

		if (changes.length === 0) {
			new Notice('No names need normalization');
			return;
		}

		const modal = new NameNormalizationPreviewModal(
			this.app,
			changes,
			async () => await this.normalizeNames()
		);
		modal.open();
	}

	/**
	 * Apply name formatting normalization
	 */
	private async normalizeNames(): Promise<void> {
		new Notice('Normalizing name formatting...');

		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();
		const people = familyGraph.getAllPeople();

		let modified = 0;
		const errors: string[] = [];

		/**
		 * Normalize a name to proper Title Case with smart handling of prefixes
		 */
		const normalizeName = (name: string): string | null => {
			if (!name || typeof name !== 'string') return null;

			// Trim and collapse multiple spaces
			const cleaned = name.trim().replace(/\s+/g, ' ');
			if (!cleaned) return null;

			// Helper function to normalize a single word/segment
			const normalizeWord = (word: string, isFirstWord: boolean): string => {
				if (!word) return word;

				const lowerWord = word.toLowerCase();

				// Preserve initials (A., B., A.B., H.G., etc.)
				// Matches patterns like "A.", "A.B.", "H.G.", etc.
				if (/^([a-z]\.)+$/i.test(word)) {
					return word.toUpperCase();
				}

				// Preserve Roman numerals (I, II, III, IV, V, VI, VII, VIII, IX, X, etc.)
				if (/^[ivx]+$/i.test(word)) {
					return word.toUpperCase();
				}

				// Common surname prefixes that should stay lowercase (unless at start)
				const lowercasePrefixes = ['van', 'von', 'de', 'del', 'della', 'di', 'da', 'le', 'la', 'den', 'der', 'ten', 'ter', 'du'];
				if (!isFirstWord && lowercasePrefixes.includes(lowerWord)) {
					return lowerWord;
				}

				// Handle Mac prefix (but not "Mack" as a standalone name)
				// Only apply if there are at least 2 more letters after "Mac"
				if (lowerWord.startsWith('mac') && word.length > 5) {
					return 'Mac' + word.charAt(3).toUpperCase() + word.slice(4).toLowerCase();
				}

				// Handle Mc prefix
				if (lowerWord.startsWith('mc') && word.length > 2) {
					return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
				}

				// Handle O' prefix
				if (lowerWord.startsWith("o'") && word.length > 2) {
					return "O'" + word.charAt(2).toUpperCase() + word.slice(3).toLowerCase();
				}

				// Handle hyphenated names (Abdul-Aziz, Mary-Jane, etc.)
				if (word.includes('-')) {
					return word.split('-')
						.map(part => normalizeWord(part, false))
						.join('-');
				}

				// Standard title case
				return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
			};

			// Split by spaces to get words
			const words = cleaned.split(' ');
			const normalized = words.map((word, index) => {
				// Handle parentheses - preserve content inside and apply title case
				if (word.startsWith('(') && word.endsWith(')')) {
					const inner = word.slice(1, -1);
					return '(' + normalizeWord(inner, false) + ')';
				}

				// Handle opening parenthesis
				if (word.startsWith('(')) {
					const inner = word.slice(1);
					return '(' + normalizeWord(inner, index === 0);
				}

				// Handle closing parenthesis
				if (word.endsWith(')')) {
					const inner = word.slice(0, -1);
					return normalizeWord(inner, false) + ')';
				}

				return normalizeWord(word, index === 0);
			});

			const result = normalized.join(' ');

			// Only return if it's different from the input
			return result !== cleaned ? result : null;
		};

		for (const person of people) {

			try {
				const cache = this.app.metadataCache.getFileCache(person.file);
				if (!cache?.frontmatter) continue;

				const fm = cache.frontmatter as Record<string, unknown>;
				let hasChanges = false;

				await this.app.fileManager.processFrontMatter(person.file, (frontmatter) => {
					// Normalize name field
					if (fm.name && typeof fm.name === 'string') {
						const normalized = normalizeName(fm.name);
						if (normalized) {
							frontmatter.name = normalized;
							hasChanges = true;
						}
					}
				});

				if (hasChanges) {
					modified++;
				}
			} catch (error) {
				errors.push(`${person.file.path}: ${getErrorMessage(error)}`);
			}
		}

		// Show result
		if (modified > 0) {
			new Notice(`✓ Normalized names in ${modified} ${modified === 1 ? 'file' : 'files'}`);
		} else {
			new Notice('No names needed normalization');
		}

		if (errors.length > 0) {
			new Notice(`⚠ ${errors.length} errors occurred. Check console for details.`);
			console.error('Normalize names errors:', errors);
		}

		// Refresh the family graph cache
		await familyGraph.reloadCache();

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview orphaned cr_id reference removal
	 */
	private previewRemoveOrphanedRefs(): void {
		const changes: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }> = [];

		// Build a map of all valid cr_ids
		const validCrIds = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const crId = cache?.frontmatter?.cr_id;
			if (crId && typeof crId === 'string') {
				validCrIds.add(crId);
			}
		}

		// Check each person for orphaned references
		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter?.cr_id) continue;

			const fm = cache.frontmatter as Record<string, unknown>;
			const personName = (fm.name as string) || file.basename;

			// Check father_id
			const fatherId = fm.father_id;
			if (fatherId && typeof fatherId === 'string' && !validCrIds.has(fatherId)) {
				changes.push({
					person: { name: personName, file },
					field: 'father_id',
					orphanedId: fatherId
				});
			}

			// Check mother_id
			const motherId = fm.mother_id;
			if (motherId && typeof motherId === 'string' && !validCrIds.has(motherId)) {
				changes.push({
					person: { name: personName, file },
					field: 'mother_id',
					orphanedId: motherId
				});
			}

			// Check spouse_id (can be string or array)
			const spouseId = fm.spouse_id;
			if (spouseId) {
				const spouseIds = Array.isArray(spouseId) ? spouseId : [spouseId];
				for (const id of spouseIds) {
					if (typeof id === 'string' && !validCrIds.has(id)) {
						changes.push({
							person: { name: personName, file },
							field: 'spouse_id',
							orphanedId: id
						});
					}
				}
			}

			// Check partners_id (alias for spouse_id)
			const partnersId = fm.partners_id;
			if (partnersId) {
				const partnerIds = Array.isArray(partnersId) ? partnersId : [partnersId];
				for (const id of partnerIds) {
					if (typeof id === 'string' && !validCrIds.has(id)) {
						changes.push({
							person: { name: personName, file },
							field: 'partners_id',
							orphanedId: id
						});
					}
				}
			}

			// Check children_id (can be string or array)
			const childrenId = fm.children_id;
			if (childrenId) {
				const childrenIds = Array.isArray(childrenId) ? childrenId : [childrenId];
				for (const id of childrenIds) {
					if (typeof id === 'string' && !validCrIds.has(id)) {
						changes.push({
							person: { name: personName, file },
							field: 'children_id',
							orphanedId: id
						});
					}
				}
			}
		}

		if (changes.length === 0) {
			new Notice('No orphaned cr_id references found');
			return;
		}

		const modal = new OrphanedRefsPreviewModal(
			this.app,
			changes,
			async () => await this.removeOrphanedRefs()
		);
		modal.open();
	}

	/**
	 * Remove orphaned cr_id references
	 */
	private async removeOrphanedRefs(): Promise<void> {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();

		let modified = 0;
		const errors: Array<{ file: string; error: string }> = [];

		new Notice('Removing orphaned cr_id references...');

		// Build a map of all valid cr_ids
		const validCrIds = new Set<string>();
		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			const crId = cache?.frontmatter?.cr_id;
			if (crId && typeof crId === 'string') {
				validCrIds.add(crId);
			}
		}

		// Process each file
		for (const file of files) {

			try {
				const cache = this.app.metadataCache.getFileCache(file);
				if (!cache?.frontmatter?.cr_id) continue;

				let hasChanges = false;

				await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
					// Clean father_id
					if (frontmatter.father_id && typeof frontmatter.father_id === 'string') {
						if (!validCrIds.has(frontmatter.father_id)) {
							delete frontmatter.father_id;
							hasChanges = true;
						}
					}

					// Clean mother_id
					if (frontmatter.mother_id && typeof frontmatter.mother_id === 'string') {
						if (!validCrIds.has(frontmatter.mother_id)) {
							delete frontmatter.mother_id;
							hasChanges = true;
						}
					}

					// Clean spouse_id
					if (frontmatter.spouse_id) {
						const spouseIds = Array.isArray(frontmatter.spouse_id)
							? frontmatter.spouse_id
							: [frontmatter.spouse_id];
						const validSpouseIds = spouseIds.filter((id: unknown) =>
							typeof id === 'string' && validCrIds.has(id)
						);

						if (validSpouseIds.length !== spouseIds.length) {
							if (validSpouseIds.length === 0) {
								delete frontmatter.spouse_id;
							} else if (validSpouseIds.length === 1) {
								frontmatter.spouse_id = validSpouseIds[0];
							} else {
								frontmatter.spouse_id = validSpouseIds;
							}
							hasChanges = true;
						}
					}

					// Clean partners_id
					if (frontmatter.partners_id) {
						const partnerIds = Array.isArray(frontmatter.partners_id)
							? frontmatter.partners_id
							: [frontmatter.partners_id];
						const validPartnerIds = partnerIds.filter((id: unknown) =>
							typeof id === 'string' && validCrIds.has(id)
						);

						if (validPartnerIds.length !== partnerIds.length) {
							if (validPartnerIds.length === 0) {
								delete frontmatter.partners_id;
							} else if (validPartnerIds.length === 1) {
								frontmatter.partners_id = validPartnerIds[0];
							} else {
								frontmatter.partners_id = validPartnerIds;
							}
							hasChanges = true;
						}
					}

					// Clean children_id
					if (frontmatter.children_id) {
						const childrenIds = Array.isArray(frontmatter.children_id)
							? frontmatter.children_id
							: [frontmatter.children_id];
						const validChildrenIds = childrenIds.filter((id: unknown) =>
							typeof id === 'string' && validCrIds.has(id)
						);

						if (validChildrenIds.length !== childrenIds.length) {
							if (validChildrenIds.length === 0) {
								delete frontmatter.children_id;
							} else if (validChildrenIds.length === 1) {
								frontmatter.children_id = validChildrenIds[0];
							} else {
								frontmatter.children_id = validChildrenIds;
							}
							hasChanges = true;
						}
					}
				});

				if (hasChanges) {
					modified++;
				}
			} catch (error) {
				errors.push({
					file: file.path,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		if (modified > 0) {
			new Notice(`✓ Removed orphaned references from ${modified} ${modified === 1 ? 'file' : 'files'}`);
		} else {
			new Notice('No orphaned cr_id references found');
		}

		if (errors.length > 0) {
			new Notice(`⚠ ${errors.length} errors occurred. Check console for details.`);
			console.error('Remove orphaned refs errors:', errors);
		}

		// Refresh the family graph cache
		await familyGraph.reloadCache();

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview fixing bidirectional relationship inconsistencies
	 */
	private async previewFixBidirectionalRelationships(): Promise<void> {
		// Create folder filter and family graph service
		const folderFilter1 = new FolderFilterService(this.plugin.settings);
		const familyGraph1 = this.plugin.createFamilyGraphService();
		// Force reload to ensure we have fresh data (cache may be stale after previous fixes)
		await familyGraph1.reloadCache();
		familyGraph1.setFolderFilter(folderFilter1);
		familyGraph1.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph1.setValueAliases(this.plugin.settings.valueAliases);

		const dataQuality1 = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph1,
			folderFilter1,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQuality1.setPersonIndex(this.plugin.personIndex);
		}

		new Notice('Detecting bidirectional relationship inconsistencies...');

		const inconsistencies = dataQuality1.detectBidirectionalInconsistencies();

		if (inconsistencies.length === 0) {
			new Notice('No bidirectional relationship inconsistencies found');
			return;
		}

		// Separate fixable inconsistencies from conflicts
		const fixableInconsistencies = inconsistencies.filter(i => i.type !== 'conflicting-parent-claim');
		const conflictCount = inconsistencies.filter(i => i.type === 'conflicting-parent-claim').length;

		// Notify about conflicts (handled separately in People tab)
		if (conflictCount > 0) {
			new Notice(`Found ${conflictCount} parent claim conflict${conflictCount === 1 ? '' : 's'}. See the "Parent claim conflicts" card in the People tab to resolve.`, 8000);
		}

		if (fixableInconsistencies.length === 0) {
			if (conflictCount > 0) {
				new Notice('No auto-fixable inconsistencies found. Only conflicts requiring manual resolution.');
			}
			return;
		}

		// Transform fixable inconsistencies to modal format
		const changes = fixableInconsistencies.map((issue: BidirectionalInconsistency) => ({
			person: {
				name: issue.person.name || issue.person.file.basename,
				file: issue.person.file
			},
			relatedPerson: {
				name: issue.relatedPerson.name || issue.relatedPerson.file.basename,
				file: issue.relatedPerson.file
			},
			type: issue.type,
			description: issue.description
		}));

		const modal = new BidirectionalInconsistencyPreviewModal(
			this.app,
			changes,
			async () => await this.fixBidirectionalRelationships()
		);
		modal.open();
	}

	/**
	 * Fix bidirectional relationship inconsistencies
	 */
	private async fixBidirectionalRelationships(): Promise<void> {
		// Create folder filter and family graph service
		const folderFilter2 = new FolderFilterService(this.plugin.settings);
		const familyGraph2 = this.plugin.createFamilyGraphService();
		// Force reload to ensure we have fresh data before fixing
		await familyGraph2.reloadCache();
		familyGraph2.setFolderFilter(folderFilter2);
		familyGraph2.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph2.setValueAliases(this.plugin.settings.valueAliases);

		const dataQuality2 = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph2,
			folderFilter2,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQuality2.setPersonIndex(this.plugin.personIndex);
		}

		new Notice('Detecting inconsistencies...');

		const inconsistencies = dataQuality2.detectBidirectionalInconsistencies();

		if (inconsistencies.length === 0) {
			new Notice('No bidirectional relationship inconsistencies found');
			return;
		}

		new Notice('Fixing bidirectional relationship inconsistencies...');

		// Suspend automatic bidirectional linking during batch operation
		// to prevent interference with our updates
		this.plugin.bidirectionalLinker?.suspend();

		try {
			const result = await dataQuality2.fixBidirectionalInconsistencies(inconsistencies);

			if (result.modified > 0) {
				new Notice(`✓ Fixed ${result.modified} of ${result.processed} inconsistenc${result.processed === 1 ? 'y' : 'ies'}. Wait a moment before re-checking.`, 5000);
			} else {
				new Notice('No inconsistencies were fixed');
			}

			if (result.errors.length > 0) {
				new Notice(`⚠ ${result.errors.length} errors occurred. Check console for details.`);
				console.error('Fix bidirectional relationships errors:', result.errors);
			}

			// Wait for all pending file watcher events to process before resuming linker
			// This prevents the bidirectional linker from reverting our fixes
			await new Promise(resolve => setTimeout(resolve, 500));
		} finally {
			// Always resume bidirectional linking, even if errors occurred
			this.plugin.bidirectionalLinker?.resume();
		}

		// Refresh the People tab
		this.showTab('people');
	}

	/**
	 * Preview impossible dates detection
	 */
	private previewDetectImpossibleDates(): void {
		const folderFilter3 = new FolderFilterService(this.plugin.settings);
		const familyGraph3 = this.plugin.createFamilyGraphService();
		familyGraph3.ensureCacheLoaded();
		familyGraph3.setFolderFilter(folderFilter3);
		familyGraph3.setPropertyAliases(this.plugin.settings.propertyAliases);
		familyGraph3.setValueAliases(this.plugin.settings.valueAliases);

		const dataQuality3 = new DataQualityService(
			this.app,
			this.plugin.settings,
			familyGraph3,
			folderFilter3,
			this.plugin
		);
		if (this.plugin.personIndex) {
			dataQuality3.setPersonIndex(this.plugin.personIndex);
		}

		const issues = dataQuality3.detectImpossibleDates();

		// Transform to modal format
		const previewItems = issues.map((issue: ImpossibleDateIssue) => ({
			person: {
				name: issue.person.name || issue.person.file.basename,
				file: issue.person.file
			},
			relatedPerson: issue.relatedPerson ? {
				name: issue.relatedPerson.name || issue.relatedPerson.file.basename,
				file: issue.relatedPerson.file
			} : undefined,
			type: issue.type,
			description: issue.description,
			personDate: issue.personDate,
			relatedDate: issue.relatedDate
		}));

		// Open modal
		const modal = new ImpossibleDatesPreviewModal(this.app, previewItems);
		modal.open();
	}

	/**
	 * Preview date format validation
	 */
	private previewValidateDates(): void {
		const familyGraph = this.plugin.createFamilyGraphService();
		familyGraph.ensureCacheLoaded();

		const issues: Array<{
			file: TFile;
			name: string;
			field: string;
			value: string;
			issue: string;
		}> = [];

		new Notice('Analyzing date formats...');

		const files = this.app.vault.getMarkdownFiles();

		for (const file of files) {
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter?.cr_id) continue;

			const fm = cache.frontmatter as Record<string, unknown>;
			const name = (fm.name as string) || file.basename;

			// Skip fictional dates (they have fc-calendar property)
			if (fm['fc-calendar']) continue;

			// Check born/birth_date field
			const born = fm.born || fm.birth_date;
			if (born && typeof born === 'string') {
				const issue = this.validateDateFormat(born);
				if (issue) {
					issues.push({
						file,
						name,
						field: fm.born ? 'born' : 'birth_date',
						value: born,
						issue
					});
				}
			}

			// Check died/death_date field
			const died = fm.died || fm.death_date;
			if (died && typeof died === 'string') {
				const issue = this.validateDateFormat(died);
				if (issue) {
					issues.push({
						file,
						name,
						field: fm.died ? 'died' : 'death_date',
						value: died,
						issue
					});
				}
			}
		}

		if (issues.length === 0) {
			new Notice('✓ All dates are valid according to your validation settings');
			return;
		}

		// Show preview modal
		new DateValidationPreviewModal(this.app, this.plugin, issues).open();
	}

	/**
	 * Validate a date string according to current settings
	 * @returns Issue description if invalid, null if valid
	 */
	private validateDateFormat(dateStr: string): string | null {
		const settings = this.plugin.settings;
		const trimmed = dateStr.trim();

		// Check for circa dates
		const circaPrefixes = ['c.', 'ca.', 'circa', '~'];
		const hasCirca = circaPrefixes.some(prefix =>
			trimmed.toLowerCase().startsWith(prefix) ||
			trimmed.toLowerCase().startsWith(prefix + ' ')
		);

		if (hasCirca && !settings.allowCircaDates) {
			return 'Circa dates not allowed (check "Allow circa dates" setting)';
		}

		// Remove circa prefix for further validation
		let cleanDate = trimmed;
		if (hasCirca) {
			for (const prefix of circaPrefixes) {
				if (cleanDate.toLowerCase().startsWith(prefix)) {
					cleanDate = cleanDate.slice(prefix.length).trim();
					break;
				}
				if (cleanDate.toLowerCase().startsWith(prefix + ' ')) {
					cleanDate = cleanDate.slice(prefix.length + 1).trim();
					break;
				}
			}
		}

		// Check for date ranges
		const hasRange = cleanDate.includes(' to ') ||
			(cleanDate.includes('-') && cleanDate.split('-').length === 3 && cleanDate.split('-')[2].length === 4);

		if (hasRange && !settings.allowDateRanges) {
			return 'Date ranges not allowed (check "Allow date ranges" setting)';
		}

		// If it's a range, validate each part separately
		if (hasRange) {
			const parts = cleanDate.includes(' to ')
				? cleanDate.split(' to ')
				: cleanDate.split('-').slice(0, 2);

			for (const part of parts) {
				const partIssue = this.validateSingleDate(part.trim());
				if (partIssue) return partIssue;
			}
			return null;
		}

		// Validate single date
		return this.validateSingleDate(cleanDate);
	}

	/**
	 * Validate a single date (not a range) according to current settings
	 */
	private validateSingleDate(dateStr: string): string | null {
		const settings = this.plugin.settings;

		// ISO 8601 format: YYYY-MM-DD or YYYY-MM or YYYY
		const iso8601Full = /^(\d{4})-(\d{2})-(\d{2})$/;
		const iso8601Month = /^(\d{4})-(\d{2})$/;
		const iso8601Year = /^(\d{4})$/;
		const iso8601NoZeros = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

		// GEDCOM format: DD MMM YYYY or DD MMM or MMM YYYY
		const gedcomFull = /^(\d{1,2})\s+(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})$/i;
		const gedcomMonth = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+(\d{4})$/i;

		// Check for standard: ISO 8601
		if (settings.dateFormatStandard === 'iso8601') {
			// Check if leading zeros are required
			if (settings.requireLeadingZeros) {
				if (iso8601Full.test(dateStr)) return null;
				if (settings.allowPartialDates && iso8601Month.test(dateStr)) return null;
				if (settings.allowPartialDates && iso8601Year.test(dateStr)) return null;
				return 'ISO 8601 format required with leading zeros (YYYY-MM-DD)';
			} else {
				if (iso8601Full.test(dateStr) || iso8601NoZeros.test(dateStr)) return null;
				if (settings.allowPartialDates && (iso8601Month.test(dateStr) || iso8601Year.test(dateStr))) return null;
				return 'ISO 8601 format required (YYYY-MM-DD or YYYY-M-D)';
			}
		}

		// Check for standard: GEDCOM
		if (settings.dateFormatStandard === 'gedcom') {
			if (gedcomFull.test(dateStr)) return null;
			if (settings.allowPartialDates && gedcomMonth.test(dateStr)) return null;
			if (settings.allowPartialDates && iso8601Year.test(dateStr)) return null;
			return 'GEDCOM format required (DD MMM YYYY, e.g., 15 JAN 1920)';
		}

		// Flexible standard: accept multiple formats
		if (settings.dateFormatStandard === 'flexible') {
			// Accept ISO 8601 formats
			if (iso8601Full.test(dateStr) || (!settings.requireLeadingZeros && iso8601NoZeros.test(dateStr))) return null;
			if (settings.allowPartialDates && (iso8601Month.test(dateStr) || iso8601Year.test(dateStr))) return null;

			// Accept GEDCOM formats
			if (gedcomFull.test(dateStr)) return null;
			if (settings.allowPartialDates && gedcomMonth.test(dateStr)) return null;

			// If we got here, the format is not recognized
			return 'Unrecognized date format (expected YYYY-MM-DD or DD MMM YYYY)';
		}

		return 'Unknown date format standard';
	}

	/**
	 * Apply date format validation (currently just shows preview)
	 * Note: We don't auto-correct dates as this could introduce errors
	 */
	private validateDates(): void {
		new Notice('Date validation is preview-only. Review issues and manually correct dates in your notes.');
		this.previewValidateDates();
	}

	// =========================================================================
	// RECENT CANVAS TREES HELPERS
	// =========================================================================

	/**
	 * Open a canvas tree file
	 */
	private async openCanvasTree(canvasPath: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(canvasPath);
		if (file instanceof TFile) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
			this.close();
		} else {
			new Notice(`Canvas file not found: ${canvasPath}`);
		}
	}

	/**
	 * Show context menu for a recent canvas tree
	 */
	private showRecentTreeContextMenu(event: MouseEvent, tree: RecentTreeInfo): void {
		const menu = new Menu();

		// Open in new tab
		menu.addItem((item) => {
			item.setTitle('Open')
				.setIcon('external-link')
				.onClick(() => {
					void this.openCanvasTree(tree.canvasPath);
				});
		});

		// Open in new tab
		menu.addItem((item) => {
			item.setTitle('Open in new tab')
				.setIcon('plus')
				.onClick(() => {
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
						if (file instanceof TFile) {
							const leaf = this.app.workspace.getLeaf('tab');
							await leaf.openFile(file);
						} else {
							new Notice(`Canvas file not found: ${tree.canvasPath}`);
						}
					})();
				});
		});

		menu.addSeparator();

		// Regenerate canvas
		menu.addItem((item) => {
			item.setTitle('Regenerate')
				.setIcon('refresh-cw')
				.onClick(() => {
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
						if (file instanceof TFile) {
							await this.plugin.regenerateCanvas(file);
							new Notice('Canvas regenerated');
						} else {
							new Notice(`Canvas file not found: ${tree.canvasPath}`);
						}
					})();
				});
		});

		// Reveal in navigation
		menu.addItem((item) => {
			item.setTitle('Reveal in navigation')
				.setIcon('folder')
				.onClick(() => {
					const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
					if (file instanceof TFile) {
						// Trigger file explorer reveal
						void this.app.workspace.revealLeaf(
							this.app.workspace.getLeavesOfType('file-explorer')[0]
						);
						// Use internal API to reveal file if available
						const fileExplorer = this.app.workspace.getLeavesOfType('file-explorer')[0];
						if (fileExplorer && 'view' in fileExplorer) {
							const view = fileExplorer.view as { revealInFolder?: (file: TFile) => void };
							if (view.revealInFolder) {
								view.revealInFolder(file);
							}
						}
					} else {
						new Notice(`Canvas file not found: ${tree.canvasPath}`);
					}
				});
		});

		menu.addSeparator();

		// Remove from recent
		menu.addItem((item) => {
			item.setTitle('Remove from recent')
				.setIcon('x')
				.onClick(() => {
					void (async () => {
						if (this.plugin.settings.recentTrees) {
							this.plugin.settings.recentTrees = this.plugin.settings.recentTrees.filter(
								t => t.canvasPath !== tree.canvasPath
							);
							await this.plugin.saveSettings();
							// Refresh the tab
							this.showTab(this.activeTab);
							new Notice('Removed from recent trees');
						}
					})();
				});
		});

		// Delete canvas file
		menu.addItem((item) => {
			item.setTitle('Delete canvas')
				.setIcon('trash-2')
				.onClick(() => {
					void (async () => {
						const file = this.app.vault.getAbstractFileByPath(tree.canvasPath);
						if (file instanceof TFile) {
							// Confirm deletion
							const confirmed = await new Promise<boolean>((resolve) => {
								const modal = new ConfirmationModal(
									this.app,
									'Delete Canvas Tree',
									`Are you sure you want to delete "${tree.canvasName}"? This action cannot be undone.`,
									(result) => resolve(result)
								);
								modal.open();
							});

							if (confirmed) {
								await this.app.fileManager.trashFile(file);
								// Remove from recent trees
								if (this.plugin.settings.recentTrees) {
									this.plugin.settings.recentTrees = this.plugin.settings.recentTrees.filter(
										t => t.canvasPath !== tree.canvasPath
									);
									await this.plugin.saveSettings();
								}
								// Refresh the tab
								this.showTab(this.activeTab);
								new Notice('Canvas deleted');
							}
						} else {
							new Notice(`Canvas file not found: ${tree.canvasPath}`);
						}
					})();
				});
		});

		menu.showAtMouseEvent(event);
	}
}

/**
 * Modal for previewing duplicate relationship removal
 */
class DuplicateRelationshipsPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('Preview: Remove duplicate relationships');

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by name...',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Field filter dropdown (only show if multiple fields)
		const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
		if (uniqueFields.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: 'All fields', value: 'all' });
			for (const field of uniqueFields.sort()) {
				filterSelect.createEl('option', { text: field, value: field });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedField = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Field' });
		headerRow.createEl('th', { text: 'Current' });
		headerRow.createEl('th', { text: 'After' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' Backup your vault before proceeding. This operation will modify existing notes.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `Apply ${this.allChanges.length} change${this.allChanges.length === 1 ? '' : 's'}`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = 'Applying changes...';

				// Run the operation
				await this.onApply();

				// Close the modal after completion (like BuildPlaceHierarchyModal)
				// This avoids stale cache issues when user reopens the preview
				this.close();
			})();
		});
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery && !change.person.name.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `Found ${this.allChanges.length} duplicate relationship ${this.allChanges.length === 1 ? 'entry' : 'entries'} across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} duplicate entries:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			// Old value with strikethrough
			const oldCell = row.createEl('td', { cls: 'crc-batch-old-value' });
			oldCell.createEl('s', { text: change.oldValue, cls: 'crc-text--muted' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons (inline)
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new tab' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new window' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '5');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing placeholder value removal
 */
class PlaceholderRemovalPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('Preview: Remove placeholder values');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: 'This operation removes common placeholder values from GEDCOM imports and data entry mistakes:'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'Placeholder text: (unknown), Unknown, N/A, ???, Empty, None' });
		useCases.createEl('li', { text: 'Malformed wikilinks: [[unknown) ]] with mismatched brackets' });
		useCases.createEl('li', { text: 'Leading commas in places: ", , , Canada" → "Canada"' });
		useCases.createEl('li', { text: 'Empty parent/spouse fields showing as "Empty"' });

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by name...',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Field filter dropdown (only show if multiple fields)
		const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
		if (uniqueFields.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: 'All fields', value: 'all' });
			for (const field of uniqueFields.sort()) {
				filterSelect.createEl('option', { text: field, value: field });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedField = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Field' });
		headerRow.createEl('th', { text: 'Current' });
		headerRow.createEl('th', { text: 'After' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' Backup your vault before proceeding. This operation will modify existing notes.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `Apply ${this.allChanges.length} change${this.allChanges.length === 1 ? '' : 's'}`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = 'Applying changes...';

				// Run the operation
				await this.onApply();

				// Close the modal after completion (like BuildPlaceHierarchyModal)
				// This avoids stale cache issues when user reopens the preview
				this.close();
			})();
		});
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery && !change.person.name.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `Found ${this.allChanges.length} placeholder ${this.allChanges.length === 1 ? 'value' : 'values'} across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} placeholder values:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			row.createEl('td', { text: change.oldValue, cls: 'crc-batch-old-value' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new tab' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new window' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '5');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing name formatting normalization
 */
class NameNormalizationPreviewModal extends Modal {
	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>;
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string; file: TFile }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('Preview: Normalize name formatting');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: 'This operation standardizes name capitalization and handles surname prefixes:'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'ALL CAPS names: "JOHN SMITH" → "John Smith"' });
		useCases.createEl('li', { text: 'Lowercase names: "john doe" → "John Doe"' });
		useCases.createEl('li', { text: 'Mac/Mc prefixes: "macdonald" → "MacDonald", "mccarthy" → "McCarthy"' });
		useCases.createEl('li', { text: "O' prefix: \"o'brien\" → \"O'Brien\"" });
		useCases.createEl('li', { text: 'Dutch/German prefixes: "Vincent Van Gogh" → "Vincent van Gogh"' });
		useCases.createEl('li', { text: 'Multiple spaces collapsed to single space' });

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by name...',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Current name' });
		headerRow.createEl('th', { text: 'Normalized name' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' Backup your vault before proceeding. This operation will modify existing notes.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `Apply ${this.allChanges.length} change${this.allChanges.length === 1 ? '' : 's'}`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = 'Applying changes...';

				// Run the operation
				await this.onApply();

				// Close the modal after completion (like BuildPlaceHierarchyModal)
				// This avoids stale cache issues when user reopens the preview
				this.close();
			})();
		});
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery && !change.person.name.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `Found ${this.allChanges.length} ${this.allChanges.length === 1 ? 'name' : 'names'} to normalize across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} names:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.oldValue, cls: 'crc-batch-old-value' });
			row.createEl('td', { text: change.newValue, cls: 'crc-batch-new-value' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in new tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new tab' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('tab').openFile(change.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new window' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing orphaned cr_id reference removal
 */
class OrphanedRefsPreviewModal extends Modal {
	private allChanges: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }>;
	private filteredChanges: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{ person: { name: string; file: TFile }; field: string; orphanedId: string }>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.filteredChanges = [...changes];
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		this.modalEl.addClass('crc-batch-preview-modal');
		titleEl.setText('Preview: Remove orphaned cr_id references');

		// Description with use cases
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: 'This operation removes broken relationship references (cr_id values) that point to deleted or non-existent person notes:'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'father_id, mother_id: Parent references' });
		useCases.createEl('li', { text: 'spouse_id, partners_id: Spouse/partner references' });
		useCases.createEl('li', { text: 'children_id: Child references' });
		description.createEl('p', {
			text: 'Note: Only the _id fields are cleaned. Wikilink references (father, mother, spouse, children) are left unchanged.',
			cls: 'crc-text--muted'
		});

		// Search input
		const searchContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by person name or orphaned ID...',
			cls: 'crc-search-input'
		});
		searchInput.addEventListener('input', (e) => {
			this.searchQuery = (e.target as HTMLInputElement).value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Field filter dropdown
		const filterContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		filterContainer.createSpan({ text: 'Filter by field: ', cls: 'crc-filter-label' });
		const fieldSelect = filterContainer.createEl('select', { cls: 'dropdown' });

		const fields = ['all', 'father_id', 'mother_id', 'spouse_id', 'partners_id', 'children_id'];
		fields.forEach(field => {
			const option = fieldSelect.createEl('option', {
				value: field,
				text: field === 'all' ? 'All fields' : field
			});
			if (field === this.selectedField) {
				option.selected = true;
			}
		});

		fieldSelect.addEventListener('change', (e) => {
			this.selectedField = (e.target as HTMLSelectElement).value;
			this.applyFiltersAndSort();
		});

		// Sort toggle
		const sortContainer = contentEl.createDiv({ cls: 'crc-filter-container' });
		const sortButton = sortContainer.createEl('button', {
			text: `Sort: ${this.sortAscending ? 'A-Z' : 'Z-A'}`,
			cls: 'crc-btn-secondary'
		});
		sortButton.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortButton.textContent = `Sort: ${this.sortAscending ? 'A-Z' : 'Z-A'}`;
			this.applyFiltersAndSort();
		});

		// Count display
		this.countEl = contentEl.createDiv({ cls: 'crc-batch-count' });

		// Table
		const tableContainer = contentEl.createDiv({ cls: 'crc-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-table' });

		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Field' });
		headerRow.createEl('th', { text: 'Orphaned ID' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' Backup your vault before proceeding. This operation will modify existing notes.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `Apply ${this.allChanges.length} change${this.allChanges.length === 1 ? '' : 's'}`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = 'Applying changes...';

				// Run the operation
				await this.onApply();

				// Close the modal after completion (like BuildPlaceHierarchyModal)
				// This avoids stale cache issues when user reopens the preview
				this.close();
			})();
		});
	}

	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery) {
				const matchesSearch =
					change.person.name.toLowerCase().includes(this.searchQuery) ||
					change.orphanedId.toLowerCase().includes(this.searchQuery);
				if (!matchesSearch) return false;
			}

			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}

			return true;
		});

		// Sort
		this.filteredChanges.sort((a, b) => {
			const comparison = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? comparison : -comparison;
		});

		// Render
		this.renderTable();
	}

	private renderTable(): void {
		if (!this.tbody || !this.countEl) return;

		// Update count
		this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} orphaned reference${this.allChanges.length === 1 ? '' : 's'}`;

		// Clear table
		this.tbody.empty();

		// Render rows
		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field, cls: 'crc-field-name' });
			row.createEl('td', { text: change.orphanedId, cls: 'crc-monospace' });

			// Action buttons
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open in tab button
			const openTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in tab' }
			});
			const fileIcon = createLucideIcon('file-text', 14);
			openTabBtn.appendChild(fileIcon);
			openTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open in new window button
			const openWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': 'Open note in new window' }
			});
			const windowIcon = createLucideIcon('external-link', 14);
			openWindowBtn.appendChild(windowIcon);
			openWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});
		}

		// Empty state
		if (this.filteredChanges.length === 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: this.searchQuery || this.selectedField !== 'all'
					? 'No orphaned references match your filters'
					: 'No orphaned references found',
				cls: 'crc-text--muted'
			});
			cell.colSpan = 4;
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing bidirectional relationship inconsistencies
 */
class BidirectionalInconsistencyPreviewModal extends Modal {
	private allChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson: { name: string; file: TFile };
		type: string;
		description: string;
	}>;
	private filteredChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson: { name: string; file: TFile };
		type: string;
		description: string;
	}> = [];
	private onApply: () => Promise<void>;

	// Filter state
	private searchQuery = '';
	private selectedType = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{
			person: { name: string; file: TFile };
			relatedPerson: { name: string; file: TFile };
			type: string;
			description: string;
		}>,
		onApply: () => Promise<void>
	) {
		super(app);
		this.allChanges = changes;
		this.onApply = onApply;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('Preview: Fix bidirectional relationship inconsistencies');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: 'This operation fixes one-way relationships by adding the missing reciprocal links:'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'Parent lists child, but child doesn\'t list parent' });
		useCases.createEl('li', { text: 'Child lists parent, but parent doesn\'t list child' });
		useCases.createEl('li', { text: 'Person A lists Person B as spouse, but B doesn\'t list A' });

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by name...',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Type filter dropdown
		const uniqueTypes = [...new Set(this.allChanges.map(c => c.type))];
		if (uniqueTypes.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: 'All types', value: 'all' });
			for (const type of uniqueTypes.sort()) {
				const displayText = type
					.replace('missing-child-in-parent', 'Missing child in parent')
					.replace('missing-parent-in-child', 'Missing parent in child')
					.replace('missing-spouse-in-spouse', 'Missing spouse link');
				filterSelect.createEl('option', { text: displayText, value: type });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedType = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Related person' });
		headerRow.createEl('th', { text: 'Issue' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Backup warning
		const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warning.appendChild(warningIcon);
		warning.createSpan({
			text: ' Backup your vault before proceeding. This operation will add missing relationship links to notes.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelButton.addEventListener('click', () => this.close());

		const applyButton = buttonContainer.createEl('button', {
			text: `Fix ${this.allChanges.length} inconsistenc${this.allChanges.length === 1 ? 'y' : 'ies'}`,
			cls: 'mod-cta'
		});
		applyButton.addEventListener('click', () => {
			void (async () => {
				// Disable buttons during operation
				applyButton.disabled = true;
				cancelButton.disabled = true;
				applyButton.textContent = 'Fixing inconsistencies...';

				// Run the operation
				await this.onApply();

				// Close modal after completion
				this.close();
			})();
		});
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery) {
				const personMatch = change.person.name.toLowerCase().includes(this.searchQuery);
				const relatedMatch = change.relatedPerson.name.toLowerCase().includes(this.searchQuery);
				if (!personMatch && !relatedMatch) {
					return false;
				}
			}
			// Type filter
			if (this.selectedType !== 'all' && change.type !== this.selectedType) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `Found ${this.allChanges.length} inconsistenc${this.allChanges.length === 1 ? 'y' : 'ies'} across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} inconsistencies:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.relatedPerson.name });
			row.createEl('td', { text: change.description });

			// Action buttons cell
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open person in tab
			const openPersonTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.person.name} in tab` }
			});
			const fileIcon1 = createLucideIcon('file-text', 14);
			openPersonTabBtn.appendChild(fileIcon1);
			openPersonTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open person in new window
			const openPersonWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.person.name} in new window` }
			});
			const windowIcon1 = createLucideIcon('external-link', 14);
			openPersonWindowBtn.appendChild(windowIcon1);
			openPersonWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});

			// Separator
			actionCell.createSpan({ text: ' ', cls: 'crc-batch-actions-separator' });

			// Open related person in tab
			const openRelatedTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.relatedPerson.name} in tab` }
			});
			const fileIcon2 = createLucideIcon('file-text', 14);
			openRelatedTabBtn.appendChild(fileIcon2);
			openRelatedTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.relatedPerson.file);
			});

			// Open related person in new window
			const openRelatedWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.relatedPerson.name} in new window` }
			});
			const windowIcon2 = createLucideIcon('external-link', 14);
			openRelatedWindowBtn.appendChild(windowIcon2);
			openRelatedWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.relatedPerson.file);
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing impossible date issues
 */
class ImpossibleDatesPreviewModal extends Modal {
	private allChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson?: { name: string; file: TFile };
		type: string;
		description: string;
	}>;
	private filteredChanges: Array<{
		person: { name: string; file: TFile };
		relatedPerson?: { name: string; file: TFile };
		type: string;
		description: string;
	}> = [];

	// Filter state
	private searchQuery = '';
	private selectedType = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		changes: Array<{
			person: { name: string; file: TFile };
			relatedPerson?: { name: string; file: TFile };
			type: string;
			description: string;
		}>
	) {
		super(app);
		this.allChanges = changes;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		titleEl.setText('Preview: Impossible date issues');

		// Description
		const description = contentEl.createDiv({ cls: 'crc-batch-description' });
		description.createEl('p', {
			text: 'This preview shows logical date errors that need manual review and correction:'
		});
		const useCases = description.createEl('ul');
		useCases.createEl('li', { text: 'Birth after death or death before birth' });
		useCases.createEl('li', { text: 'Unrealistic lifespans (>120 years)' });
		useCases.createEl('li', { text: 'Parents born after children or children born after parent death' });
		useCases.createEl('li', { text: 'Parents too young at child\'s birth (<10 years)' });

		const warningNote = contentEl.createDiv({ cls: 'crc-warning-callout' });
		const warningIcon = createLucideIcon('alert-triangle', 16);
		warningNote.appendChild(warningIcon);
		warningNote.createSpan({
			text: ' This is a preview-only tool. Review the issues and manually correct the dates in the affected notes.'
		});

		// Count display
		this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

		// Controls row: search + filter + sort
		const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Search by name...',
			cls: 'crc-batch-search-input'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndSort();
		});

		// Type filter dropdown
		const uniqueTypes = [...new Set(this.allChanges.map(c => c.type))];
		if (uniqueTypes.length > 1) {
			const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
			const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
			filterSelect.createEl('option', { text: 'All types', value: 'all' });
			for (const type of uniqueTypes.sort()) {
				const displayText = type
					.replace('birth-after-death', 'Birth after death')
					.replace('unrealistic-lifespan', 'Unrealistic lifespan')
					.replace('parent-born-after-child', 'Parent born after child')
					.replace('parent-died-before-child', 'Parent died before child')
					.replace('parent-too-young', 'Parent too young')
					.replace('child-born-after-parent-death', 'Child born after parent death');
				filterSelect.createEl('option', { text: displayText, value: type });
			}
			filterSelect.addEventListener('change', () => {
				this.selectedType = filterSelect.value;
				this.applyFiltersAndSort();
			});
		}

		// Sort toggle
		const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
		const sortBtn = sortContainer.createEl('button', {
			text: 'A→Z',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
			this.applyFiltersAndSort();
		});

		// Scrollable table container
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });

		// Header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Related person' });
		headerRow.createEl('th', { text: 'Issue' });
		headerRow.createEl('th', { text: 'Actions' });

		this.tbody = table.createEl('tbody');

		// Initial render
		this.applyFiltersAndSort();

		// Close button
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });
		const closeButton = buttonContainer.createEl('button', {
			text: 'Close',
			cls: 'mod-cta'
		});
		closeButton.addEventListener('click', () => this.close());
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery) {
				const personMatch = change.person.name.toLowerCase().includes(this.searchQuery);
				const relatedMatch = change.relatedPerson?.name.toLowerCase().includes(this.searchQuery);
				if (!personMatch && !relatedMatch) {
					return false;
				}
			}
			// Type filter
			if (this.selectedType !== 'all' && change.type !== this.selectedType) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			const peopleCount = new Set(this.allChanges.map(c => c.person.name)).size;
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `Found ${this.allChanges.length} issue${this.allChanges.length === 1 ? '' : 's'} across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} issues:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const row = this.tbody.createEl('tr');
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.relatedPerson?.name || '—' });
			row.createEl('td', { text: change.description });

			// Action buttons cell
			const actionCell = row.createEl('td', { cls: 'crc-batch-actions crc-batch-actions--inline' });

			// Open person in tab
			const openPersonTabBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.person.name} in tab` }
			});
			const fileIcon1 = createLucideIcon('file-text', 14);
			openPersonTabBtn.appendChild(fileIcon1);
			openPersonTabBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(change.person.file);
			});

			// Open person in new window
			const openPersonWindowBtn = actionCell.createEl('button', {
				cls: 'crc-batch-action-btn clickable-icon',
				attr: { 'aria-label': `Open ${change.person.name} in new window` }
			});
			const windowIcon1 = createLucideIcon('external-link', 14);
			openPersonWindowBtn.appendChild(windowIcon1);
			openPersonWindowBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf('window').openFile(change.person.file);
			});

			// If there's a related person, add buttons for them too
			if (change.relatedPerson) {
				// Separator
				actionCell.createSpan({ text: ' ', cls: 'crc-batch-actions-separator' });

				// Open related person in tab
				const openRelatedTabBtn = actionCell.createEl('button', {
					cls: 'crc-batch-action-btn clickable-icon',
					attr: { 'aria-label': `Open ${change.relatedPerson.name} in tab` }
				});
				const fileIcon2 = createLucideIcon('file-text', 14);
				openRelatedTabBtn.appendChild(fileIcon2);
				openRelatedTabBtn.addEventListener('click', () => {
					void this.app.workspace.getLeaf().openFile(change.relatedPerson!.file);
				});

				// Open related person in new window
				const openRelatedWindowBtn = actionCell.createEl('button', {
					cls: 'crc-batch-action-btn clickable-icon',
					attr: { 'aria-label': `Open ${change.relatedPerson.name} in new window` }
				});
				const windowIcon2 = createLucideIcon('external-link', 14);
				openRelatedWindowBtn.appendChild(windowIcon2);
				openRelatedWindowBtn.addEventListener('click', () => {
					void this.app.workspace.getLeaf('window').openFile(change.relatedPerson!.file);
				});
			}
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

/**
 * Modal for previewing batch operation changes
 */
class BatchPreviewModal extends Modal {
	private operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids';
	private preview: NormalizationPreview;
	private onApply: () => Promise<void>;
	private sexNormalizationDisabled: boolean;

	// All changes for this operation
	private allChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string }> = [];
	// Filtered/sorted changes for display
	private filteredChanges: Array<{ person: { name: string }; field: string; oldValue: string; newValue: string }> = [];

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		operation: 'dates' | 'sex' | 'orphans' | 'legacy_type' | 'missing_ids',
		preview: NormalizationPreview,
		onApply: () => Promise<void>,
		sexNormalizationDisabled = false
	) {
		super(app);
		this.operation = operation;
		this.preview = preview;
		this.onApply = onApply;
		this.sexNormalizationDisabled = sexNormalizationDisabled;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		// Add modal class for sizing
		this.modalEl.addClass('crc-batch-preview-modal');

		// Set title based on operation
		const titles: Record<string, string> = {
			dates: 'Preview: Date normalization',
			sex: 'Preview: Sex normalization',
			orphans: 'Preview: Clear orphan references',
			legacy_type: 'Preview: Migrate legacy type property',
			missing_ids: 'Preview: Repair missing relationship IDs',
		};
		titleEl.setText(titles[this.operation]);

		// Add operation-specific descriptions
		if (this.operation === 'sex') {
			contentEl.createEl('p', {
				text: 'Genealogical records use biological sex (M/F) rather than gender identity, as historical documents and DNA analysis require this distinction.',
				cls: 'crc-text-muted crc-text-small'
			});

			// Show disabled mode warning
			if (this.sexNormalizationDisabled) {
				const disabledWarning = contentEl.createDiv({ cls: 'crc-info-callout' });
				const infoIcon = createLucideIcon('info', 16);
				disabledWarning.appendChild(infoIcon);
				disabledWarning.createSpan({
					text: ' Sex normalization is disabled. The preview below shows what would be changed, but no changes will be applied. Change this in Settings → Charted Roots → Sex & gender.'
				});
			}
		} else if (this.operation === 'missing_ids') {
			contentEl.createEl('p', {
				text: 'Populates missing _id fields by resolving wikilinks to their cr_id values. This improves relationship reliability when notes are renamed.',
				cls: 'crc-text-muted crc-text-small'
			});

			// Show unresolvable wikilinks warning if any
			if (this.preview.unresolvableWikilinks.length > 0) {
				const warningDiv = contentEl.createDiv({ cls: 'crc-warning-callout' });
				const warningIcon = createLucideIcon('alert-triangle', 16);
				warningDiv.appendChild(warningIcon);
				warningDiv.createSpan({
					text: ` ${this.preview.unresolvableWikilinks.length} wikilink(s) could not be resolved (broken links, ambiguous targets, or targets missing cr_id). These will be skipped.`
				});
			}
		}

		// Get changes for this operation
		switch (this.operation) {
			case 'dates':
				this.allChanges = [...this.preview.dateNormalization];
				break;
			case 'sex':
				this.allChanges = [...this.preview.genderNormalization];
				break;
			case 'orphans':
				this.allChanges = [...this.preview.orphanClearing];
				break;
			case 'legacy_type':
				this.allChanges = [...this.preview.legacyTypeMigration];
				break;
			case 'missing_ids':
				// Convert MissingIdRepair to the standard change format
				this.allChanges = this.preview.missingIdRepairs.map(repair => ({
					person: { name: repair.person.name },
					field: repair.field.replace(/s$/, '') + '_id' + (repair.arrayIndex !== undefined ? `[${repair.arrayIndex}]` : ''),
					oldValue: '(missing)',
					newValue: repair.resolvedCrId
				}));
				break;
		}

		if (this.allChanges.length === 0) {
			contentEl.createEl('p', {
				text: 'No changes needed. All values are already in the correct format.',
				cls: 'crc-text-muted'
			});
		} else {
			// Count display
			this.countEl = contentEl.createEl('p', { cls: 'crc-batch-count' });

			// Controls row: search + filter + sort
			const controlsRow = contentEl.createDiv({ cls: 'crc-batch-controls' });

			// Search input
			const searchContainer = controlsRow.createDiv({ cls: 'crc-batch-search' });
			const searchInput = searchContainer.createEl('input', {
				type: 'text',
				placeholder: 'Search by name...',
				cls: 'crc-batch-search-input'
			});
			searchInput.addEventListener('input', () => {
				this.searchQuery = searchInput.value.toLowerCase();
				this.applyFiltersAndSort();
			});

			// Field filter dropdown (only show if multiple fields)
			const uniqueFields = [...new Set(this.allChanges.map(c => c.field))];
			if (uniqueFields.length > 1) {
				const filterContainer = controlsRow.createDiv({ cls: 'crc-batch-filter' });
				const filterSelect = filterContainer.createEl('select', { cls: 'crc-batch-filter-select' });
				filterSelect.createEl('option', { text: 'All fields', value: 'all' });
				for (const field of uniqueFields.sort()) {
					filterSelect.createEl('option', { text: field, value: field });
				}
				filterSelect.addEventListener('change', () => {
					this.selectedField = filterSelect.value;
					this.applyFiltersAndSort();
				});
			}

			// Sort toggle
			const sortContainer = controlsRow.createDiv({ cls: 'crc-batch-sort' });
			const sortBtn = sortContainer.createEl('button', {
				text: 'A→Z',
				cls: 'crc-batch-sort-btn'
			});
			sortBtn.addEventListener('click', () => {
				this.sortAscending = !this.sortAscending;
				sortBtn.textContent = this.sortAscending ? 'A→Z' : 'Z→A';
				this.applyFiltersAndSort();
			});

			// Scrollable table container
			const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
			const table = tableContainer.createEl('table', { cls: 'crc-batch-preview-table' });
			const thead = table.createEl('thead');
			const headerRow = thead.createEl('tr');
			headerRow.createEl('th', { text: 'Person' });
			headerRow.createEl('th', { text: 'Field' });
			headerRow.createEl('th', { text: 'Current' });
			headerRow.createEl('th', { text: 'New' });

			this.tbody = table.createEl('tbody');

			// Initial render
			this.applyFiltersAndSort();
		}

		// Show skipped notes for sex operation (schema-aware mode)
		if (this.operation === 'sex' && this.preview.genderSkipped.length > 0) {
			const skippedSection = contentEl.createDiv({ cls: 'crc-batch-skipped-section' });
			const skippedHeader = skippedSection.createDiv({ cls: 'crc-batch-skipped-header' });
			const infoIcon = createLucideIcon('info', 16);
			skippedHeader.appendChild(infoIcon);
			skippedHeader.createSpan({
				text: ` ${this.preview.genderSkipped.length} note${this.preview.genderSkipped.length === 1 ? '' : 's'} skipped (schema override)`
			});

			// Collapsible details
			const detailsContainer = skippedSection.createEl('details', { cls: 'crc-batch-skipped-details' });
			detailsContainer.createEl('summary', { text: 'Show skipped notes' });

			const skippedList = detailsContainer.createEl('ul', { cls: 'crc-batch-skipped-list' });
			for (const skipped of this.preview.genderSkipped) {
				const item = skippedList.createEl('li');
				item.createSpan({ text: skipped.person.name, cls: 'crc-batch-skipped-name' });
				item.createSpan({
					text: ` (${skipped.currentValue}) — schema: ${skipped.schemaName}`,
					cls: 'crc-text-muted'
				});
			}
		}

		// Backup warning (don't show if normalization is disabled for this operation)
		if (this.allChanges.length > 0 && !this.sexNormalizationDisabled) {
			const warning = contentEl.createDiv({ cls: 'crc-warning-callout' });
			const warningIcon = createLucideIcon('alert-triangle', 16);
			warning.appendChild(warningIcon);
			warning.createSpan({
				text: ' Backup your vault before proceeding. This operation will modify existing notes.'
			});
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: this.sexNormalizationDisabled ? 'Close' : 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.close();
		});

		// Don't show Apply button if sex normalization is disabled
		if (this.sexNormalizationDisabled) {
			// No Apply button when disabled - user already sees the info callout
			return;
		}

		// Count actual changes (excluding unrecognized entries that won't be modified)
		const actualChanges = this.allChanges.filter(c => !c.newValue.includes('(unrecognized'));
		if (actualChanges.length > 0) {
			const applyBtn = buttonContainer.createEl('button', {
				text: `Apply ${actualChanges.length} change${actualChanges.length === 1 ? '' : 's'}`,
				cls: 'mod-cta'
			});
			applyBtn.addEventListener('click', () => {
				void (async () => {
					// Disable buttons during operation
					applyBtn.disabled = true;
					cancelBtn.disabled = true;
					applyBtn.textContent = 'Applying changes...';

					// Run the operation
					await this.onApply();

					// Show completion and enable close
					applyBtn.textContent = '✓ Changes applied';
					applyBtn.addClass('crc-btn-success');
					cancelBtn.textContent = 'Close';
					cancelBtn.disabled = false;

					// Update count to show completion
					if (this.countEl) {
						this.countEl.textContent = `✓ Successfully applied ${actualChanges.length} change${actualChanges.length === 1 ? '' : 's'}`;
					}
				})();
			});
		} else if (this.allChanges.length > 0) {
			// Only unrecognized values, no actual changes to apply
			contentEl.createEl('p', {
				text: 'No normalizable values found. The listed values are unrecognized and will not be changed.',
				cls: 'crc-text-muted'
			});
		}
	}

	/**
	 * Apply filters and sorting, then re-render the table
	 */
	private applyFiltersAndSort(): void {
		// Filter
		this.filteredChanges = this.allChanges.filter(change => {
			// Search filter
			if (this.searchQuery && !change.person.name.toLowerCase().includes(this.searchQuery)) {
				return false;
			}
			// Field filter
			if (this.selectedField !== 'all' && change.field !== this.selectedField) {
				return false;
			}
			return true;
		});

		// Sort by person name
		this.filteredChanges.sort((a, b) => {
			const cmp = a.person.name.localeCompare(b.person.name);
			return this.sortAscending ? cmp : -cmp;
		});

		// Update count
		if (this.countEl) {
			if (this.filteredChanges.length === this.allChanges.length) {
				this.countEl.textContent = `${this.allChanges.length} change${this.allChanges.length === 1 ? '' : 's'} will be made:`;
			} else {
				this.countEl.textContent = `Showing ${this.filteredChanges.length} of ${this.allChanges.length} changes:`;
			}
		}

		// Re-render table
		this.renderTable();
	}

	/**
	 * Render the filtered/sorted changes to the table body
	 */
	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const change of this.filteredChanges) {
			const isUnrecognized = change.newValue.includes('(unrecognized');
			const row = this.tbody.createEl('tr');
			if (isUnrecognized) {
				row.addClass('crc-batch-unrecognized-row');
			}
			row.createEl('td', { text: change.person.name });
			row.createEl('td', { text: change.field });
			row.createEl('td', {
				text: change.oldValue,
				cls: isUnrecognized ? 'crc-batch-unrecognized-value' : 'crc-batch-old-value'
			});
			row.createEl('td', {
				text: change.newValue,
				cls: isUnrecognized ? 'crc-text-muted' : 'crc-batch-new-value'
			});
		}

		if (this.filteredChanges.length === 0 && this.allChanges.length > 0) {
			const row = this.tbody.createEl('tr');
			const cell = row.createEl('td', {
				text: 'No matches found',
				cls: 'crc-text-muted crc-text--center'
			});
			cell.setAttribute('colspan', '4');
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Simple confirmation modal for destructive actions
 */
class ConfirmationModal extends Modal {
	private title: string;
	private message: string;
	private onResult: (confirmed: boolean) => void;

	constructor(app: App, title: string, message: string, onResult: (confirmed: boolean) => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onResult = onResult;
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;
		titleEl.setText(this.title);

		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'crc-confirmation-buttons' });

		const cancelBtn = buttonContainer.createEl('button', {
			text: 'Cancel',
			cls: 'crc-btn-secondary'
		});
		cancelBtn.addEventListener('click', () => {
			this.onResult(false);
			this.close();
		});

		const confirmBtn = buttonContainer.createEl('button', {
			text: 'Continue',
			cls: 'mod-warning'
		});
		confirmBtn.addEventListener('click', () => {
			this.onResult(true);
			this.close();
		});
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Modal for previewing date validation issues
 */
class DateValidationPreviewModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private allIssues: Array<{
		file: TFile;
		name: string;
		field: string;
		value: string;
		issue: string;
	}>;
	private filteredIssues: Array<{
		file: TFile;
		name: string;
		field: string;
		value: string;
		issue: string;
	}> = [];

	// Filter state
	private searchQuery = '';
	private selectedField = 'all';
	private sortAscending = true;

	// UI elements
	private tbody: HTMLTableSectionElement | null = null;
	private countEl: HTMLElement | null = null;

	constructor(
		app: App,
		plugin: CanvasRootsPlugin,
		issues: Array<{
			file: TFile;
			name: string;
			field: string;
			value: string;
			issue: string;
		}>
	) {
		super(app);
		this.plugin = plugin;
		this.allIssues = issues;
		this.filteredIssues = [...issues];
	}

	onOpen(): void {
		const { contentEl, titleEl } = this;

		this.modalEl.addClass('crc-batch-preview-modal');
		titleEl.setText('Preview: Date format validation issues');

		// Summary
		const summaryEl = contentEl.createDiv({ cls: 'crc-batch-summary' });
		summaryEl.createEl('p', {
			text: `Found ${this.allIssues.length} date${this.allIssues.length === 1 ? '' : 's'} with format issues.`,
			cls: 'crc-batch-summary-text'
		});
		this.countEl = summaryEl.createEl('p', {
			text: `Showing ${this.filteredIssues.length} of ${this.allIssues.length}`,
			cls: 'crc-batch-summary-count'
		});

		// Search and filter controls
		const controlsEl = contentEl.createDiv({ cls: 'crc-batch-controls' });

		// Search input
		const searchContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		searchContainer.createEl('label', { text: 'Search:', cls: 'crc-batch-label' });
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'Filter by person name...',
			cls: 'crc-batch-search'
		});
		searchInput.addEventListener('input', () => {
			this.searchQuery = searchInput.value.toLowerCase();
			this.applyFiltersAndRender();
		});

		// Field filter dropdown
		const fieldContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		fieldContainer.createEl('label', { text: 'Field:', cls: 'crc-batch-label' });
		const fieldSelect = fieldContainer.createEl('select', { cls: 'crc-batch-select' });

		const fieldOptions = [
			{ value: 'all', label: 'All fields' },
			{ value: 'born', label: 'Birth dates' },
			{ value: 'birth_date', label: 'Birth dates (birth_date)' },
			{ value: 'died', label: 'Death dates' },
			{ value: 'death_date', label: 'Death dates (death_date)' }
		];

		for (const opt of fieldOptions) {
			fieldSelect.createEl('option', {
				value: opt.value,
				text: opt.label
			});
		}

		fieldSelect.addEventListener('change', () => {
			this.selectedField = fieldSelect.value;
			this.applyFiltersAndRender();
		});

		// Sort toggle
		const sortContainer = controlsEl.createDiv({ cls: 'crc-batch-control' });
		sortContainer.createEl('label', { text: 'Sort:', cls: 'crc-batch-label' });
		const sortBtn = sortContainer.createEl('button', {
			text: this.sortAscending ? 'A → Z' : 'Z → A',
			cls: 'crc-batch-sort-btn'
		});
		sortBtn.addEventListener('click', () => {
			this.sortAscending = !this.sortAscending;
			sortBtn.setText(this.sortAscending ? 'A → Z' : 'Z → A');
			this.applyFiltersAndRender();
		});

		// Table
		const tableContainer = contentEl.createDiv({ cls: 'crc-batch-table-container' });
		const table = tableContainer.createEl('table', { cls: 'crc-batch-table' });

		// Table header
		const thead = table.createEl('thead');
		const headerRow = thead.createEl('tr');
		headerRow.createEl('th', { text: 'Person' });
		headerRow.createEl('th', { text: 'Field' });
		headerRow.createEl('th', { text: 'Current value' });
		headerRow.createEl('th', { text: 'Issue' });
		headerRow.createEl('th', { text: 'Action' });

		// Table body
		this.tbody = table.createEl('tbody');

		// Render initial data
		this.renderTable();

		// Info box
		const infoEl = contentEl.createDiv({ cls: 'crc-batch-info' });
		const infoIcon = infoEl.createEl('span', { cls: 'crc-batch-info-icon' });
		setIcon(infoIcon, 'info');
		infoEl.createEl('span', {
			text: 'Date validation is preview-only. Click "Open note" to manually correct each date. Configure validation rules in Settings → Charted Roots → Dates & validation.'
		});

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'crc-batch-buttons' });

		const closeBtn = buttonContainer.createEl('button', {
			text: 'Close',
			cls: 'mod-cta'
		});
		closeBtn.addEventListener('click', () => {
			this.close();
		});
	}

	private applyFiltersAndRender(): void {
		// Apply search filter
		let filtered = this.allIssues.filter(issue =>
			issue.name.toLowerCase().includes(this.searchQuery)
		);

		// Apply field filter
		if (this.selectedField !== 'all') {
			filtered = filtered.filter(issue => issue.field === this.selectedField);
		}

		// Apply sort
		filtered.sort((a, b) => {
			const aName = a.name.toLowerCase();
			const bName = b.name.toLowerCase();
			return this.sortAscending
				? aName.localeCompare(bName)
				: bName.localeCompare(aName);
		});

		this.filteredIssues = filtered;

		// Update count
		if (this.countEl) {
			this.countEl.setText(`Showing ${this.filteredIssues.length} of ${this.allIssues.length}`);
		}

		// Re-render table
		this.renderTable();
	}

	private renderTable(): void {
		if (!this.tbody) return;

		this.tbody.empty();

		for (const issue of this.filteredIssues) {
			const row = this.tbody.createEl('tr');

			// Person name
			row.createEl('td', { text: issue.name });

			// Field
			row.createEl('td', { text: issue.field });

			// Current value
			row.createEl('td', {
				text: issue.value,
				cls: 'crc-batch-value'
			});

			// Issue
			row.createEl('td', {
				text: issue.issue,
				cls: 'crc-batch-issue'
			});

			// Action: Open note button
			const actionCell = row.createEl('td');
			const openBtn = actionCell.createEl('button', {
				text: 'Open note',
				cls: 'crc-batch-action-btn'
			});
			openBtn.addEventListener('click', () => {
				void this.app.workspace.getLeaf().openFile(issue.file);
			});
		}

		// Show empty state if no results
		if (this.filteredIssues.length === 0) {
			const emptyRow = this.tbody.createEl('tr');
			const emptyCell = emptyRow.createEl('td', {
				attr: { colspan: '5' },
				cls: 'crc-batch-empty'
			});
			emptyCell.createEl('p', {
				text: 'No issues match the current filters'
			});
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
