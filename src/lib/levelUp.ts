import { get } from 'svelte/store';
import { celebratedLevel } from '$lib/prefs';
import { loadExperienceInput } from '$lib/db/repository';
import { experience } from '$lib/domain/experience';
import type { Award } from '$lib/ui/Fireworks.svelte';

/**
 * The card announcing a level just climbed, or null when nothing was climbed.
 *
 * Asked at the moments something can have been earned, never on the way past: the points are worked
 * out from every activity ever shot, so this is not a question to put on every arrow. Call it after
 * the badges have been awarded, since a badge pays too and a round can win both at once.
 *
 * The level reached is always recorded, climbed or not, so an archer who deletes the session that
 * took them up is congratulated again when they shoot it back.
 */
export async function levelUpAward(
	t: (key: string, params?: Record<string, string | number>) => string
): Promise<Award | null> {
	const { level, total } = experience(await loadExperienceInput());
	const told = get(celebratedLevel);
	celebratedLevel.set(level);
	// Nothing to compare against on the first look, and a first look is never a level up.
	if (told === 0 || level <= told) return null;
	return {
		title: t('experience.levelUp'),
		subtitle: t('experience.points', { xp: total.toLocaleString() }),
		score: level
	};
}
