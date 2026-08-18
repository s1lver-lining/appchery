import { writable } from 'svelte/store';
import { db, schema } from '$lib/db';
import { isNull, sql } from 'drizzle-orm';
import { supabase } from './client';
import { writeSyncState } from './config';
import { OWNED_TABLES } from '$lib/db/synced';

// Signing in is optional and additive. The device is the source of truth; the account is a copy.

export interface Account {
	id: string;
	email: string | null;
}

export const account = writable<Account | null>(null);

let watching = false;

/** Restores a session written by a previous run, and keeps the store honest after a token refresh. */
export async function initAuth(): Promise<void> {
	const client = await supabase();
	if (!client) return;

	// Read locally, so this answers with no network and leaves the archer signed in with what is on disk.
	const { data } = await client.auth.getSession();
	account.set(toAccount(data.session?.user));

	if (watching) return;
	watching = true;
	client.auth.onAuthStateChange((_event, session) => account.set(toAccount(session?.user)));
}

function toAccount(user: { id: string; email?: string } | undefined | null): Account | null {
	return user ? { id: user.id, email: user.email ?? null } : null;
}

export class AuthError extends Error {}

async function client() {
	const instance = await supabase();
	if (!instance) throw new AuthError('noServer');
	return instance;
}

export async function signUp(email: string, password: string): Promise<'signedIn' | 'confirm'> {
	const { data, error } = await (await client()).auth.signUp({ email, password });
	if (error) throw new AuthError(error.message);

	// Confirmation on means a user and no session, and an archer owed a look at their inbox.
	if (!data.session) return 'confirm';
	await adoptLocalRows(data.user!.id);
	return 'signedIn';
}

export async function signIn(email: string, password: string): Promise<void> {
	const { data, error } = await (await client()).auth.signInWithPassword({ email, password });
	if (error) throw new AuthError(error.message);
	await adoptLocalRows(data.user.id);
}

export async function signOut(): Promise<void> {
	const instance = await supabase();
	if (instance) await instance.auth.signOut();

	// The shooting stays: it is this device's own. What other people shared goes, because a shared
	// phone must not show one archer the friends and scores of the one before them.
	await db().delete(schema.socialActivity);
	await db().delete(schema.socialProfile);

	// The cursors belong to the account that just left. Whoever signs in next would otherwise ask
	// the server only for rows newer than somebody else's last exchange and never see the rest of
	// their own history. Starting over costs one full pull, and a pull applies the same rows twice
	// for nothing.
	await writeSyncState({ lastPullCursor: null, lastPushCursor: null, lastSyncAt: null });

	account.set(null);
}

export async function requestPasswordReset(email: string): Promise<void> {
	const { error } = await (await client()).auth.resetPasswordForEmail(email);
	if (error) throw new AuthError(error.message);
}

/**
 * Everything shot before signing in belongs to nobody, and signing in says it is theirs. Rows
 * carrying another account are left alone, and `updated_at` is never touched: adoption changes who
 * owns a row, not what it says. See doc/sync.md § 4.
 */
export async function adoptLocalRows(userId: string): Promise<number> {
	let adopted = 0;

	// No transaction, like pull: a rollback would discard whatever the archer was writing.
	for (const { name, table } of OWNED_TABLES) {
		const orphans = await db().select({ id: table.id }).from(table).where(isNull(table.userId));
		if (orphans.length === 0) continue;

		await db().update(table).set({ userId }).where(isNull(table.userId));

		// Chunked: signing in after importing years of shooting adopts tens of thousands of rows,
		// well past what one statement can carry.
		const changedAt = Date.now();
		for (let i = 0; i < orphans.length; i += 100) {
			const chunk = orphans.slice(i, i + 100);
			await db()
				.insert(schema.changeLog)
				.values(chunk.map(({ id }) => ({ tableName: name, rowId: id, op: 'update', changedAt, syncedAt: null })));
		}
		adopted += orphans.length;
	}

	return adopted;
}

/** How many local rows have never been claimed by an account, for the settings screen to explain. */
export async function unclaimedRowCount(): Promise<number> {
	let total = 0;
	for (const { table } of OWNED_TABLES) {
		const [row] = await db()
			.select({ n: sql<number>`count(*)` })
			.from(table)
			.where(isNull(table.userId));
		total += Number(row?.n ?? 0);
	}
	return total;
}
