import { desc, eq } from 'drizzle-orm';
import { db, schema } from '$lib/db';

/** What the archer follows on ianseo, and what the app has already read back from it. */

export type FavouriteKind = 'competition' | 'country' | 'archer' | 'club';

export type Favourite = {
	id: string;
	kind: FavouriteKind;
	/** The competition an archer or a club is followed inside. Null for a competition or a country. */
	toId: string | null;
	label: string;
	detail: string | null;
	addedAt: number;
	/** The newest thing ianseo has published for it, as the app last read the competition. */
	publishedAt: number | null;
	seenAt: number | null;
};

/** Something has been published since the archer last looked, which is the whole of what a badge says. */
export function isNew(favourite: Favourite): boolean {
	return favourite.publishedAt !== null && favourite.publishedAt > (favourite.seenAt ?? 0);
}

/**
 * One row per thing followed, addressed by what it is rather than by a fresh identifier: following
 * the same competition twice is not a thing that can happen, and a favourite has to be recognisable
 * from a list row without a lookup.
 */
export function favouriteId(kind: FavouriteKind, key: string, toId?: string | null): string {
	return [kind, toId ?? '', key].join(':');
}

export async function favourites(): Promise<Favourite[]> {
	const rows = await db()
		.select()
		.from(schema.ianseoFavourite)
		.orderBy(desc(schema.ianseoFavourite.addedAt));
	return rows.map((row) => ({
		id: row.id,
		kind: row.kind as FavouriteKind,
		toId: row.toId,
		label: row.label,
		detail: row.detail,
		addedAt: row.addedAt,
		publishedAt: row.publishedAt,
		seenAt: row.seenAt
	}));
}

export async function addFavourite(
	favourite: Omit<Favourite, 'addedAt' | 'publishedAt' | 'seenAt'> & { seenAt?: number | null }
): Promise<void> {
	await db()
		.insert(schema.ianseoFavourite)
		.values({
			id: favourite.id,
			kind: favourite.kind,
			toId: favourite.toId,
			label: favourite.label,
			detail: favourite.detail,
			addedAt: Date.now(),
			publishedAt: null,
			seenAt: favourite.seenAt ?? null
		})
		.onConflictDoUpdate({
			target: schema.ianseoFavourite.id,
			set: { label: favourite.label, detail: favourite.detail }
		});
}

export async function removeFavourite(id: string): Promise<void> {
	await db().delete(schema.ianseoFavourite).where(eq(schema.ianseoFavourite.id, id));
}

/** Everything a competition carries, so unfollowing it takes the archers followed inside it with it. */
export async function removeCompetition(toId: string): Promise<void> {
	await db().delete(schema.ianseoFavourite).where(eq(schema.ianseoFavourite.toId, toId));
	await removeFavourite(favouriteId('competition', toId));
}

/**
 * What ianseo has published for a followed competition, noted as the app reads it. A competition
 * nobody follows is not recorded: this exists to light a badge, and nothing lights it for the rest.
 */
export async function notePublished(toId: string, at: number | null): Promise<void> {
	if (at === null) return;
	await db()
		.update(schema.ianseoFavourite)
		.set({ publishedAt: at })
		.where(eq(schema.ianseoFavourite.id, favouriteId('competition', toId)));
}

/** The archer has read this much of the competition, so anything published after it is new to them. */
export async function markSeen(id: string, at: number): Promise<void> {
	await db()
		.update(schema.ianseoFavourite)
		.set({ seenAt: at })
		.where(eq(schema.ianseoFavourite.id, id));
}

export type Cached<T> = { value: T; cachedAt: number };

export async function readCache<T>(path: string): Promise<Cached<T> | null> {
	const [row] = await db()
		.select()
		.from(schema.ianseoCache)
		.where(eq(schema.ianseoCache.path, path))
		.limit(1);
	if (!row) return null;
	try {
		return { value: JSON.parse(row.payload) as T, cachedAt: row.cachedAt };
	} catch {
		// A payload written by an older shape of the parsers: reading ianseo again is cheaper than guessing.
		return null;
	}
}

export async function writeCache(path: string, value: unknown): Promise<void> {
	await db()
		.insert(schema.ianseoCache)
		.values({ path, payload: JSON.stringify(value), cachedAt: Date.now() })
		.onConflictDoUpdate({
			target: schema.ianseoCache.path,
			set: { payload: JSON.stringify(value), cachedAt: Date.now() }
		});
}

/** Everything read back from ianseo, dropped: the favourites are what the archer chose and stay. */
export async function clearCache(): Promise<void> {
	await db().delete(schema.ianseoCache);
}
