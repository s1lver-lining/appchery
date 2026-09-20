import type { BlockKind } from '$lib/domain/run/workout';

/**
 * What colour a block of a run wears, from the variables in app.css rather than from Tailwind
 * classes: the four are one family and a block paints itself through an inline style, the way the
 * charts do, so the hue can move with the theme without a class per kind per state.
 */
export const blockColour = (kind: BlockKind) => `var(--c-run-${kind})`;
export const blockTint = (kind: BlockKind) => `var(--c-run-${kind}-soft)`;

/** The card: its own pale ground, with the kind's own colour drawn down the edge of it. */
export function blockSkin(kind: BlockKind): string {
	return `background:${blockTint(kind)};border-color:${blockColour(kind)}40`;
}
