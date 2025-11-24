import { App, TFile, Notice } from 'obsidian';
import { getLogger } from './logging';

const logger = getLogger('BidirectionalLinker');

/**
 * Service for maintaining bidirectional relationship links between person notes
 *
 * Ensures that when a relationship is created in one direction,
 * the inverse relationship is automatically created in the other direction.
 *
 * Examples:
 * - father: [[John]] in Jane's note → children: [[Jane]] in John's note
 * - spouse: [[Jane]] in John's note → spouse: [[John]] in Jane's note
 */
export class BidirectionalLinker {
	constructor(private app: App) {}

	/**
	 * Synchronize relationships after a person note is created or updated
	 *
	 * This should be called whenever:
	 * - A new person note is created with relationship fields
	 * - An existing person note's relationships are modified
	 *
	 * @param personFile The person note file that was created/updated
	 */
	async syncRelationships(personFile: TFile): Promise<void> {
		logger.info('bidirectional-linking', 'Starting relationship sync', {
			file: personFile.path
		});

		try {
			// Read the person's metadata
			const cache = this.app.metadataCache.getFileCache(personFile);
			if (!cache?.frontmatter) {
				logger.warn('bidirectional-linking', 'No frontmatter found', {
					file: personFile.path
				});
				return;
			}

			const frontmatter = cache.frontmatter;
			const personName = frontmatter.name || personFile.basename;
			const personCrId = frontmatter.cr_id;

			if (!personCrId) {
				logger.warn('bidirectional-linking', 'No cr_id found', {
					file: personFile.path
				});
				return;
			}

			// Sync father relationship
			if (frontmatter.father) {
				await this.syncParentChild(
					frontmatter.father,
					personFile,
					personName,
					'father'
				);
			}

			// Sync mother relationship
			if (frontmatter.mother) {
				await this.syncParentChild(
					frontmatter.mother,
					personFile,
					personName,
					'mother'
				);
			}

			// Sync spouse relationship(s)
			// Handle both simple spouse/spouse_id and indexed spouse1/spouse1_id format
			const spousesToSync: Array<{link: string, index?: number}> = [];

			// Check for simple spouse property
			if (frontmatter.spouse) {
				const spouses = Array.isArray(frontmatter.spouse)
					? frontmatter.spouse
					: [frontmatter.spouse];

				for (const spouse of spouses) {
					spousesToSync.push({ link: spouse });
				}
			}

			// Check for indexed spouse properties (spouse1, spouse2, etc.)
			for (const key of Object.keys(frontmatter)) {
				const match = key.match(/^spouse(\d+)$/);
				if (match) {
					const index = parseInt(match[1]);
					const spouseLink = frontmatter[key];
					if (spouseLink) {
						spousesToSync.push({ link: spouseLink, index });
					}
				}
			}

			// Sync all discovered spouse relationships
			for (const spouse of spousesToSync) {
				await this.syncSpouse(spouse.link, personFile, personName, personCrId, spouse.index);
			}

			logger.info('bidirectional-linking', 'Relationship sync completed', {
				file: personFile.path,
				spouseCount: spousesToSync.length
			});
		} catch (error) {
			logger.error('bidirectional-linking', 'Failed to sync relationships', {
				file: personFile.path,
				error: error.message
			});
			new Notice(`Failed to sync relationships: ${error.message}`);
		}
	}

	/**
	 * Sync parent-child relationship (dual storage)
	 * Ensures parent has this person in their children array + children_id array
	 */
	private async syncParentChild(
		parentLink: string,
		childFile: TFile,
		childName: string,
		relationshipType: 'father' | 'mother'
	): Promise<void> {
		const parentFile = this.resolveLink(parentLink, childFile);
		if (!parentFile) {
			logger.warn('bidirectional-linking', `${relationshipType} file not found`, {
				parentLink,
				childFile: childFile.path
			});
			return;
		}

		// Read parent's and child's frontmatter
		const parentCache = this.app.metadataCache.getFileCache(parentFile);
		if (!parentCache?.frontmatter) {
			logger.warn('bidirectional-linking', 'Parent has no frontmatter', {
				parentFile: parentFile.path
			});
			return;
		}

		const childCache = this.app.metadataCache.getFileCache(childFile);
		const childCrId = childCache?.frontmatter?.cr_id;

		if (!childCrId) {
			logger.warn('bidirectional-linking', 'Child has no cr_id', {
				childFile: childFile.path
			});
			return;
		}

		// Check if child is already in parent's children arrays (check both fields)
		const childrenLinks = parentCache.frontmatter.children || [];
		const childrenIds = parentCache.frontmatter.children_id || [];
		const childrenLinksArray = Array.isArray(childrenLinks) ? childrenLinks : [childrenLinks];
		const childrenIdsArray = Array.isArray(childrenIds) ? childrenIds : [childrenIds];

		// Check by cr_id first (more reliable)
		const hasChildById = childrenIdsArray.includes(childCrId);

		// Also check wikilinks for backward compatibility
		const childLinkText = `[[${childName}]]`;
		const hasChildByLink = childrenLinksArray.some(child => {
			const linkText = typeof child === 'string' ? child : String(child);
			return linkText.includes(childName) || linkText.includes(childFile.basename);
		});

		if (hasChildById || hasChildByLink) {
			logger.debug('bidirectional-linking', 'Child already in parent children', {
				parentFile: parentFile.path,
				childFile: childFile.path,
				hasById: hasChildById,
				hasByLink: hasChildByLink
			});
			return;
		}

		// Add child to parent's children arrays (dual storage)
		await this.addToArrayField(parentFile, 'children', childLinkText);
		await this.addToArrayField(parentFile, 'children_id', childCrId);

		logger.info('bidirectional-linking', 'Added child to parent (dual storage)', {
			parentFile: parentFile.path,
			childFile: childFile.path,
			relationshipType,
			wikilink: childLinkText,
			crId: childCrId
		});
	}

	/**
	 * Sync spouse relationship (bidirectional, dual storage)
	 * Ensures both spouses list each other in spouse/spouse_id or indexed spouse properties
	 * @param spouseLink Wikilink to spouse
	 * @param personFile Person's file
	 * @param personName Person's name
	 * @param personCrId Person's cr_id
	 * @param spouseIndex Optional index for indexed spouse properties (spouse1, spouse2, etc.)
	 */
	private async syncSpouse(
		spouseLink: string,
		personFile: TFile,
		personName: string,
		personCrId: string,
		spouseIndex?: number
	): Promise<void> {
		const spouseFile = this.resolveLink(spouseLink, personFile);
		if (!spouseFile) {
			logger.warn('bidirectional-linking', 'Spouse file not found', {
				spouseLink,
				personFile: personFile.path
			});
			return;
		}

		// Read spouse's frontmatter
		const spouseCache = this.app.metadataCache.getFileCache(spouseFile);
		if (!spouseCache?.frontmatter) {
			logger.warn('bidirectional-linking', 'Spouse has no frontmatter', {
				spouseFile: spouseFile.path
			});
			return;
		}

		const spouseFm = spouseCache.frontmatter;

		// Check if person is already linked (check both simple and indexed formats)
		let alreadyLinked = false;

		// Check simple spouse/spouse_id properties
		const spouseLinks = spouseFm.spouse;
		const spouseIds = spouseFm.spouse_id;
		const spouseLinksArray = spouseLinks
			? Array.isArray(spouseLinks) ? spouseLinks : [spouseLinks]
			: [];
		const spouseIdsArray = spouseIds
			? Array.isArray(spouseIds) ? spouseIds : [spouseIds]
			: [];

		const personLinkText = `[[${personName}]]`;

		// Check by cr_id first (more reliable)
		if (spouseIdsArray.includes(personCrId)) {
			alreadyLinked = true;
		}

		// Also check wikilinks for backward compatibility
		if (spouseLinksArray.some(spouse => {
			const linkText = typeof spouse === 'string' ? spouse : String(spouse);
			return linkText.includes(personName) || linkText.includes(personFile.basename);
		})) {
			alreadyLinked = true;
		}

		// Check indexed spouse properties (spouse1_id, spouse2_id, etc.)
		if (!alreadyLinked) {
			for (const key of Object.keys(spouseFm)) {
				const match = key.match(/^spouse(\d+)_id$/);
				if (match && spouseFm[key] === personCrId) {
					alreadyLinked = true;
					break;
				}
			}
		}

		if (alreadyLinked) {
			logger.debug('bidirectional-linking', 'Spouse already linked', {
				spouseFile: spouseFile.path,
				personFile: personFile.path
			});
			return;
		}

		// Add person to spouse's spouse fields
		// Use indexed format if the source used indexed format, otherwise use simple format
		if (spouseIndex !== undefined) {
			// Find next available index in spouse's file
			let nextIndex = 1;
			while (spouseFm[`spouse${nextIndex}`] || spouseFm[`spouse${nextIndex}_id`]) {
				nextIndex++;
			}

			// Add indexed spouse properties
			await this.setField(spouseFile, `spouse${nextIndex}`, personLinkText);
			await this.setField(spouseFile, `spouse${nextIndex}_id`, personCrId);

			logger.info('bidirectional-linking', 'Added indexed spouse bidirectional link', {
				spouseFile: spouseFile.path,
				personFile: personFile.path,
				index: nextIndex,
				wikilink: personLinkText,
				crId: personCrId
			});
		} else {
			// Use simple spouse/spouse_id format
			if (spouseLinksArray.length === 0) {
				// First spouse - set as single value
				await this.setField(spouseFile, 'spouse', personLinkText);
				await this.setField(spouseFile, 'spouse_id', personCrId);
			} else if (spouseLinksArray.length === 1) {
				// Second spouse - convert to array
				await this.setField(spouseFile, 'spouse', [spouseLinksArray[0], personLinkText]);
				// Handle spouse_id similarly
				if (spouseIdsArray.length === 1) {
					await this.setField(spouseFile, 'spouse_id', [spouseIdsArray[0], personCrId]);
				} else {
					await this.setField(spouseFile, 'spouse_id', personCrId);
				}
			} else {
				// Multiple spouses - add to array
				await this.addToArrayField(spouseFile, 'spouse', personLinkText);
				await this.addToArrayField(spouseFile, 'spouse_id', personCrId);
			}

			logger.info('bidirectional-linking', 'Added spouse bidirectional link (simple format)', {
				spouseFile: spouseFile.path,
				personFile: personFile.path,
				wikilink: personLinkText,
				crId: personCrId
			});
		}
	}

	/**
	 * Resolve a wikilink to a TFile
	 */
	private resolveLink(link: string, sourceFile: TFile): TFile | null {
		// Remove wikilink brackets and any aliases
		const cleanLink = link.replace(/\[\[|\]\]/g, '').split('|')[0].trim();

		// Try to resolve the link
		const linkedFile = this.app.metadataCache.getFirstLinkpathDest(cleanLink, sourceFile.path);

		return linkedFile instanceof TFile ? linkedFile : null;
	}

	/**
	 * Add a value to an array field in frontmatter
	 */
	private async addToArrayField(
		file: TFile,
		fieldName: string,
		value: string
	): Promise<void> {
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Find frontmatter boundaries
		let frontmatterStart = -1;
		let frontmatterEnd = -1;

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				if (frontmatterStart === -1) {
					frontmatterStart = i;
				} else {
					frontmatterEnd = i;
					break;
				}
			}
		}

		if (frontmatterStart === -1 || frontmatterEnd === -1) {
			logger.error('bidirectional-linking', 'Could not find frontmatter', {
				file: file.path
			});
			return;
		}

		// Find the field or insert it
		let fieldLineIndex = -1;
		let isArrayField = false;

		for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
			const line = lines[i];
			if (line.startsWith(`${fieldName}:`)) {
				fieldLineIndex = i;
				// Check if it's already an array
				isArrayField = line.trim().endsWith(':') || line.includes('[');
				break;
			}
		}

		if (fieldLineIndex === -1) {
			// Field doesn't exist, create it as array with single value
			lines.splice(frontmatterEnd, 0, `${fieldName}:`, `  - ${value}`);
		} else if (!isArrayField) {
			// Field exists as single value, convert to array
			const existingValue = lines[fieldLineIndex].split(':')[1].trim();
			lines[fieldLineIndex] = `${fieldName}:`;
			lines.splice(fieldLineIndex + 1, 0, `  - ${existingValue}`, `  - ${value}`);
		} else {
			// Field exists as array, add to end
			// Find the last array item
			let lastArrayLine = fieldLineIndex;
			for (let i = fieldLineIndex + 1; i < frontmatterEnd; i++) {
				if (lines[i].trim().startsWith('- ')) {
					lastArrayLine = i;
				} else if (!lines[i].trim().startsWith('#')) {
					// Not a comment, must be next field
					break;
				}
			}
			lines.splice(lastArrayLine + 1, 0, `  - ${value}`);
		}

		// Write back
		await this.app.vault.modify(file, lines.join('\n'));
	}

	/**
	 * Set a field value in frontmatter (replacing existing value)
	 */
	private async setField(
		file: TFile,
		fieldName: string,
		value: string | string[]
	): Promise<void> {
		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		// Find frontmatter boundaries
		let frontmatterStart = -1;
		let frontmatterEnd = -1;

		for (let i = 0; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				if (frontmatterStart === -1) {
					frontmatterStart = i;
				} else {
					frontmatterEnd = i;
					break;
				}
			}
		}

		if (frontmatterStart === -1 || frontmatterEnd === -1) {
			logger.error('bidirectional-linking', 'Could not find frontmatter', {
				file: file.path
			});
			return;
		}

		// Find and remove existing field
		let fieldLineIndex = -1;
		for (let i = frontmatterStart + 1; i < frontmatterEnd; i++) {
			if (lines[i].startsWith(`${fieldName}:`)) {
				fieldLineIndex = i;
				// Remove field and its array items if any
				let j = i + 1;
				while (j < frontmatterEnd && lines[j].trim().startsWith('- ')) {
					j++;
				}
				lines.splice(i, j - i);
				frontmatterEnd -= (j - i);
				break;
			}
		}

		// Add new field value
		if (Array.isArray(value)) {
			const newLines = [`${fieldName}:`];
			value.forEach(v => newLines.push(`  - ${v}`));
			lines.splice(frontmatterEnd, 0, ...newLines);
		} else {
			lines.splice(frontmatterEnd, 0, `${fieldName}: ${value}`);
		}

		// Write back
		await this.app.vault.modify(file, lines.join('\n'));
	}
}
