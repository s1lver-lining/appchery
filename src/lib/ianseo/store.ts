import { desc, eq, notInArray, sql } from 'drizzle-orm';
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
	favourite: Omit<Favourite, 'addedAt' | 'publishedAt' | 'seenAt'> & {
		/**
		 * What ianseo had published when this was followed, and therefore what the archer has already
		 * seen. Given together or not at all: following something must never make it new at once.
		 */
		publishedAt?: number | null;
	}
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
			publishedAt: favourite.publishedAt ?? null,
			seenAt: favourite.publishedAt ?? null
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
 * When ianseo last rebuilt a followed competition, taken from the tournament list as it is read.
 *
 * The list is the one clock this is measured on. The documents carry stamps of their own, and they
 * are close but not the same, so a badge that noted one and cleared the other would light on nothing
 * having happened and never go out.
 */
export async function notePublished(toId: string, at: number | null): Promise<void> {
	if (at === null) return;
	await db()
		.update(schema.ianseoFavourite)
		.set({
			publishedAt: at,
			// The first time the list says what a competition is at, that is the baseline rather than
			// news: nothing can have happened since a moment the app had not read yet.
			seenAt: sql`coalesce(${schema.ianseoFavourite.seenAt}, ${at})`
		})
		.where(eq(schema.ianseoFavourite.id, favouriteId('competition', toId)));
}

/** Everything followed there has been looked at, up to whatever the list last said was published. */
export async function markCompetitionSeen(toId: string): Promise<void> {
	const id = favouriteId('competition', toId);
	const [row] = await db()
		.select()
		.from(schema.ianseoFavourite)
		.where(eq(schema.ianseoFavourite.id, id))
		.limit(1);
	if (row) await markSeen(id, row.publishedAt ?? Date.now());
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

/**
 * How many ianseo pages the device keeps. A competition has a document per class per round, so a
 * season of browsing runs into thousands of them, and none of it is the archer's own record: what
 * has not been looked at in a while is cheaper to read again than to carry.
 */
const CACHE_LIMIT = 200;

export async function writeCache(path: string, value: unknown): Promise<void> {
	await db()
		.insert(schema.ianseoCache)
		.values({ path, payload: JSON.stringify(value), cachedAt: Date.now() })
		.onConflictDoUpdate({
			target: schema.ianseoCache.path,
			set: { payload: JSON.stringify(value), cachedAt: Date.now() }
		});
	await prune();
}

/**
 * Pages that are read from every screen and are the whole of what the app has with no signal. Kept
 * whatever their age: browsing a couple of hundred documents would otherwise drop the list of
 * competitions itself, which is the one page an archer at a range cannot do without.
 */
const KEPT = ['/TourList.php', 'inscriptarc:entries'];

/** The oldest pages beyond the limit, dropped. Nothing here is a record: every row can be read again. */
async function prune(): Promise<void> {
	const rows = await db()
		.select({ path: schema.ianseoCache.path })
		.from(schema.ianseoCache)
		.orderBy(desc(schema.ianseoCache.cachedAt))
		.limit(CACHE_LIMIT);
	if (rows.length < CACHE_LIMIT) return;

	const keep = [...new Set([...rows.map((row) => row.path), ...KEPT])];
	await db().delete(schema.ianseoCache).where(notInArray(schema.ianseoCache.path, keep));
}

/** Everything read back from ianseo, dropped: the favourites are what the archer chose and stay. */
export async function clearCache(): Promise<void> {
	await db().delete(schema.ianseoCache);
}
