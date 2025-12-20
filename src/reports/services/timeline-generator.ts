/**
 * Timeline Report Generator
 *
 * Generates chronological reports of events with dates, participants,
 * places, and optional grouping by year/decade/person/place.
 */

import { App } from 'obsidian';
import type { CanvasRootsSettings } from '../../settings';
import type {
	TimelineReportOptions,
	TimelineReportResult,
	TimelineEntry,
	ReportPerson
} from '../types/report-types';
import { FamilyGraphService } from '../../core/family-graph';
import { FolderFilterService } from '../../core/folder-filter';
import { EventService } from '../../events/services/event-service';
import { EventNote } from '../../events/types/event-types';
import { getLogger } from '../../core/logging';

const logger = getLogger('TimelineGenerator');

/**
 * Generator for Timeline reports
 */
export class TimelineGenerator {
	private app: App;
	private settings: CanvasRootsSettings;

	constructor(app: App, settings: CanvasRootsSettings) {
		this.app = app;
		this.settings = settings;
	}

	/**
	 * Generate a Timeline report
	 */
	async generate(options: TimelineReportOptions): Promise<TimelineReportResult> {
		await Promise.resolve(); // Satisfy async requirement
		logger.info('generate', 'Generating Timeline Report', { grouping: options.grouping });

		const warnings: string[] = [];

		// Initialize services
		const eventService = new EventService(this.app, this.settings);
		const familyGraph = new FamilyGraphService(this.app);
		if (this.settings.folderFilterMode !== 'disabled') {
			familyGraph.setFolderFilter(new FolderFilterService(this.settings));
		}
		familyGraph.setPropertyAliases(this.settings.propertyAliases);
		familyGraph.setValueAliases(this.settings.valueAliases);
		familyGraph.setSettings(this.settings);
		familyGraph.ensureCacheLoaded();

		// Get all events
		let events = eventService.getAllEvents();

		// Apply filters
		events = this.applyFilters(events, options);

		// Convert to timeline entries
		const entries: TimelineEntry[] = events.map(event =>
			this.eventToTimelineEntry(event, familyGraph)
		);

		// Sort chronologically
		entries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

		// Calculate summary
		const participantSet = new Set<string>();
		const placeSet = new Set<string>();
		for (const entry of entries) {
			for (const p of entry.participants) {
				participantSet.add(p.crId);
			}
			if (entry.placeCrId) {
				placeSet.add(entry.placeCrId);
			}
		}

		const summary = {
			eventCount: entries.length,
			participantCount: participantSet.size,
			placeCount: placeSet.size
		};

		// Determine date range
		const dateRange: { from?: string; to?: string } = {};
		if (entries.length > 0) {
			dateRange.from = entries[0].date || entries[0].sortDate;
			dateRange.to = entries[entries.length - 1].date || entries[entries.length - 1].sortDate;
		}

		// Group entries if requested
		let groupedEntries: Record<string, TimelineEntry[]> | undefined;
		if (options.grouping !== 'none') {
			groupedEntries = this.groupEntries(entries, options.grouping);
		}

		// Generate markdown content
		const content = this.generateMarkdown(
			dateRange,
			summary,
			entries,
			groupedEntries,
			options
		);

		const date = new Date().toISOString().split('T')[0];
		const suggestedFilename = `Timeline Report - ${date}.md`;

		return {
			success: true,
			content,
			suggestedFilename,
			stats: {
				peopleCount: participantSet.size,
				eventsCount: entries.length,
				sourcesCount: 0
			},
			warnings,
			dateRange,
			summary,
			entries,
			groupedEntries
		};
	}

	/**
	 * Apply filters to events
	 */
	private applyFilters(events: EventNote[], options: TimelineReportOptions): EventNote[] {
		let filtered = events;

		// Date range filter
		if (options.dateFrom) {
			filtered = filtered.filter(e => {
				if (!e.date) return false;
				const sortDate = this.extractSortDate(e.date);
				return sortDate >= options.dateFrom!;
			});
		}
		if (options.dateTo) {
			filtered = filtered.filter(e => {
				if (!e.date) return false;
				const sortDate = this.extractSortDate(e.date);
				return sortDate <= options.dateTo!;
			});
		}

		// Event type filter
		if (options.eventTypes && options.eventTypes.length > 0) {
			filtered = filtered.filter(e => options.eventTypes.includes(e.eventType));
		}

		// Person filter
		if (options.personFilter && options.personFilter.length > 0) {
			filtered = filtered.filter(e => {
				// Check if any participant matches the filter
				const participants = this.getEventParticipants(e);
				return participants.some(p => options.personFilter.includes(p));
			});
		}

		// Place filter
		if (options.placeFilter && options.placeFilter.length > 0) {
			filtered = filtered.filter(e => {
				if (!e.place) return false;
				const placeName = this.extractLinkName(e.place);
				// TODO: If includeChildPlaces, expand place hierarchy
				return options.placeFilter.includes(placeName);
			});
		}

		// Universe filter
		if (options.universeCrId) {
			filtered = filtered.filter(e => e.universe === options.universeCrId);
		}

		return filtered;
	}

	/**
	 * Get participant identifiers from an event
	 */
	private getEventParticipants(event: EventNote): string[] {
		const participants: string[] = [];
		if (event.person) {
			participants.push(this.extractLinkName(event.person));
		}
		if (event.persons) {
			for (const p of event.persons) {
				participants.push(this.extractLinkName(p));
			}
		}
		return participants;
	}

	/**
	 * Convert an EventNote to a TimelineEntry
	 */
	private eventToTimelineEntry(event: EventNote, familyGraph: FamilyGraphService): TimelineEntry {
		// Get participants
		const participants: ReportPerson[] = [];
		const participantNames = this.getEventParticipants(event);
		const allPeople = familyGraph.getAllPeople();

		for (const name of participantNames) {
			// Try to find person in graph by name
			const personNode = allPeople.find(p => p.name === name);
			if (personNode) {
				participants.push({
					crId: personNode.crId,
					name: personNode.name,
					birthDate: personNode.birthDate,
					birthPlace: personNode.birthPlace,
					deathDate: personNode.deathDate,
					deathPlace: personNode.deathPlace,
					filePath: personNode.file.path
				});
			} else {
				// Create a minimal entry
				participants.push({
					crId: '',
					name,
					filePath: ''
				});
			}
		}

		// Extract place info
		const placeName = event.place ? this.extractLinkName(event.place) : undefined;

		return {
			date: event.date || '',
			sortDate: this.extractSortDate(event.date || '') || '9999-99-99',
			type: event.eventType,
			description: event.description,
			participants,
			place: placeName,
			placeCrId: placeName, // Using name as ID for now
			sources: event.sources || []
		};
	}

	/**
	 * Group entries by the specified method
	 */
	private groupEntries(
		entries: TimelineEntry[],
		grouping: 'none' | 'by_year' | 'by_decade' | 'by_person' | 'by_place'
	): Record<string, TimelineEntry[]> {
		const grouped: Record<string, TimelineEntry[]> = {};

		for (const entry of entries) {
			let key: string;

			switch (grouping) {
				case 'by_year': {
					const year = this.extractYear(entry.sortDate);
					key = year || 'Unknown date';
					break;
				}
				case 'by_decade': {
					const year = this.extractYear(entry.sortDate);
					if (year) {
						const decade = Math.floor(parseInt(year, 10) / 10) * 10;
						key = `${decade}s`;
					} else {
						key = 'Unknown date';
					}
					break;
				}
				case 'by_person': {
					if (entry.participants.length > 0) {
						key = entry.participants[0].name;
					} else {
						key = 'Unknown participant';
					}
					break;
				}
				case 'by_place': {
					key = entry.place || 'Unknown place';
					break;
				}
				default:
					key = 'All events';
			}

			if (!grouped[key]) {
				grouped[key] = [];
			}
			grouped[key].push(entry);
		}

		return grouped;
	}

	/**
	 * Extract year from a date string
	 */
	private extractYear(date: string): string | null {
		const match = date.match(/\d{4}/);
		return match ? match[0] : null;
	}

	/**
	 * Extract a sortable date from various date formats
	 */
	private extractSortDate(date: string): string {
		if (!date) return '';

		// Already in YYYY-MM-DD format
		if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			return date;
		}

		// YYYY-MM format
		if (/^\d{4}-\d{2}$/.test(date)) {
			return date + '-01';
		}

		// YYYY format
		if (/^\d{4}$/.test(date)) {
			return date + '-01-01';
		}

		// Try to extract year
		const yearMatch = date.match(/\d{4}/);
		if (yearMatch) {
			return yearMatch[0] + '-01-01';
		}

		return '';
	}

	/**
	 * Extract the name from a wikilink
	 */
	private extractLinkName(link: string): string {
		// Remove [[ and ]]
		let name = link.replace(/^\[\[/, '').replace(/\]\]$/, '');
		// Handle aliases [[Name|Alias]] - take the name part
		if (name.includes('|')) {
			name = name.split('|')[0];
		}
		return name.trim();
	}

	/**
	 * Generate markdown content for the Timeline Report
	 */
	private generateMarkdown(
		dateRange: { from?: string; to?: string },
		summary: { eventCount: number; participantCount: number; placeCount: number },
		entries: TimelineEntry[],
		groupedEntries: Record<string, TimelineEntry[]> | undefined,
		options: TimelineReportOptions
	): string {
		const lines: string[] = [];
		const date = new Date().toLocaleDateString();

		// Title
		lines.push('# Timeline Report');
		lines.push('');
		lines.push(`Generated: ${date}`);
		if (dateRange.from || dateRange.to) {
			const rangeStr = [dateRange.from, dateRange.to].filter(Boolean).join(' to ');
			lines.push(`Date range: ${rangeStr}`);
		}
		lines.push('');

		// Summary
		lines.push('## Summary');
		lines.push('');
		lines.push(`- **Total events:** ${summary.eventCount}`);
		lines.push(`- **Participants:** ${summary.participantCount}`);
		lines.push(`- **Places:** ${summary.placeCount}`);
		lines.push('');

		// Events (grouped or flat)
		if (groupedEntries) {
			// Sort group keys appropriately
			const keys = Object.keys(groupedEntries).sort((a, b) => {
				// Numeric/date-based groups should sort numerically
				if (a.match(/^\d/) && b.match(/^\d/)) {
					return a.localeCompare(b);
				}
				return a.localeCompare(b);
			});

			for (const key of keys) {
				const groupEntries = groupedEntries[key];
				lines.push(`## ${key}`);
				lines.push('');
				this.renderEventTable(lines, groupEntries, options);
				lines.push('');
			}
		} else {
			lines.push('## Events');
			lines.push('');
			this.renderEventTable(lines, entries, options);
			lines.push('');
		}

		// Footer
		lines.push('---');
		lines.push('*Generated by Canvas Roots*');

		return lines.join('\n');
	}

	/**
	 * Render a table of events
	 */
	private renderEventTable(
		lines: string[],
		entries: TimelineEntry[],
		options: TimelineReportOptions
	): void {
		if (options.includeDescriptions) {
			lines.push('| Date | Event | Participants | Place | Description |');
			lines.push('|------|-------|--------------|-------|-------------|');
		} else {
			lines.push('| Date | Event | Participants | Place |');
			lines.push('|------|-------|--------------|-------|');
		}

		for (const entry of entries) {
			const date = entry.date || '';
			const type = entry.type;
			const participants = entry.participants
				.map(p => p.crId ? `[[${p.name}]]` : p.name)
				.join(', ');
			const place = entry.place ? `[[${entry.place}]]` : '';
			const description = entry.description || '';

			if (options.includeDescriptions) {
				lines.push(`| ${date} | ${type} | ${participants} | ${place} | ${description} |`);
			} else {
				lines.push(`| ${date} | ${type} | ${participants} | ${place} |`);
			}
		}
	}
}
