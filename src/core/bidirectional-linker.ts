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
			if (frontmatter.spouse) {
				const spouses = Array.isArray(frontmatter.spouse)
					? frontmatter.spouse
					: [frontmatter.spouse];

				for (const spouse of spouses) {
					await this.syncSpouse(spouse, personFile, personName);
				}
			}

			logger.info('bidirectional-linking', 'Relationship sync completed', {
				file: personFile.path
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
	 * Sync parent-child relationship
	 * Ensures parent has this person in their children array
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

		// Read parent's frontmatter
		const parentCache = this.app.metadataCache.getFileCache(parentFile);
		if (!parentCache?.frontmatter) {
			logger.warn('bidirectional-linking', 'Parent has no frontmatter', {
				parentFile: parentFile.path
			});
			return;
		}

		// Check if child is already in parent's children array
		const children = parentCache.frontmatter.children || [];
		const childrenArray = Array.isArray(children) ? children : [children];

		// Extract link text from wikilinks
		const childLinkText = `[[${childName}]]`;
		const hasChild = childrenArray.some(child => {
			const linkText = typeof child === 'string' ? child : String(child);
			return linkText.includes(childName) || linkText.includes(childFile.basename);
		});

		if (hasChild) {
			logger.debug('bidirectional-linking', 'Child already in parent children', {
				parentFile: parentFile.path,
				childFile: childFile.path
			});
			return;
		}

		// Add child to parent's children array
		await this.addToArrayField(parentFile, 'children', childLinkText);

		logger.info('bidirectional-linking', 'Added child to parent', {
			parentFile: parentFile.path,
			childFile: childFile.path,
			relationshipType
		});
	}

	/**
	 * Sync spouse relationship (bidirectional)
	 * Ensures both spouses list each other
	 */
	private async syncSpouse(
		spouseLink: string,
		personFile: TFile,
		personName: string
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

		// Check if person is already in spouse's spouse field
		const spouseSpouses = spouseCache.frontmatter.spouse;
		const spouseArray = spouseSpouses
			? Array.isArray(spouseSpouses)
				? spouseSpouses
				: [spouseSpouses]
			: [];

		const personLinkText = `[[${personName}]]`;
		const hasSpouse = spouseArray.some(spouse => {
			const linkText = typeof spouse === 'string' ? spouse : String(spouse);
			return linkText.includes(personName) || linkText.includes(personFile.basename);
		});

		if (hasSpouse) {
			logger.debug('bidirectional-linking', 'Spouse already linked', {
				spouseFile: spouseFile.path,
				personFile: personFile.path
			});
			return;
		}

		// Add person to spouse's spouse field
		// If spouse field is empty, set it as a single value
		// If spouse field has one value, convert to array
		// If spouse field is already an array, add to it
		if (spouseArray.length === 0) {
			await this.setField(spouseFile, 'spouse', personLinkText);
		} else if (spouseArray.length === 1) {
			// Convert to array
			await this.setField(spouseFile, 'spouse', [spouseArray[0], personLinkText]);
		} else {
			await this.addToArrayField(spouseFile, 'spouse', personLinkText);
		}

		logger.info('bidirectional-linking', 'Added spouse bidirectional link', {
			spouseFile: spouseFile.path,
			personFile: personFile.path
		});
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
