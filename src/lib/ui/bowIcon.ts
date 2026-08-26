import type { BowType } from '$lib/domain/tuning/templates';
import type { IconName } from './Icon.svelte';

/** The silhouette each kind of bow is known by, so a type can be shown rather than spelled out. */
export const BOW_ICONS: Record<BowType, IconName> = {
	recurve: 'bowRecurve',
	compound: 'bowCompound',
	barebow: 'bowBarebow',
	longbow: 'bowLongbow'
};
