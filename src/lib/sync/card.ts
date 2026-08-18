import { get } from 'svelte/store';
import { isNull, sql } from 'drizzle-orm';
import { db, schema } from '$lib/db';
import { loadExperienceInput, listBadges } from '$lib/db/repository';
import { experience } from '$lib/domain/experience';
import { supabase } from './client';
import { account } from './auth';

/**
 * The few figures a profile page shows about an archer: arrows shot, outings, badges, level.
 *
 * Published, not synced. Every one of these is derived from the shooting record and recomputed on
 * each device, so the server cannot work them out and is never asked to. The device computes the
 * card and overwrites its own row; nothing ever reads it back into the local database.
 *
 * That one way street is the whole design. A figure that came back down would become a fact the app
 * reasons about, and a stale fact about somebody's badge count is a bug where a stale display is
 * merely yesterday's news.
 */

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

/**
 * Overwritten whole on every exchange. There is no merge and no conflict: the row belongs to one
 * archer, every device computes the same figures from the same record, and the last one to sync is
 * as right as any other.
 */
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
