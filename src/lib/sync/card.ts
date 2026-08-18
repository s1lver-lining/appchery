import { get } from 'svelte/store';
import { isNull, sql } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { loadExperienceInput, listBadges } from '$lib/db/repository';
import { experience } from '$lib/domain/experience';
import { supabase } from './client';
import { account } from './auth';

// The figures a profile page shows: arrows, outings, badges, level. Published rather than synced,
// see doc/sync.md § 6. Nothing reads a card back into the database, and that one way street is the
// whole design: a figure that came down would become something the app reasons about.

export interface ProfileCard {
	arrows: number;
	sessions: number;
	badges: number;
	level: number;
}

export async function buildCard(): Promise<ProfileCard> {
	const [counted] = await db()
		.select({
			arrows: sql<number>`coalesce(sum(${schema.activity.arrowsShot}), 0)`,
			activities: sql<number>`count(*)`
		})
		.from(schema.activity)
		.where(isNull(schema.activity.deletedAt));

	const [outings] = await db()
		.select({ n: sql<number>`count(*)` })
		.from(schema.session)
		.where(isNull(schema.session.deletedAt));

	const badges = await listBadges();
	const earned = experience(await loadExperienceInput());

	return {
		arrows: Number(counted?.arrows ?? 0),
		sessions: Number(outings?.n ?? 0),
		badges: badges.length,
		level: earned.level
	};
}

/** Overwritten whole: every device computes the same figures, so the last to sync is as right as any. */
export async function publishCard(): Promise<void> {
	const user = get(account);
	const client = await supabase();
	if (!user || !client) return;

	const card = await buildCard();
	await client.from('profile_card').upsert(
		{ user_id: user.id, ...card, updated_at: Date.now() },
		{ onConflict: 'user_id' }
	);
}

/** Somebody else's card, or null when they have never published one or may not be seen. */
export async function readCard(userId: string): Promise<ProfileCard | null> {
	const client = await supabase();
	if (!client) return null;

	const { data } = await client
		.from('profile_card')
		.select('arrows, sessions, badges, level')
		.eq('user_id', userId)
		.limit(1);

	const row = data?.[0];
	return row
		? {
				arrows: Number(row.arrows ?? 0),
				sessions: Number(row.sessions ?? 0),
				badges: Number(row.badges ?? 0),
				level: Number(row.level ?? 1)
			}
		: null;
}
