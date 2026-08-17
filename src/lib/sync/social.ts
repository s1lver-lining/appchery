import { eq, desc, ne, isNotNull, isNull, and } from 'drizzle-orm';
import { get } from 'svelte/store';
import { db, schema } from '$lib/db';
import { supabase } from './client';
import { account } from './auth';

/**
 * Handles, following, blocking and shared activities: everything the client asks the server about
 * other archers, in one place. See doc/sync.md section 6.
 *
 * Two rules hold throughout. Changing anything social needs a connection and says so, rather than
 * queueing something that sits unsent for days. Reading is answered from the local cache first, so
 * the friends screen is legible at a range with no signal.
 *
 * Nothing here writes to the archer's own tables. A shared activity is cached whole, apart, and read
 * only, because somebody else's arrows must never reach these averages, records or badges.
 */

export class SocialError extends Error {}

export interface Profile {
	userId: string;
	handle: string;
	displayName: string | null;
	isPublic: boolean;
	/** none | pending | approved */
	followStatus: string;
	followsUs: string;
}

export interface SharedActivity {
	id: string;
	ownerId: string;
	sharedAt: number;
	activity: Record<string, unknown>;
	ends: Record<string, unknown>[];
	shots: Record<string, unknown>[];
}

async function client() {
	const instance = await supabase();
	if (!instance) throw new SocialError('noServer');
	if (!get(account)) throw new SocialError('signedOut');
	return instance;
}

/* Handles */

/** The archer's own handle, or null while they have never claimed one. */
export async function myHandle(): Promise<string | null> {
	const user = get(account);
	if (!user) return null;

	const instance = await supabase();
	if (!instance) return null;

	const { data } = await instance.from('profile').select('handle').eq('user_id', user.id).limit(1);
	return (data?.[0]?.handle as string | undefined) ?? null;
}

/**
 * Claiming is a server function, not an insert: the reserved list, the retired list and the shape
 * are database rules, because a check the client performs is a check an archer can skip.
 */
export async function claimHandle(handle: string, displayName?: string): Promise<void> {
	const { error } = await (await client()).rpc('claim_handle', {
		wanted: handle.trim().toLowerCase(),
		display: displayName?.trim() || null
	});
	if (error) throw new SocialError(error.message);
}

export async function setProfilePublic(isPublic: boolean): Promise<void> {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');

	const { error } = await (await client())
		.from('profile')
		.update({ is_public: isPublic, updated_at: Date.now() })
		.eq('user_id', user.id);
	if (error) throw new SocialError(error.message);
}

export async function isProfilePublic(): Promise<boolean> {
	const user = get(account);
	if (!user) return false;

	const instance = await supabase();
	if (!instance) return false;

	const { data } = await instance.from('profile').select('is_public').eq('user_id', user.id).limit(1);
	return Boolean(data?.[0]?.is_public);
}

/* Looking somebody up */

/**
 * Exact handle only, through the rate limited function rather than a select over the table, or the
 * handle list becomes a directory anybody can walk.
 */
export async function lookup(handle: string): Promise<Profile | null> {
	const { data, error } = await (await client()).rpc('lookup_profile', {
		wanted: handle.trim().replace(/^@/, '').toLowerCase()
	});
	if (error) throw new SocialError(error.message);

	const row = (data as Record<string, unknown>[] | null)?.[0];
	if (!row) return null;

	const profile: Profile = {
		userId: String(row.user_id),
		handle: String(row.handle),
		displayName: (row.display_name as string) ?? null,
		isPublic: Boolean(row.is_public),
		followStatus: String(row.follow_status ?? 'none'),
		followsUs: 'none'
	};
	await cacheProfile(profile);
	return profile;
}

/* The graph */

export async function follow(userId: string): Promise<string> {
	const { data, error } = await (await client()).rpc('request_follow', { target: userId });
	if (error) throw new SocialError(error.message);

	const status = String(data ?? 'pending');
	await db().update(schema.socialProfile).set({ followStatus: status }).where(eq(schema.socialProfile.userId, userId));
	return status;
}

export async function unfollow(userId: string): Promise<void> {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');

	const { error } = await (await client())
		.from('follow')
		.delete()
		.eq('follower_id', user.id)
		.eq('followee_id', userId);
	if (error) throw new SocialError(error.message);

	await db().update(schema.socialProfile).set({ followStatus: 'none' }).where(eq(schema.socialProfile.userId, userId));
	await db().delete(schema.socialActivity).where(eq(schema.socialActivity.ownerId, userId));
}

/** Approving somebody who asked to follow a private profile. */
export async function approve(followerId: string): Promise<void> {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');

	const { error } = await (await client())
		.from('follow')
		.update({ status: 'approved' })
		.eq('follower_id', followerId)
		.eq('followee_id', user.id);
	if (error) throw new SocialError(error.message);

	await db().update(schema.socialProfile).set({ followsUs: 'approved' }).where(eq(schema.socialProfile.userId, followerId));
}

/** Removing a follower, which is the same row as refusing one and deliberately the same button. */
export async function removeFollower(followerId: string): Promise<void> {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');

	const { error } = await (await client())
		.from('follow')
		.delete()
		.eq('follower_id', followerId)
		.eq('followee_id', user.id);
	if (error) throw new SocialError(error.message);

	await db().update(schema.socialProfile).set({ followsUs: 'none' }).where(eq(schema.socialProfile.userId, followerId));
}

/**
 * Blocking drops any follow in either direction, server side. From then on the blocked account sees
 * a private profile and nothing else: it is never told, and its requests never reach the list.
 */
export async function block(userId: string): Promise<void> {
	const { error } = await (await client()).rpc('block_account', { target: userId });
	if (error) throw new SocialError(error.message);

	await db().delete(schema.socialActivity).where(eq(schema.socialActivity.ownerId, userId));
	await db()
		.update(schema.socialProfile)
		.set({ followStatus: 'none', followsUs: 'none' })
		.where(eq(schema.socialProfile.userId, userId));
}

export async function unblock(userId: string): Promise<void> {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');

	const { error } = await (await client())
		.from('block')
		.delete()
		.eq('blocker_id', user.id)
		.eq('blocked_id', userId);
	if (error) throw new SocialError(error.message);
}

export async function blockedAccounts(): Promise<string[]> {
	const user = get(account);
	if (!user) return [];

	const instance = await supabase();
	if (!instance) return [];

	const { data } = await instance.from('block').select('blocked_id').eq('blocker_id', user.id);
	return (data ?? []).map((row) => String(row.blocked_id));
}

/* Sharing */

/**
 * Shared or not shared. Visibility is then decided by the profile rules and the block list, so this
 * is one flag rather than a row per viewer, and unsharing revokes because nothing was ever copied.
 */
export { setActivityShared as setShared } from '$lib/db/repository';

/* Refreshing the cache */

async function cacheProfile(profile: Profile): Promise<void> {
	const row = {
		userId: profile.userId,
		handle: profile.handle,
		displayName: profile.displayName,
		isPublic: profile.isPublic ? 1 : 0,
		followStatus: profile.followStatus,
		followsUs: profile.followsUs,
		cachedAt: Date.now()
	};
	const existing = await db()
		.select({ userId: schema.socialProfile.userId })
		.from(schema.socialProfile)
		.where(eq(schema.socialProfile.userId, profile.userId));

	if (existing.length > 0) {
		await db().update(schema.socialProfile).set(row).where(eq(schema.socialProfile.userId, profile.userId));
	} else {
		await db().insert(schema.socialProfile).values(row);
	}
}

/**
 * The graph and everything shared with this archer, refreshed into the local cache. Run alongside a
 * sync rather than on opening the screen, so the friends list is already there when it is opened.
 */
export async function refreshSocial(): Promise<void> {
	const user = get(account);
	const instance = await supabase();
	if (!user || !instance) return;

	const { data: follows } = await instance
		.from('follow')
		.select('follower_id, followee_id, status')
		.or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`);

	const ids = new Set<string>();
	const following = new Map<string, string>();
	const followers = new Map<string, string>();
	for (const row of follows ?? []) {
		const follower = String(row.follower_id);
		const followee = String(row.followee_id);
		if (follower === user.id) {
			following.set(followee, String(row.status));
			ids.add(followee);
		} else {
			followers.set(follower, String(row.status));
			ids.add(follower);
		}
	}

	if (ids.size > 0) {
		const { data: profiles } = await instance
			.from('profile')
			.select('user_id, handle, display_name, is_public')
			.in('user_id', [...ids]);

		for (const row of profiles ?? []) {
			const id = String(row.user_id);
			await cacheProfile({
				userId: id,
				handle: String(row.handle),
				displayName: (row.display_name as string) ?? null,
				isPublic: Boolean(row.is_public),
				followStatus: following.get(id) ?? 'none',
				followsUs: followers.get(id) ?? 'none'
			});
		}
	}

	await refreshSharedActivities([...following.keys()]);
}

/**
 * Whatever those accounts still share, replacing what was cached for them. Replaced rather than
 * merged, because an activity that has been unshared has to disappear from this device too: leaving
 * a stale copy behind would make unsharing a lie.
 */
async function refreshSharedActivities(ownerIds: string[]): Promise<void> {
	const instance = await supabase();
	if (!instance || ownerIds.length === 0) return;

	const { data: activities } = await instance
		.from('activity')
		.select('*')
		.in('user_id', ownerIds)
		.not('shared_at', 'is', null)
		.is('deleted_at', null);

	const rows = activities ?? [];
	const ids = rows.map((row) => String(row.id));

	const ends = ids.length
		? ((await instance.from('round_end').select('*').in('activity_id', ids).is('deleted_at', null)).data ?? [])
		: [];
	const endIds = ends.map((row) => String(row.id));
	const shots = endIds.length
		? ((await instance.from('shot').select('*').in('end_id', endIds).is('deleted_at', null)).data ?? [])
		: [];

	for (const ownerId of ownerIds) {
		await db().delete(schema.socialActivity).where(eq(schema.socialActivity.ownerId, ownerId));
	}

	const cachedAt = Date.now();
	for (const activity of rows) {
		const id = String(activity.id);
		const mine = ends.filter((end) => String(end.activity_id) === id);
		const mineIds = new Set(mine.map((end) => String(end.id)));
		await db()
			.insert(schema.socialActivity)
			.values({
				id,
				ownerId: String(activity.user_id),
				sharedAt: Number(activity.shared_at ?? cachedAt),
				payload: JSON.stringify({
					activity,
					ends: mine,
					shots: shots.filter((shot) => mineIds.has(String(shot.end_id)))
				}),
				cachedAt
			});
	}
}

/* Reading the cache, which is what every screen actually renders */

export async function cachedProfile(handle: string): Promise<Profile | null> {
	const [row] = await db()
		.select()
		.from(schema.socialProfile)
		.where(eq(schema.socialProfile.handle, handle.replace(/^@/, '').toLowerCase()));
	return row ? toProfile(row) : null;
}

export async function following(): Promise<Profile[]> {
	const rows = await db()
		.select()
		.from(schema.socialProfile)
		.where(ne(schema.socialProfile.followStatus, 'none'));
	return rows.map(toProfile);
}

export async function followers(): Promise<Profile[]> {
	const rows = await db()
		.select()
		.from(schema.socialProfile)
		.where(ne(schema.socialProfile.followsUs, 'none'));
	return rows.map(toProfile);
}

/** People waiting on an answer, which only a private profile ever has. */
export async function pendingRequests(): Promise<Profile[]> {
	const rows = await db()
		.select()
		.from(schema.socialProfile)
		.where(eq(schema.socialProfile.followsUs, 'pending'));
	return rows.map(toProfile);
}

export async function sharedBy(ownerId: string): Promise<SharedActivity[]> {
	const rows = await db()
		.select()
		.from(schema.socialActivity)
		.where(eq(schema.socialActivity.ownerId, ownerId))
		.orderBy(desc(schema.socialActivity.sharedAt));

	return rows.map((row) => ({
		id: row.id,
		ownerId: row.ownerId,
		sharedAt: row.sharedAt,
		...(JSON.parse(row.payload) as Omit<SharedActivity, 'id' | 'ownerId' | 'sharedAt'>)
	}));
}

/** Everything anybody has shared with this archer, newest first: the feed the friends page opens on. */
export async function sharedFeed(limit = 50): Promise<SharedActivity[]> {
	const rows = await db()
		.select()
		.from(schema.socialActivity)
		.orderBy(desc(schema.socialActivity.sharedAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		ownerId: row.ownerId,
		sharedAt: row.sharedAt,
		...(JSON.parse(row.payload) as Omit<SharedActivity, 'id' | 'ownerId' | 'sharedAt'>)
	}));
}

/** The archer's own activities that are currently shared, so the sharing can be seen and undone. */
export async function mySharedActivities() {
	return db()
		.select({
			id: schema.activity.id,
			sharedAt: schema.activity.sharedAt,
			startedAt: schema.activity.startedAt,
			totalScore: schema.activity.totalScore,
			roundDefinition: schema.activity.roundDefinition
		})
		.from(schema.activity)
		.where(and(isNotNull(schema.activity.sharedAt), isNull(schema.activity.deletedAt)))
		.orderBy(desc(schema.activity.sharedAt));
}

type ProfileRow = typeof schema.socialProfile.$inferSelect;

function toProfile(row: ProfileRow): Profile {
	return {
		userId: row.userId,
		handle: row.handle,
		displayName: row.displayName,
		isPublic: row.isPublic === 1,
		followStatus: row.followStatus,
		followsUs: row.followsUs
	};
}
