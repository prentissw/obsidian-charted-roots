/**
 * Create/Edit Source Modal
 *
 * Modal for creating new source notes or editing existing ones.
 */

import { App, Modal, Setting, Notice, TFile, FuzzySuggestModal, setIcon, AbstractInputSuggest, TextComponent } from 'obsidian';
import type CanvasRootsPlugin from '../../../main';
import type { SourceConfidence, SourceNote } from '../types/source-types';
import { getSourceTypesByCategory, SOURCE_CATEGORY_NAMES } from '../types/source-types';
import { SourceService } from '../services/source-service';
import { ModalStatePersistence, renderResumePromptBanner } from '../../ui/modal-state-persistence';

/**
 * Form data structure for persistence
 */
interface SourceFormData {
	title: string;
	sourceType: string;
	date: string;
	dateAccessed: string;
	repository: string;
	repositoryUrl: string;
	collection: string;
	location: string;
	confidence: SourceConfidence;
	transcription: string;
	media: string[];
}

/** Supported media file extensions */
const MEDIA_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'pdf'];

/**
 * Modal for selecting media files from the vault
 */
class MediaFileSuggestModal extends FuzzySuggestModal<TFile> {
	private onSelect: (file: TFile) => void;

	constructor(app: App, onSelect: (file: TFile) => void) {
		super(app);
		this.onSelect = onSelect;
		this.setPlaceholder('Select a media file...');
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter(file => {
			const ext = file.extension.toLowerCase();
			return MEDIA_EXTENSIONS.includes(ext);
		});
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onSelect(file);
	}
}

/**
 * Inline suggest for location field with autocomplete from existing locations
 */
class LocationSuggest extends AbstractInputSuggest<string> {
	private locations: string[];
	private textComponent: TextComponent;
	private onSelectValue: (value: string) => void;

	constructor(app: App, textComponent: TextComponent, locations: string[], onSelectValue: (value: string) => void) {
		super(app, textComponent.inputEl);
		this.textComponent = textComponent;
		this.locations = locations;
		this.onSelectValue = onSelectValue;
	}

	getSuggestions(inputStr: string): string[] {
		const lowerInput = inputStr.toLowerCase();
		return this.locations.filter(loc =>
			loc.toLowerCase().includes(lowerInput)
		);
	}

	renderSuggestion(location: string, el: HTMLElement): void {
		el.setText(location);
	}

	selectSuggestion(location: string): void {
		this.textComponent.setValue(location);
		this.onSelectValue(location);
		this.close();
	}
}

/**
 * Options for opening the source modal
 */
export interface SourceModalOptions {
	/** Callback after successful create/update. Receives the file for create mode. */
	onSuccess?: (file?: TFile) => void;
	/** For edit mode: the file to edit */
	editFile?: TFile;
	/** For edit mode: the source data to edit */
	editSource?: SourceNote;
}

/**
 * Modal for creating or editing source notes
 */
export class CreateSourceModal extends Modal {
	private plugin: CanvasRootsPlugin;
	private onSuccess: (file?: TFile) => void;

	// Edit mode
	private editMode: boolean = false;
	private editingFile?: TFile;

	// Form fields
	private title: string = '';
	private sourceType: string = 'vital_record';
	private date: string = '';
	private dateAccessed: string = '';
	private repository: string = '';
	private repositoryUrl: string = '';
	private collection: string = '';
	private location: string = '';
	private confidence: SourceConfidence = 'unknown';
	private transcription: string = '';
	private media: string[] = [];

	// UI state
	private mediaListContainer: HTMLElement | null = null;

	// State persistence
	private persistence?: ModalStatePersistence<SourceFormData>;
	private savedSuccessfully: boolean = false;
	private resumeBanner?: HTMLElement;

	constructor(app: App, plugin: CanvasRootsPlugin, optionsOrCallback?: SourceModalOptions | (() => void)) {
		super(app);
		this.plugin = plugin;

		// Handle both old callback style and new options object
		if (typeof optionsOrCallback === 'function') {
			this.onSuccess = optionsOrCallback;
		} else if (optionsOrCallback) {
			this.onSuccess = optionsOrCallback.onSuccess || (() => {});

			// Check for edit mode
			if (optionsOrCallback.editFile && optionsOrCallback.editSource) {
				this.editMode = true;
				this.editingFile = optionsOrCallback.editFile;
				const source = optionsOrCallback.editSource;

				// Populate form fields from existing source
				this.title = source.title;
				this.sourceType = source.sourceType;
				this.date = source.date || '';
				this.dateAccessed = source.dateAccessed || '';
				this.repository = source.repository || '';
				this.repositoryUrl = source.repositoryUrl || '';
				this.collection = source.collection || '';
				this.location = source.location || '';
				this.confidence = source.confidence;
				this.media = [...source.media];
			}
		} else {
			this.onSuccess = () => {};
		}

		// Set up persistence (only in create mode)
		if (!this.editMode) {
			this.persistence = new ModalStatePersistence<SourceFormData>(this.plugin, 'source');
		}
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('cr-create-source-modal');

		contentEl.createEl('h2', { text: this.editMode ? 'Edit source' : 'Create source' });

		// Check for persisted state (only in create mode)
		if (this.persistence && !this.editMode) {
			const existingState = this.persistence.getValidState();
			if (existingState) {
				const timeAgo = this.persistence.getTimeAgoString(existingState);
				this.resumeBanner = renderResumePromptBanner(
					contentEl,
					timeAgo,
					() => {
						// Discard - clear state and remove banner
						void this.persistence?.clear();
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
					},
					() => {
						// Restore - populate form with saved data
						this.restoreFromPersistedState(existingState.formData as unknown as SourceFormData);
						this.resumeBanner?.remove();
						this.resumeBanner = undefined;
						// Re-render form with restored data
						contentEl.empty();
						this.onOpen();
					}
				);
			}
		}

		// Title (required)
		new Setting(contentEl)
			.setName('Title')
			.setDesc('Descriptive title for the source')
			.addText(text => text
				.setPlaceholder('e.g., 1900 US Census - Smith Family')
				.setValue(this.title)
				.onChange(value => this.title = value));

		// Source type (required)
		new Setting(contentEl)
			.setName('Source type')
			.setDesc('Type of documentary evidence')
			.addDropdown(dropdown => {
				// Group by category
				const groupedTypes = getSourceTypesByCategory(
					this.plugin.settings.customSourceTypes,
					this.plugin.settings.showBuiltInSourceTypes
				);

				for (const [categoryId, types] of Object.entries(groupedTypes)) {
					const categoryName = SOURCE_CATEGORY_NAMES[categoryId] || categoryId;
					// Add category as optgroup-like separator
					for (const typeDef of types) {
						dropdown.addOption(typeDef.id, `${categoryName}: ${typeDef.name}`);
					}
				}
				dropdown.setValue(this.sourceType);
				dropdown.onChange(value => this.sourceType = value);
			});

		// Date of document
		new Setting(contentEl)
			.setName('Document date')
			.setDesc('Date of the original document')
			.addText(text => text
				.setPlaceholder('e.g., 1900-06-01')
				.setValue(this.date)
				.onChange(value => this.date = value));

		// Repository
		new Setting(contentEl)
			.setName('Repository')
			.setDesc('Archive or website where source is held')
			.addText(text => text
				.setPlaceholder('e.g., Ancestry.com, FamilySearch, National Archives')
				.setValue(this.repository)
				.onChange(value => this.repository = value));

		// Confidence
		new Setting(contentEl)
			.setName('Confidence')
			.setDesc('How reliable is this source?')
			.addDropdown(dropdown => {
				dropdown.addOption('high', 'High - Primary source, direct evidence');
				dropdown.addOption('medium', 'Medium - Secondary source or indirect');
				dropdown.addOption('low', 'Low - Unverified or questionable');
				dropdown.addOption('unknown', 'Unknown - Not yet assessed');
				dropdown.setValue(this.confidence);
				dropdown.onChange(value => this.confidence = value as SourceConfidence);
			});

		// Collapsible optional details
		const detailsEl = contentEl.createEl('details', { cls: 'cr-create-source-details' });
		detailsEl.createEl('summary', { text: 'Additional details' });

		// Date accessed
		new Setting(detailsEl)
			.setName('Date accessed')
			.setDesc('When you accessed this source')
			.addText(text => text
				.setPlaceholder('e.g., 2024-03-15')
				.setValue(this.dateAccessed)
				.onChange(value => this.dateAccessed = value));

		// Repository URL
		new Setting(detailsEl)
			.setName('Repository URL')
			.setDesc('Direct link to the online source')
			.addText(text => text
				.setPlaceholder('https://...')
				.setValue(this.repositoryUrl)
				.onChange(value => this.repositoryUrl = value));

		// Collection
		new Setting(detailsEl)
			.setName('Collection')
			.setDesc('Record group or collection name')
			.addText(text => text
				.setPlaceholder('e.g., 1900 United States Federal Census')
				.setValue(this.collection)
				.onChange(value => this.collection = value));

		// Location (with autocomplete from existing locations)
		const sourceService = new SourceService(this.app, this.plugin.settings);
		const existingLocations = sourceService.getUniqueLocations();

		new Setting(detailsEl)
			.setName('Location')
			.setDesc('Geographic location of the record')
			.addText(text => {
				text.setPlaceholder('e.g., New York, Kings County, Brooklyn')
					.setValue(this.location)
					.onChange(value => this.location = value);

				// Attach autocomplete suggest if there are existing locations
				if (existingLocations.length > 0) {
					new LocationSuggest(
						this.app,
						text,
						existingLocations,
						(value) => this.location = value
					);
				}
			});

		// Media files section
		const mediaSetting = new Setting(detailsEl)
			.setName('Media files')
			.setDesc('Images or documents attached to this source');

		// Add button
		mediaSetting.addButton(btn => btn
			.setButtonText('Add media')
			.setIcon('plus')
			.onClick(() => {
				new MediaFileSuggestModal(this.app, (file) => {
					const wikilink = `[[${file.path}]]`;
					if (!this.media.includes(wikilink)) {
						this.media.push(wikilink);
						this.renderMediaList();
					}
				}).open();
			}));

		// Media list container
		this.mediaListContainer = detailsEl.createDiv({ cls: 'cr-media-picker-list' });
		this.renderMediaList();

		// Transcription (only for create mode - editing note body is complex)
		if (!this.editMode) {
			new Setting(detailsEl)
				.setName('Initial transcription')
				.setDesc('Optional transcription of the source content')
				.addTextArea(textArea => textArea
					.setPlaceholder('Enter transcription or notes...')
					.setValue(this.transcription)
					.onChange(value => this.transcription = value));
		}

		// Buttons
		const buttonContainer = contentEl.createDiv({ cls: 'cr-modal-buttons' });

		const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelBtn.addEventListener('click', () => this.close());

		const actionBtn = buttonContainer.createEl('button', {
			text: this.editMode ? 'Save changes' : 'Create source',
			cls: 'mod-cta'
		});
		actionBtn.addEventListener('click', () => void this.saveSource());
	}

	onClose() {
		const { contentEl } = this;

		// Persist state if not saved successfully and we have persistence enabled
		if (this.persistence && !this.editMode && !this.savedSuccessfully) {
			const formData = this.gatherFormData();
			if (this.persistence.hasContent(formData)) {
				void this.persistence.persist(formData);
			}
		}

		contentEl.empty();
	}

	/**
	 * Gather current form data for persistence
	 */
	private gatherFormData(): SourceFormData {
		return {
			title: this.title,
			sourceType: this.sourceType,
			date: this.date,
			dateAccessed: this.dateAccessed,
			repository: this.repository,
			repositoryUrl: this.repositoryUrl,
			collection: this.collection,
			location: this.location,
			confidence: this.confidence,
			transcription: this.transcription,
			media: [...this.media]
		};
	}

	/**
	 * Restore form state from persisted data
	 */
	private restoreFromPersistedState(formData: SourceFormData): void {
		this.title = formData.title || '';
		this.sourceType = formData.sourceType || 'vital_record';
		this.date = formData.date || '';
		this.dateAccessed = formData.dateAccessed || '';
		this.repository = formData.repository || '';
		this.repositoryUrl = formData.repositoryUrl || '';
		this.collection = formData.collection || '';
		this.location = formData.location || '';
		this.confidence = formData.confidence || 'unknown';
		this.transcription = formData.transcription || '';
		this.media = formData.media ? [...formData.media] : [];
	}

	/**
	 * Render the list of attached media files
	 */
	private renderMediaList(): void {
		if (!this.mediaListContainer) return;

		this.mediaListContainer.empty();

		if (this.media.length === 0) {
			this.mediaListContainer.createSpan({
				text: 'No media files attached',
				cls: 'crc-text-muted'
			});
			return;
		}

		for (let i = 0; i < this.media.length; i++) {
			const mediaPath = this.media[i];
			const item = this.mediaListContainer.createDiv({ cls: 'cr-media-picker-item' });

			// Extract filename from wikilink
			const match = mediaPath.match(/\[\[(.+?)\]\]/);
			const filePath = match ? match[1] : mediaPath;
			const fileName = filePath.split('/').pop() || filePath;

			// Thumbnail preview for images
			const ext = fileName.split('.').pop()?.toLowerCase() || '';
			const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext);

			if (isImage) {
				const file = this.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					const thumb = item.createDiv({ cls: 'cr-media-picker-thumb' });
					const img = thumb.createEl('img');
					img.src = this.app.vault.getResourcePath(file);
				}
			} else {
				// PDF or other - show icon
				const iconEl = item.createDiv({ cls: 'cr-media-picker-icon' });
				setIcon(iconEl, 'file-text');
			}

			// Filename
			item.createSpan({ text: fileName, cls: 'cr-media-picker-name' });

			// Remove button
			const removeBtn = item.createEl('button', {
				cls: 'cr-media-picker-remove clickable-icon',
				attr: { 'aria-label': 'Remove' }
			});
			setIcon(removeBtn, 'x');
			removeBtn.addEventListener('click', () => {
				this.media.splice(i, 1);
				this.renderMediaList();
			});
		}
	}

	private async saveSource(): Promise<void> {
		if (!this.title.trim()) {
			new Notice('Please enter a title');
			return;
		}

		try {
			const sourceService = new SourceService(this.app, this.plugin.settings);

			if (this.editMode && this.editingFile) {
				// Update existing source
				await sourceService.updateSource(this.editingFile, {
					title: this.title.trim(),
					sourceType: this.sourceType,
					date: this.date.trim() || undefined,
					dateAccessed: this.dateAccessed.trim() || undefined,
					repository: this.repository.trim() || undefined,
					repositoryUrl: this.repositoryUrl.trim() || undefined,
					collection: this.collection.trim() || undefined,
					location: this.location.trim() || undefined,
					confidence: this.confidence,
					media: this.media.length > 0 ? this.media : undefined
				});

				new Notice('Source updated');
			} else {
				// Create new source
				const file = await sourceService.createSource({
					title: this.title.trim(),
					sourceType: this.sourceType,
					date: this.date.trim() || undefined,
					dateAccessed: this.dateAccessed.trim() || undefined,
					repository: this.repository.trim() || undefined,
					repositoryUrl: this.repositoryUrl.trim() || undefined,
					collection: this.collection.trim() || undefined,
					location: this.location.trim() || undefined,
					confidence: this.confidence,
					media: this.media.length > 0 ? this.media : undefined,
					transcription: this.transcription.trim() || undefined
				});

				// Mark as saved successfully and clear persisted state
				this.savedSuccessfully = true;
				if (this.persistence) {
					void this.persistence.clear();
				}

				// Open the newly created file
				await this.app.workspace.openLinkText(file.path, '');

				this.close();
				this.onSuccess(file);
				return;
			}

			this.close();
			this.onSuccess();
		} catch (error) {
			new Notice(`Failed to ${this.editMode ? 'update' : 'create'} source: ${error}`);
		}
	}
}
