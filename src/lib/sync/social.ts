import { eq, desc, ne, type SQL } from 'drizzle-orm';
import { get } from 'svelte/store';
import { db, schema } from '$lib/db';
import { supabase } from './client';
import { account } from './auth';

// Everything the client asks the server about other archers, see doc/sync.md § 6. Changing anything
// needs a connection; reading is answered from the cache, so the friends screen opens with no signal.
//
// Nothing here writes to the archer's own tables: somebody else's arrows must never reach these
// averages, records or badges, so what they shared is cached whole and apart.

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

/** The signed in archer's id, refused the same way every other call here refuses. */
function me(): string {
	const user = get(account);
	if (!user) throw new SocialError('signedOut');
	return user.id;
}

function fail(error: { message: string } | null) {
	if (error) throw new SocialError(error.message);
}

function patchProfile(userId: string, patch: Partial<typeof schema.socialProfile.$inferInsert>) {
	return db().update(schema.socialProfile).set(patch).where(eq(schema.socialProfile.userId, userId));
}

function forgetShared(ownerId: string) {
	return db().delete(schema.socialActivity).where(eq(schema.socialActivity.ownerId, ownerId));
}

/* Handles */

const HANDLE_KEY = 'appchery.handle';

/**
 * The archer's own handle, remembered locally once known: the friends page shows the claim form when
 * this is null, and asking somebody offline to choose the handle they already hold is worse than stale.
 */
export async function myHandle(): Promise<string | null> {
	const user = get(account);
	if (!user) return null;

	const remembered = localStorage.getItem(`${HANDLE_KEY}.${user.id}`);

	const instance = await supabase();
	if (!instance) return remembered;

	const { data, error } = await instance.from('profile').select('handle').eq('user_id', user.id).limit(1);
	if (error) return remembered;

	const handle = (data?.[0]?.handle as string | undefined) ?? null;
	if (handle) localStorage.setItem(`${HANDLE_KEY}.${user.id}`, handle);
	else localStorage.removeItem(`${HANDLE_KEY}.${user.id}`);
	return handle;
}

/** A function, not an insert: the reserved and retired lists are database rules, not client ones. */
export async function claimHandle(handle: string, displayName?: string): Promise<void> {
	const wanted = handle.trim().toLowerCase();
	const { error } = await (await client()).rpc('claim_handle', {
		wanted,
		display: displayName?.trim() || null
	});
	if (error) throw new SocialError(error.message);

	const user = get(account);
	if (user) localStorage.setItem(`${HANDLE_KEY}.${user.id}`, wanted);
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

/** Exact handles only, and rate limited, or the handle list becomes a directory anybody can walk. */
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
	await cacheProfile(profile, false);
	return profile;
}

/* The graph. Every call needs a connection, and every one keeps the cache in step with it. */

export async function follow(userId: string): Promise<string> {
	const { data, error } = await (await client()).rpc('request_follow', { target: userId });
	fail(error);

	const status = String(data ?? 'pending');
	await patchProfile(userId, { followStatus: status });
	return status;
}

export async function unfollow(userId: string): Promise<void> {
	const { error } = await (await client()).from('follow').delete().eq('follower_id', me()).eq('followee_id', userId);
	fail(error);

	await patchProfile(userId, { followStatus: 'none' });
	await forgetShared(userId);
}

/** Approving somebody who asked to follow a private profile. */
export async function approve(followerId: string): Promise<void> {
	const { error } = await (await client())
		.from('follow')
		.update({ status: 'approved' })
		.eq('follower_id', followerId)
		.eq('followee_id', me());
	fail(error);

	await patchProfile(followerId, { followsUs: 'approved' });
}

/** Removing a follower, which is the same row as refusing one and deliberately the same button. */
export async function removeFollower(followerId: string): Promise<void> {
	const { error } = await (await client())
		.from('follow')
		.delete()
		.eq('follower_id', followerId)
		.eq('followee_id', me());
	fail(error);

	await patchProfile(followerId, { followsUs: 'none' });
}

/** Drops any follow in either direction, server side. The blocked account is never told. */
export async function block(userId: string): Promise<void> {
	const { error } = await (await client()).rpc('block_account', { target: userId });
	fail(error);

	await forgetShared(userId);
	await patchProfile(userId, { followStatus: 'none', followsUs: 'none' });
}

export async function unblock(userId: string): Promise<void> {
	const { error } = await (await client()).from('block').delete().eq('blocker_id', me()).eq('blocked_id', userId);
	fail(error);
}

/** Who this archer has blocked, so the profile page can offer to undo it. */
export async function blockedAccounts(): Promise<string[]> {
	const user = get(account);
	const instance = await supabase();
	if (!user || !instance) return [];

	const { data } = await instance.from('block').select('blocked_id').eq('blocker_id', user.id);
	return (data ?? []).map((row) => String(row.blocked_id));
}

/* Sharing */

/** One flag, not a row per viewer: visibility follows from the profile, and unsharing revokes. */
export { setActivityShared as setShared } from '$lib/db/repository';

/* Refreshing the cache */

/** `followsUs` is written only by callers that know it: a lookup does not, and would drop a follower. */
async function cacheProfile(profile: Profile, knowsFollowsUs = true): Promise<void> {
	const row = {
		userId: profile.userId,
		handle: profile.handle,
		displayName: profile.displayName,
		isPublic: profile.isPublic ? 1 : 0,
		followStatus: profile.followStatus,
		cachedAt: Date.now()
	};
	const existing = await db()
		.select({ userId: schema.socialProfile.userId })
		.from(schema.socialProfile)
		.where(eq(schema.socialProfile.userId, profile.userId));

	if (existing.length > 0) {
		await db()
			.update(schema.socialProfile)
			.set(knowsFollowsUs ? { ...row, followsUs: profile.followsUs } : row)
			.where(eq(schema.socialProfile.userId, profile.userId));
	} else {
		await db().insert(schema.socialProfile).values({ ...row, followsUs: profile.followsUs });
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

	const { data: follows, error: followError } = await instance
		.from('follow')
		.select('follower_id, followee_id, status')
		.or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`);

	// A refresh that could not read knows nothing, and must not clear the cache as though it had.
	if (followError) return;

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

	// Anybody no longer in the graph is reset, or somebody who unfollowed sits in the list for ever.
	const stale = await db()
		.select({ userId: schema.socialProfile.userId })
		.from(schema.socialProfile);
	for (const { userId } of stale) {
		if (ids.has(userId)) continue;
		await db()
			.update(schema.socialProfile)
			.set({ followStatus: 'none', followsUs: 'none' })
			.where(eq(schema.socialProfile.userId, userId));
		await db().delete(schema.socialActivity).where(eq(schema.socialActivity.ownerId, userId));
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

/** One profile's shared rounds: browsing a public profile shows them without following it first. */
export async function refreshSharedFor(userId: string): Promise<void> {
	await refreshSharedActivities([userId]);
}

/** Replaced rather than merged: an activity that has been unshared has to disappear here too. */
async function refreshSharedActivities(ownerIds: string[]): Promise<void> {
	const instance = await supabase();
	if (!instance || ownerIds.length === 0) return;

	const { data: activities, error } = await instance
		.from('activity')
		.select('*')
		.in('user_id', ownerIds)
		.not('shared_at', 'is', null)
		.is('deleted_at', null);

	// Same again: a failed read would delete a friend's rounds and put nothing back.
	if (error) return;

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
	const wanted = handle.replace(/^@/, '').toLowerCase();
	const [row] = await db().select().from(schema.socialProfile).where(eq(schema.socialProfile.handle, wanted));
	return row ? toProfile(row) : null;
}

export function following(): Promise<Profile[]> {
	return profilesWhere(ne(schema.socialProfile.followStatus, 'none'));
}

export function followers(): Promise<Profile[]> {
	return profilesWhere(ne(schema.socialProfile.followsUs, 'none'));
}

/** People waiting on an answer, which only a private profile ever has. */
export function pendingRequests(): Promise<Profile[]> {
	return profilesWhere(eq(schema.socialProfile.followsUs, 'pending'));
}

export function sharedBy(ownerId: string): Promise<SharedActivity[]> {
	return sharedWhere(eq(schema.socialActivity.ownerId, ownerId));
}

/** Everything anybody has shared with this archer, newest first: the feed the friends page opens on. */
export function sharedFeed(limit = 50): Promise<SharedActivity[]> {
	return sharedWhere(undefined, limit);
}

async function profilesWhere(condition: SQL | undefined): Promise<Profile[]> {
	const rows = await db().select().from(schema.socialProfile).where(condition);
	return rows.map(toProfile);
}

async function sharedWhere(condition: SQL | undefined, limit = 500): Promise<SharedActivity[]> {
	const rows = await db()
		.select()
		.from(schema.socialActivity)
		.where(condition)
		.orderBy(desc(schema.socialActivity.sharedAt))
		.limit(limit);

	return rows.map((row) => ({
		id: row.id,
		ownerId: row.ownerId,
		sharedAt: row.sharedAt,
		...(JSON.parse(row.payload) as Pick<SharedActivity, 'activity' | 'ends' | 'shots'>)
	}));
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
