/**
 * Why the database is in memory, answered on screen rather than in a console nobody has open on a
 * phone. OPFS needs four things, and losing any one of them looks identical from the outside.
 */

export type StorageProblem = 'insecure' | 'notIsolated' | 'noOpfs' | 'blocked' | 'unknown';

/**
 * Asked in the order the browser applies them.
 *
 * `blocked` is the one that reads as a contradiction: the page is isolated, the API exists, and the
 * browser still refuses a directory. That is a site data rule rather than a missing feature, and it
 * is what an origin set to clear or block storage on exit does, so it names itself rather than
 * leaving somebody checking headers that were never the problem.
 */
export async function diagnoseStorage(): Promise<StorageProblem> {
	if (typeof window === 'undefined') return 'unknown';
	if (!window.isSecureContext) return 'insecure';
	if (!window.crossOriginIsolated) return 'notIsolated';
	if (!navigator.storage?.getDirectory) return 'noOpfs';

	try {
		await navigator.storage.getDirectory();
	} catch {
		return 'blocked';
	}
	return 'unknown';
}
