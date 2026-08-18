// Which of two versions of a row wins, on the client's `updated_at`: the archer who typed last is
// the one who meant it. Pure, so the rule that decides whose scores survive needs no device to test.

export interface Mergeable {
	id: string;
	createdAt: number;
	updatedAt: number;
	deviceId: string;
	deletedAt: number | null;
}

export type Winner = 'local' | 'remote';

/** Append only, per doc/architecture.md § 6: the copy created first wins whole, never blended. */
const APPEND_ONLY = new Set(['session']);

export function resolve(table: string, local: Mergeable, remote: Mergeable): Winner {
	if (APPEND_ONLY.has(table)) {
		if (local.createdAt !== remote.createdAt) return local.createdAt < remote.createdAt ? 'local' : 'remote';
		// Identical creation instants mean the same session written twice, so fall through and let the
		// ordinary rule pick one. Which one hardly matters; that both devices pick the same one does.
	}

	if (local.updatedAt !== remote.updatedAt) return local.updatedAt > remote.updatedAt ? 'local' : 'remote';

	// Broken on device id, so both sides reach the same answer. Picking "mine" would leave each
	// device certain it had won, and the two disagreeing for ever.
	if (local.deviceId !== remote.deviceId) return local.deviceId > remote.deviceId ? 'local' : 'remote';
	return 'local';
}

/**
 * A tombstone never loses to an edit of equal age: a session that comes back weeks later is worse
 * than a lost correction to something being thrown away.
 */
export function resolveWithDeletes(table: string, local: Mergeable, remote: Mergeable): Winner {
	const deletedLocally = local.deletedAt !== null;
	const deletedRemotely = remote.deletedAt !== null;
	if (deletedLocally !== deletedRemotely && local.updatedAt === remote.updatedAt) {
		return deletedLocally ? 'local' : 'remote';
	}
	return resolve(table, local, remote);
}
