/**
 * Which of two versions of a row wins. Pure, so the rule that decides whose scores survive is
 * testable without a network, a database or a device.
 *
 * Last writer wins per row, on the client's `updated_at`. The server's own clock never enters into
 * it: the archer who typed last is the one who meant it, and the server only ever saw the copy.
 */

export interface Mergeable {
	id: string;
	createdAt: number;
	updatedAt: number;
	deviceId: string;
	deletedAt: number | null;
}

export type Winner = 'local' | 'remote';

/**
 * Sessions are append only and never merged, per doc/architecture.md section 6. Two devices editing
 * one outing is pathological, so the copy that was created first is the real one and the other side
 * is dropped whole rather than blended field by field into something neither device ever had.
 */
const APPEND_ONLY = new Set(['session']);

export function resolve(table: string, local: Mergeable, remote: Mergeable): Winner {
	if (APPEND_ONLY.has(table)) {
		if (local.createdAt !== remote.createdAt) return local.createdAt < remote.createdAt ? 'local' : 'remote';
		// Identical creation instants mean the same session written twice, so fall through and let the
		// ordinary rule pick one. Which one hardly matters; that both devices pick the same one does.
	}

	if (local.updatedAt !== remote.updatedAt) return local.updatedAt > remote.updatedAt ? 'local' : 'remote';

	// A tie is two devices writing in the same millisecond, or more often one clock rounded to the
	// other. Broken on device id so both sides reach the same answer: a rule that picked "mine" would
	// leave each device certain it had won, and the two would disagree forever.
	if (local.deviceId !== remote.deviceId) return local.deviceId > remote.deviceId ? 'local' : 'remote';
	return 'local';
}

/**
 * A tombstone never loses to an edit of equal age. Deleting is the one action an archer cannot
 * discover was undone: an unnoticed resurrection puts a session back in the list weeks later, while
 * a delete that beats a simultaneous edit is at worst a lost correction to something being thrown away.
 */
export function resolveWithDeletes(table: string, local: Mergeable, remote: Mergeable): Winner {
	const deletedLocally = local.deletedAt !== null;
	const deletedRemotely = remote.deletedAt !== null;
	if (deletedLocally !== deletedRemotely && local.updatedAt === remote.updatedAt) {
		return deletedLocally ? 'local' : 'remote';
	}
	return resolve(table, local, remote);
}
