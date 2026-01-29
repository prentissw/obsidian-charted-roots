/**
 * Collections tab for the Control Center
 *
 * Displays browse modes (all people, detected families, user collections),
 * collection overview canvas generation, and analytics.
 */

import { Notice, Setting, TFile, normalizePath } from 'obsidian';
import type { App } from 'obsidian';
import type CanvasRootsPlugin from '../../main';
import type { LucideIconName } from './lucide-icons';
import { CanvasGenerator, CanvasData } from '../core/canvas-generator';
import { ensureFolderExists } from '../core/canvas-utils';
import { getErrorMessage } from '../core/error-utils';

export interface CollectionsTabOptions {
	container: HTMLElement;
	plugin: CanvasRootsPlugin;
	app: App;
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement;
	showTab: (tabId: string) => void;
	closeModal: () => void;
	formatCanvasJson: (data: CanvasData) => string;
}

export function renderCollectionsTab(options: CollectionsTabOptions): void {
	const { container, plugin, app, createCard, closeModal, formatCanvasJson } = options;

	// Browse Mode Card
	const browseCard = createCard({
		title: 'Browse by',
		icon: 'folder',
		subtitle: 'Choose how to organize and view people'
	});

	const browseContent = browseCard.createDiv({ cls: 'crc-card__content' });

	// Browse mode selection using dropdown
	let selectedMode = 'families'; // Default to families

	new Setting(browseContent)
		.setName('View')
		.setDesc('Choose how to organize and view people')
		.addDropdown(dropdown => dropdown
			.addOption('all', 'All people - show everyone in the vault')
			.addOption('families', 'Detected families - auto-detected family groups')
			.addOption('collections', 'My collections - user-defined collections')
			.setValue(selectedMode)
			.onChange((value) => {
				selectedMode = value;
				updateCollectionsList(container, selectedMode, plugin, createCard);
			}));

	container.appendChild(browseCard);

	// Generate Overview Canvas button
	const overviewCard = createCard({
		title: 'Collection overview',
		icon: 'git-branch'
	});

	const overviewContent = overviewCard.querySelector('.crc-card__content') as HTMLElement;

	new Setting(overviewContent)
		.setName('Generate overview canvas')
		.setDesc('Create a master canvas showing all collections and their connections')
		.addButton(button => button
			.setButtonText('Generate overview')
			.setCta()
			.onClick(async () => {
				await generateCollectionOverviewCanvas(plugin, app, closeModal, formatCanvasJson);
			}));

	container.appendChild(overviewCard);

	// Analytics Card
	const analyticsCard = createCard({
		title: 'Analytics',
		icon: 'activity'
	});

	const analyticsContent = analyticsCard.querySelector('.crc-card__content') as HTMLElement;
	analyticsContent.createEl('p', {
		text: 'Loading analytics...',
		cls: 'crc-text--muted'
	});

	container.appendChild(analyticsCard);

	// Load analytics data asynchronously
	loadAnalyticsData(analyticsContent, plugin);

	// Collections List Card
	updateCollectionsList(container, selectedMode, plugin, createCard);
}

/**
 * Update the collections list based on selected browse mode
 */
function updateCollectionsList(
	container: HTMLElement,
	mode: string,
	plugin: CanvasRootsPlugin,
	createCard: (options: { title: string; icon?: LucideIconName; subtitle?: string }) => HTMLElement
): void {
	// Remove existing list card if present
	const existingList = container.querySelector('.crc-collections-list');
	if (existingList) {
		existingList.remove();
	}

	const graphService = plugin.createFamilyGraphService();

	if (mode === 'all') {
		// Show all people
		graphService.getTotalPeopleCount(); // This loads the cache
		const allPeople = graphService.getAllPeople();

		const listCard = createCard({
			title: `All people (${allPeople.length})`,
			icon: 'users',
			subtitle: 'Everyone in your vault'
		});
		listCard.addClass('crc-collections-list');

		const listContent = listCard.createDiv({ cls: 'crc-card__content' });
		listContent.createEl('p', {
			cls: 'crc-text--muted',
			text: `Found ${allPeople.length} ${allPeople.length === 1 ? 'person' : 'people'} in your vault.`
		});

		container.appendChild(listCard);

	} else if (mode === 'families') {
		// Show detected families
		const components = graphService.findAllFamilyComponents();

		const listCard = createCard({
			title: `Detected families (${components.length})`,
			icon: 'users',
			subtitle: 'Auto-detected family groups'
		});
		listCard.addClass('crc-collections-list');

		const listContent = listCard.createDiv({ cls: 'crc-card__content' });

		if (components.length === 0) {
			listContent.createEl('p', {
				cls: 'crc-text--muted',
				text: 'No families found. Add some person notes to get started.'
			});
		} else {
			// Paginated table display
			const PAGE_SIZE = 25;
			let displayLimit = PAGE_SIZE;

			const tableContainer = listContent.createDiv({ cls: 'crc-families-table-container' });

			const renderFamiliesTable = () => {
				tableContainer.empty();

				// Create table
				const table = tableContainer.createEl('table', { cls: 'crc-person-table' });
				const thead = table.createEl('thead');
				const headerRow = thead.createEl('tr');
				headerRow.createEl('th', { text: 'Family name', cls: 'crc-person-table__th' });
				headerRow.createEl('th', { text: 'Size', cls: 'crc-person-table__th' });
				headerRow.createEl('th', { text: 'Representative', cls: 'crc-person-table__th' });

				const tbody = table.createEl('tbody');

				// Display only up to displayLimit
				const displayedComponents = components.slice(0, displayLimit);

				displayedComponents.forEach((component, index) => {
					const row = tbody.createEl('tr', { cls: 'crc-person-table__row' });

					// Family name cell
					const nameCell = row.createEl('td', { cls: 'crc-person-table__td crc-person-table__td--name' });
					const familyName = component.collectionName || `Family ${index + 1}`;
					nameCell.createEl('strong', { text: familyName });

					// Size cell
					const sizeCell = row.createEl('td', { cls: 'crc-person-table__td' });
					sizeCell.createEl('span', {
						cls: 'crc-badge',
						text: `${component.size} ${component.size === 1 ? 'person' : 'people'}`
					});

					// Representative cell
					const repCell = row.createEl('td', { cls: 'crc-person-table__td' });
					repCell.textContent = component.representative.name;
				});

				// Footer with count and load more
				const footer = tableContainer.createDiv({ cls: 'crc-place-table-footer crc-mt-2' });

				const countText = footer.createEl('span', {
					cls: 'crc-text-muted crc-text-small'
				});
				countText.textContent = `Showing ${displayedComponents.length} of ${components.length} ${components.length !== 1 ? 'families' : 'family'}`;

				if (components.length > displayLimit) {
					const remaining = components.length - displayLimit;
					const loadMoreBtn = footer.createEl('button', {
						text: `Load more (${Math.min(PAGE_SIZE, remaining)} more)`,
						cls: 'crc-btn crc-btn--small crc-btn--ghost crc-ml-2'
					});
					loadMoreBtn.addEventListener('click', () => {
						displayLimit += PAGE_SIZE;
						renderFamiliesTable();
					});
				}
			};

			renderFamiliesTable();
		}

		container.appendChild(listCard);

	} else if (mode === 'collections') {
		// Show user collections
		const collections = graphService.getUserCollections();

		const listCard = createCard({
			title: `My collections (${collections.length})`,
			icon: 'folder',
			subtitle: 'User-defined collections'
		});
		listCard.addClass('crc-collections-list');

		const listContent = listCard.createDiv({ cls: 'crc-card__content' });

		if (collections.length === 0) {
			listContent.createEl('p', {
				cls: 'crc-text--muted',
				text: 'No collections yet. Right-click a person note and select "Set collection" to create one.'
			});
		} else {
			collections.forEach(collection => {
				const collectionItem = listContent.createDiv({ cls: 'crc-collection-item' });

				const collectionHeader = collectionItem.createDiv({ cls: 'crc-collection-header' });
				collectionHeader.createEl('strong', { text: `${collection.name} ` }); // Added space after name
				collectionHeader.createEl('span', {
					cls: 'crc-badge',
					text: `${collection.size} ${collection.size === 1 ? 'person' : 'people'}`
				});
			});
		}

		container.appendChild(listCard);

		// Show cross-collection connections if there are multiple collections
		if (collections.length >= 2) {
			const connections = graphService.detectCollectionConnections();

			if (connections.length > 0) {
				const connectionsCard = createCard({
					title: `Collection connections (${connections.length})`,
					icon: 'link',
					subtitle: 'People who bridge multiple collections'
				});
				connectionsCard.addClass('crc-collections-list');

				const connectionsContent = connectionsCard.createDiv({ cls: 'crc-card__content' });

				connections.forEach(connection => {
					const connectionItem = connectionsContent.createDiv({ cls: 'crc-collection-item' });

					const connectionHeader = connectionItem.createDiv({ cls: 'crc-collection-header' });
					connectionHeader.createEl('strong', {
						text: `${connection.fromCollection} ↔ ${connection.toCollection} ` // Added space
					});
					connectionHeader.createEl('span', {
						cls: 'crc-badge',
						text: `${connection.relationshipCount} ${connection.relationshipCount === 1 ? 'link' : 'links'}`
					});

					const bridgeInfo = connectionItem.createDiv({ cls: 'crc-text--muted' });
					const bridgeNames = connection.bridgePeople.map(p => p.name).slice(0, 3).join(', ');
					const remainingCount = connection.bridgePeople.length - 3;
					bridgeInfo.textContent = `Bridge people: ${bridgeNames}${remainingCount > 0 ? ` +${remainingCount} more` : ''}`;
				});

				container.appendChild(connectionsCard);
			}
		}
	}
}

/**
 * Generate a collection overview canvas
 */
async function generateCollectionOverviewCanvas(
	plugin: CanvasRootsPlugin,
	app: App,
	closeModal: () => void,
	formatCanvasJson: (data: CanvasData) => string
): Promise<void> {
	try {
		new Notice('Generating collection overview...');

		const graphService = plugin.createFamilyGraphService();

		// Get both detected families and user collections
		const families = graphService.findAllFamilyComponents();
		const userCollections = graphService.getUserCollections();

		// Combine them into a single collection list
		const allCollections = [
			...families.map(f => ({
				name: f.collectionName || `Family ${families.indexOf(f) + 1}`,
				size: f.size,
				representative: f.representative
			})),
			...userCollections.map(c => ({
				name: c.name,
				size: c.size,
				representative: undefined // User collections don't have a single representative
			}))
		];

		if (allCollections.length === 0) {
			new Notice('No collections found. Add some person notes to get started.');
			return;
		}

		// Get connections between collections
		const connections = graphService.detectCollectionConnections();

		// Generate the overview canvas
		const canvasGenerator = new CanvasGenerator();
		const canvasData = canvasGenerator.generateCollectionOverviewCanvas(
			allCollections,
			connections,
			{
				nodeWidth: plugin.settings.defaultNodeWidth,
				nodeHeight: plugin.settings.defaultNodeHeight
			}
		);

		// Create canvas file
		const fileName = 'Collection Overview.canvas';
		const canvasContent = formatCanvasJson(canvasData);

		// Use canvasesFolder setting
		const folder = plugin.settings.canvasesFolder || 'Charted Roots/Canvases';
		await ensureFolderExists(app, folder);
		const filePath = normalizePath(`${folder}/${fileName}`);

		let file: TFile;
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile instanceof TFile) {
			// Update existing file
			await app.vault.modify(existingFile, canvasContent);
			file = existingFile;
			new Notice(`Updated existing overview: ${fileName}`);
		} else {
			// Create new file
			file = await app.vault.create(filePath, canvasContent);
			new Notice(`Created overview: ${fileName}`);
		}

		// Wait for file system to settle
		await new Promise(resolve => setTimeout(resolve, 100));

		// Open the canvas file
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file);

		new Notice(`Collection overview generated! (${allCollections.length} collections)`);
		closeModal();
	} catch (error: unknown) {
		console.error('Error generating collection overview:', error);
		new Notice(`Error generating overview: ${getErrorMessage(error)}`);
	}
}

/**
 * Loads and displays analytics data
 */
function loadAnalyticsData(container: HTMLElement, plugin: CanvasRootsPlugin): void {
	try {
		const graphService = plugin.createFamilyGraphService();
		const analytics = graphService.calculateCollectionAnalytics();

		// Clear loading message
		container.empty();

		// Quick Stats Section
		const statsGrid = container.createDiv({ cls: 'crc-stats-grid' });

		const createStatBox = (label: string, value: string | number, subtitle?: string) => {
			const box = statsGrid.createDiv({ cls: 'crc-stat-box' });
			box.createEl('div', { text: String(value), cls: 'crc-stat-value' });
			box.createEl('div', { text: label, cls: 'crc-stat-label' });
			if (subtitle) {
				box.createEl('div', { text: subtitle, cls: 'crc-stat-subtitle' });
			}
			return box;
		};

		createStatBox('Total people', analytics.totalPeople);
		createStatBox('Collections', analytics.totalCollections,
			`${analytics.totalFamilies} families, ${analytics.totalUserCollections} custom`);
		createStatBox('Average size', analytics.averageCollectionSize, 'people per collection');
		createStatBox('Bridge people', analytics.crossCollectionMetrics.totalBridgePeople,
			'connecting collections');

		// Data Quality Section
		container.createEl('h4', { text: 'Data completeness', cls: 'crc-mt-4 crc-mb-2' });
		const qualityGrid = container.createDiv({ cls: 'crc-quality-grid' });

		const createProgressBar = (label: string, percent: number) => {
			const item = qualityGrid.createDiv({ cls: 'crc-quality-item' });
			const header = item.createDiv({ cls: 'crc-quality-header' });
			header.createEl('span', { text: label });
			header.createEl('span', { text: `${percent}%`, cls: 'crc-quality-percent' });

			const barBg = item.createDiv({ cls: 'crc-progress-bar-bg' });
			const barFill = barBg.createDiv({ cls: 'crc-progress-bar-fill' });
			barFill.style.setProperty('width', `${percent}%`);

			return item;
		};

		createProgressBar('Birth dates', analytics.dataCompleteness.birthDatePercent);
		createProgressBar('Death dates', analytics.dataCompleteness.deathDatePercent);
		createProgressBar('Sex/Gender', analytics.dataCompleteness.sexPercent);

		// Top Collections Section
		if (analytics.largestCollection) {
			container.createEl('h4', { text: 'Collection highlights', cls: 'crc-mt-4 crc-mb-2' });
			const highlightsList = container.createEl('ul', { cls: 'crc-highlights-list' });

			highlightsList.createEl('li', {
				text: `Largest: ${analytics.largestCollection.name} (${analytics.largestCollection.size} people)`
			});

			if (analytics.smallestCollection) {
				highlightsList.createEl('li', {
					text: `Smallest: ${analytics.smallestCollection.name} (${analytics.smallestCollection.size} people)`
				});
			}

			if (analytics.dateRange.earliest && analytics.dateRange.latest) {
				highlightsList.createEl('li', {
					text: `Date range: ${analytics.dateRange.earliest} - ${analytics.dateRange.latest} (${analytics.dateRange.span} years)`
				});
			}
		}

		// Cross-Collection Connections
		if (analytics.crossCollectionMetrics.topConnections.length > 0) {
			container.createEl('h4', { text: 'Top connections', cls: 'crc-mt-4 crc-mb-2' });
			const connectionsList = container.createEl('ul', { cls: 'crc-connections-list' });

			analytics.crossCollectionMetrics.topConnections.forEach(conn => {
				connectionsList.createEl('li', {
					text: `${conn.from} ↔ ${conn.to} (${conn.bridgeCount} ${conn.bridgeCount === 1 ? 'person' : 'people'})`
				});
			});
		}

	} catch (error: unknown) {
		console.error('Error loading analytics:', error);
		container.empty();
		container.createEl('p', {
			text: 'Failed to load analytics data.',
			cls: 'crc-error-text'
		});
	}
}
