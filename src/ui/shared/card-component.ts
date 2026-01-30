/**
 * Shared card UI components used across multiple Control Center tabs
 */

import { createLucideIcon, LucideIconName } from '../lucide-icons';

/**
 * Create a stat item for a statistics grid
 */
export function createStatItem(container: HTMLElement, label: string, value: string, icon?: LucideIconName): void {
	const item = container.createDiv({ cls: 'crc-stat-item' });

	if (icon) {
		const iconEl = createLucideIcon(icon, 16);
		iconEl.addClass('crc-stat-icon');
		item.appendChild(iconEl);
	}

	const content = item.createDiv({ cls: 'crc-stat-content' });
	content.createEl('div', { text: value, cls: 'crc-stat-value' });
	content.createEl('div', { text: label, cls: 'crc-stat-label' });
}

/**
 * Get contrasting text color for a background color
 */
export function getContrastColor(hexColor: string): string {
	// Remove # if present
	const hex = hexColor.replace('#', '');

	// Convert to RGB
	const r = parseInt(hex.substring(0, 2), 16);
	const g = parseInt(hex.substring(2, 4), 16);
	const b = parseInt(hex.substring(4, 6), 16);

	// Calculate luminance
	const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

	return luminance > 0.5 ? '#000000' : '#ffffff';
}
