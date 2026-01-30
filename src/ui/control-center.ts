import { App, Menu, MenuItem, Modal, Notice, Platform, TFile, TFolder, setIcon, normalizePath } from 'obsidian';
import CanvasRootsPlugin from '../../main';
import { TAB_CONFIGS, NAV_GROUPS, TOOL_CONFIGS, createLucideIcon, setLucideIcon, LucideIconName } from './lucide-icons';
import { ensureFolderExists } from '../core/canvas-utils';
import { VaultStatsService, FullVaultStats } from '../core/vault-stats';
import { FamilyGraphService, TreeOptions } from '../core/family-graph';
import { CanvasGenerator } from '../core/canvas-generator';
import { getLogger } from '../core/logging';
import { getErrorMessage } from '../core/error-utils';
import { SchemaValidationProgressModal } from './schema-validation-progress-modal';
import type { RecentTreeInfo } from '../settings';
import { ConfirmationModal } from './data-quality-modals';
import {
	renderDataQualityTab,
	previewRemoveDuplicateRelationships,
	removeDuplicateRelationships,
	previewRemovePlaceholders,
	removePlaceholders,
	previewAddPersonType,
	addPersonType,
	previewNormalizeNames,
	normalizeNames,
	previewFixBidirectionalRelationships,
	fixBidirectionalRelationships,
	previewDetectImpossibleDates,
	previewValidateDates,
	validateDates
} from './data-quality-tab';
import { PlaceGraphService } from '../core/place-graph';
import { CreatePlaceModal } from './create-place-modal';
import { MigrationDiagramModal } from './migration-diagram-modal';
import { PlaceNetworkModal } from './place-network-modal';
import { TemplateSnippetsModal } from './template-snippets-modal';
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
import { renderEventsTab } from '../dates';
import { renderOrganizationsTab } from '../organizations';
import { renderStatisticsTab } from '../statistics';
import { renderPersonTimeline } from '../events/ui/person-timeline';
import { EventService } from '../events/services/event-service';
import { renderPlaceTimelineCard } from '../events/ui/place-timeline';
import { renderDashboardTab } from './dashboard-tab';
import { renderPlacesTab } from './places-tab';
import { renderPeopleTab } from './people-tab';
import { PropertyAliasService } from '../core/property-alias-service';
import { FlattenNestedPropertiesModal } from './flatten-nested-properties-modal';
import { PlaceGeneratorModal } from '../enhancement/ui/place-generator-modal';
import { BulkMediaLinkModal } from '../core/ui/bulk-media-link-modal';
import { MediaManagerModal } from '../core/ui/media-manager-modal';
import {
	renderSourcesTab
} from '../sources';
import { UniverseService } from '../universes/services/universe-service';
import { UniverseWizardModal } from '../universes/ui/universe-wizard';
import { renderUniversesTab } from '../universes/ui/universes-tab';
import { UnifiedTreeWizardModal } from '../trees/ui/unified-tree-wizard-modal';
import { renderTreesTab, formatCanvasJson } from '../trees/ui/trees-tab';

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
	 * Show People tab — delegates to extracted module
	 */
	private showPeopleTab(): void {
		renderPeopleTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.showTab(tabId),
			closeModal: () => this.close(),
			showQuickCreatePlaceModal: (name) => this.showQuickCreatePlaceModal(name),
			showPersonTimelineModal: (file, name, eventService) => this.showPersonTimelineModal(file, name, eventService),
			getCachedFamilyGraph: () => this.getCachedFamilyGraph(),
			getCachedPlaceGraph: () => this.getCachedPlaceGraph(),
			getCachedUniverses: () => this.getCachedUniverses(),
			invalidateCaches: () => this.invalidateCaches(),
			previewRemoveDuplicateRelationships: () => previewRemoveDuplicateRelationships(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			removeDuplicateRelationships: () => { void removeDuplicateRelationships(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			previewRemovePlaceholders: () => previewRemovePlaceholders(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			removePlaceholders: () => { void removePlaceholders(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			previewAddPersonType: () => previewAddPersonType(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			addPersonType: () => { void addPersonType(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			previewNormalizeNames: () => previewNormalizeNames(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			normalizeNames: () => { void normalizeNames(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			previewFixBidirectionalRelationships: () => { void previewFixBidirectionalRelationships(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			fixBidirectionalRelationships: () => { void fixBidirectionalRelationships(this.plugin, this.app, (tabId) => this.showTab(tabId)); },
			previewValidateDates: () => previewValidateDates(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			validateDates: () => validateDates(this.plugin, this.app, (tabId) => this.showTab(tabId)),
			previewDetectImpossibleDates: () => previewDetectImpossibleDates(this.plugin, this.app, (tabId) => this.showTab(tabId))
		});
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

	// =========================================================================
	// DATA QUALITY TAB
	// =========================================================================

	/**
	 * Show Data Quality tab — delegates to extracted module
	 */
	private showDataQualityTab(): void {
		renderDataQualityTab({
			container: this.contentContainer,
			plugin: this.plugin,
			app: this.app,
			createCard: (options) => this.createCard(options),
			showTab: (tabId) => this.switchTab(tabId),
			closeModal: () => this.close(),
			getCachedFamilyGraph: () => this.getCachedFamilyGraph(),
			invalidateCaches: () => this.invalidateCaches()
		});
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
