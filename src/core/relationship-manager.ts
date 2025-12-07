import { App, TFile, Notice } from 'obsidian';
import { RelationshipHistoryService, RelationshipChangeType } from './relationship-history';
import { getLogger } from './logging';
import { getErrorMessage } from './error-utils';

const logger = getLogger('RelationshipManager');

/**
 * Callback for recording relationship changes to history
 */
export type HistoryRecorder = (
	type: RelationshipChangeType,
	sourceFile: TFile,
	sourceName: string,
	sourceCrId: string,
	targetFile: TFile,
	targetName: string,
	targetCrId: string,
	newValue?: string
) => Promise<void>;

/**
 * Service for managing relationships between person notes
 * Handles bidirectional relationship updates in note frontmatter
 */
export class RelationshipManager {
	private historyRecorder?: HistoryRecorder;

	constructor(private app: App, historyService?: RelationshipHistoryService | null) {
		if (historyService) {
			this.historyRecorder = async (
				type, sourceFile, sourceName, sourceCrId,
				targetFile, targetName, targetCrId, newValue
			) => {
				await historyService.recordChange({
					type,
					sourceFile,
					sourceName,
					sourceCrId,
					targetFile,
					targetName,
					targetCrId,
					newValue,
					isBidirectionalSync: false
				});
			};
		}
	}

	/**
	 * Add a parent-child relationship
	 * Updates child's father_id/mother_id and parent's children_id
	 */
	async addParentRelationship(
		childFile: TFile,
		parentFile: TFile,
		parentType: 'father' | 'mother'
	): Promise<void> {
		// Extract cr_ids from both notes
		const childCrId = this.extractCrId(childFile);
		const parentCrId = this.extractCrId(parentFile);
		const parentSex = this.extractSex(parentFile);
		const childName = this.extractName(childFile);
		const parentName = this.extractName(parentFile);

		if (!childCrId || !parentCrId) {
			new Notice('Error: could not find cr_id in one or both notes');
			return;
		}

		// Validate parent type matches sex
		if (parentType === 'father' && parentSex === 'F') {
			new Notice('Warning: selected person has sex: F but being added as father');
		} else if (parentType === 'mother' && parentSex === 'M') {
			new Notice('Warning: selected person has sex: M but being added as mother');
		}

		// Update child's frontmatter
		await this.updateParentField(childFile, parentCrId, parentType);

		// Update parent's children_id array
		await this.addToChildrenArray(parentFile, childCrId);

		// Record to history
		if (this.historyRecorder) {
			const changeType: RelationshipChangeType = parentType === 'father' ? 'add_father' : 'add_mother';
			await this.historyRecorder(
				changeType,
				childFile, childName, childCrId,
				parentFile, parentName, parentCrId,
				`[[${parentName}]]`
			);
		}

		new Notice(
			`Added ${parentFile.basename} as ${parentType} of ${childFile.basename}`
		);
	}

	/**
	 * Add a spouse relationship
	 * Updates both notes' spouse_id arrays (bidirectional)
	 */
	async addSpouseRelationship(person1File: TFile, person2File: TFile): Promise<void> {
		const person1CrId = this.extractCrId(person1File);
		const person2CrId = this.extractCrId(person2File);
		const person1Name = this.extractName(person1File);
		const person2Name = this.extractName(person2File);

		if (!person1CrId || !person2CrId) {
			new Notice('Error: could not find cr_id in one or both notes');
			return;
		}

		// Add each person to the other's spouse_id array
		await this.addToSpouseArray(person1File, person2CrId);
		await this.addToSpouseArray(person2File, person1CrId);

		// Record to history (record as person1 adding spouse person2)
		if (this.historyRecorder) {
			await this.historyRecorder(
				'add_spouse',
				person1File, person1Name, person1CrId,
				person2File, person2Name, person2CrId,
				`[[${person2Name}]]`
			);
		}

		new Notice(`Added spouse relationship between ${person1File.basename} and ${person2File.basename}`);
	}

	/**
	 * Add a parent-child relationship (inverse of addParent)
	 * Updates parent's children_id and child's father_id/mother_id
	 */
	async addChildRelationship(
		parentFile: TFile,
		childFile: TFile
	): Promise<void> {
		const parentCrId = this.extractCrId(parentFile);
		const childCrId = this.extractCrId(childFile);
		const parentSex = this.extractSex(parentFile);
		const parentName = this.extractName(parentFile);
		const childName = this.extractName(childFile);

		if (!childCrId || !parentCrId) {
			new Notice('Error: could not find cr_id in one or both notes');
			return;
		}

		// Determine parent type from sex
		const parentType: 'father' | 'mother' = parentSex === 'F' ? 'mother' : 'father';

		// Update child's frontmatter
		await this.updateParentField(childFile, parentCrId, parentType);

		// Update parent's children_id array
		await this.addToChildrenArray(parentFile, childCrId);

		// Record to history
		if (this.historyRecorder) {
			await this.historyRecorder(
				'add_child',
				parentFile, parentName, parentCrId,
				childFile, childName, childCrId,
				`[[${childName}]]`
			);
		}

		new Notice(`Added ${childFile.basename} as child of ${parentFile.basename}`);
	}

	/**
	 * Extract cr_id from note frontmatter
	 */
	private extractCrId(file: TFile): string | null {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.cr_id ?? null;
	}

	/**
	 * Extract sex from note frontmatter
	 */
	private extractSex(file: TFile): string | null {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.sex ?? null;
	}

	/**
	 * Extract name from note frontmatter, falling back to filename
	 */
	private extractName(file: TFile): string {
		const cache = this.app.metadataCache.getFileCache(file);
		return cache?.frontmatter?.name ?? file.basename;
	}

	/**
	 * Update father_id or mother_id field in child's frontmatter
	 * Uses processFrontMatter to safely modify without corrupting other fields
	 */
	private async updateParentField(
		childFile: TFile,
		parentCrId: string,
		parentType: 'father' | 'mother'
	): Promise<void> {
		const fieldName = parentType === 'father' ? 'father_id' : 'mother_id';

		try {
			await this.app.fileManager.processFrontMatter(childFile, (frontmatter) => {
				const existingValue = frontmatter[fieldName];
				if (existingValue && existingValue !== '' && existingValue !== parentCrId) {
					new Notice(`Warning: ${fieldName} already set to ${existingValue}, replacing with ${parentCrId}`);
				}
				frontmatter[fieldName] = parentCrId;
			});
		} catch (error) {
			logger.error('relationship-manager', 'Failed to update parent field', {
				file: childFile.path,
				fieldName,
				error: getErrorMessage(error)
			});
		}
	}

	/**
	 * Add cr_id to parent's children_id array
	 * Uses processFrontMatter to safely modify without corrupting other fields
	 */
	private async addToChildrenArray(parentFile: TFile, childCrId: string): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(parentFile, (frontmatter) => {
				const existing = frontmatter.children_id;

				if (!existing) {
					// Field doesn't exist, create as array with single value
					frontmatter.children_id = [childCrId];
				} else if (Array.isArray(existing)) {
					// Already an array, add if not present
					if (!existing.includes(childCrId)) {
						existing.push(childCrId);
					}
				} else {
					// Single value, convert to array if different
					if (existing !== childCrId) {
						frontmatter.children_id = [existing, childCrId];
					}
				}
			});
		} catch (error) {
			logger.error('relationship-manager', 'Failed to add to children array', {
				file: parentFile.path,
				error: getErrorMessage(error)
			});
		}
	}

	/**
	 * Add cr_id to person's spouse_id array
	 * Uses processFrontMatter to safely modify without corrupting other fields
	 */
	private async addToSpouseArray(personFile: TFile, spouseCrId: string): Promise<void> {
		try {
			await this.app.fileManager.processFrontMatter(personFile, (frontmatter) => {
				const existing = frontmatter.spouse_id;

				if (!existing) {
					// Field doesn't exist, create as array with single value
					frontmatter.spouse_id = [spouseCrId];
				} else if (Array.isArray(existing)) {
					// Already an array, add if not present
					if (!existing.includes(spouseCrId)) {
						existing.push(spouseCrId);
					}
				} else {
					// Single value, convert to array if different
					if (existing !== spouseCrId) {
						frontmatter.spouse_id = [existing, spouseCrId];
					}
				}
			});
		} catch (error) {
			logger.error('relationship-manager', 'Failed to add to spouse array', {
				file: personFile.path,
				error: getErrorMessage(error)
			});
		}
	}
}
