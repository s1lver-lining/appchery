import { writable } from 'svelte/store';
import { db, schema, transaction } from '$lib/db';
import { isNull, sql } from 'drizzle-orm';
import { supabase } from './client';
import { OWNED_TABLES } from './tables';

/**
 * Signing in is optional, and everything here is additive: an archer who never opens this screen has
 * the same app they had before it existed. Signing out keeps the local database exactly as it is,
 * because the device is the source of truth and the account is a copy of it.
 */

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

	// A project with email confirmation on returns a user and no session. Saying so is the difference
	// between an archer checking their inbox and an archer thinking the app is broken.
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
	account.set(null);
}

export async function requestPasswordReset(email: string): Promise<void> {
	const { error } = await (await client()).auth.resetPasswordForEmail(email);
	if (error) throw new AuthError(error.message);
}

/**
 * Everything shot before signing in belongs to nobody, and signing in is what an archer does to say
 * it is theirs. Each adopted row is marked pending so the first push carries a whole history up.
 *
 * `updated_at` is deliberately left alone. Adoption changes who owns a row, not what it says, and
 * touching the timestamp would let a device that has never been online outrank a genuinely newer
 * version of the same row on another device.
 *
 * Rows already carrying a different account are left exactly where they are. A device that has been
 * two archers is not a case sync tries to merge, and the alternative is one account quietly
 * swallowing another's shooting.
 */
export async function adoptLocalRows(userId: string): Promise<number> {
	let adopted = 0;

	await transaction(async () => {
		for (const { name, table } of OWNED_TABLES) {
			const orphans = await db()
				.select({ id: table.id })
				.from(table)
				.where(isNull(table.userId));
			if (orphans.length === 0) continue;

			await db().update(table).set({ userId }).where(isNull(table.userId));

			const changedAt = Date.now();
			await db()
				.insert(schema.changeLog)
				.values(orphans.map(({ id }) => ({ tableName: name, rowId: id, op: 'update', changedAt, syncedAt: null })));
			adopted += orphans.length;
		}
	});

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
