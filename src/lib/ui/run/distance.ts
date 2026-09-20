import { distanceParts } from '$lib/domain/running';

/**
 * A distance with its unit on it, for the places that say it in one string rather than drawing the
 * unit smaller beside the figure. The rule itself is in the domain, because the watch writes it too.
 */
export function sayDistance(
	metres: number,
	t: (key: string) => string,
	decimals = 3
): string {
	const { value, unit } = distanceParts(metres, decimals);
	// No space before the metres: it is read as one word at that size, which is where it is used.
	return unit === 'm' ? `${value}${t('running.metresShort')}` : `${value} ${t('running.km')}`;
}
