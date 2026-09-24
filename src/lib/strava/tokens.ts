import { writable, get } from 'svelte/store';
import { STRAVA_TOKEN, strava } from './config';

const KEY = 'appchery.strava';

/**
 * What Strava gave back for this runner. Device local and deliberately unsynced, like the default
 * bow and the watch: it is this phone's permission to write to their Strava, not part of the record.
 */
export interface StravaTokens {
	accessToken: string;
	refreshToken: string;
	/** Seconds since the epoch, which is how Strava says it. */
	expiresAt: number;
	athlete: string | null;
}

function read(): StravaTokens | null {
	if (typeof window === 'undefined') return null;
	try {
		return parseTokens(JSON.parse(window.localStorage.getItem(KEY) ?? 'null'));
	} catch {
		return null;
	}
}

/** Anything half written or from an older shape is no token at all, rather than a broken one. */
export function parseTokens(value: unknown): StravaTokens | null {
	if (!value || typeof value !== 'object') return null;
	const t = value as Partial<StravaTokens>;
	if (typeof t.accessToken !== 'string' || !t.accessToken) return null;
	if (typeof t.refreshToken !== 'string' || !t.refreshToken) return null;
	return {
		accessToken: t.accessToken,
		refreshToken: t.refreshToken,
		expiresAt: typeof t.expiresAt === 'number' ? t.expiresAt : 0,
		athlete: typeof t.athlete === 'string' ? t.athlete : null
	};
}

export const stravaTokens = writable<StravaTokens | null>(read());
stravaTokens.subscribe((value) => {
	if (typeof window === 'undefined') return;
	if (value) window.localStorage.setItem(KEY, JSON.stringify(value));
	else window.localStorage.removeItem(KEY);
});

const PENDING = 'appchery.strava.pending';
/** Long enough to sign in and no longer, so a marker left behind cannot decide a later trip. */
const PENDING_MS = 30 * 60_000;

/**
 * Which copy of the app sent the runner to Strava. The phone's browser carries the answer back, and
 * without this the web app and the installed app cannot tell whose sign in they are finishing.
 */
export function markSignInStarted() {
	if (typeof window !== 'undefined') window.localStorage.setItem(PENDING, String(Date.now()));
}

/** The rule on its own, so it can be read without a browser: the storage around it is three lines. */
export function startedHere(marker: string | null, now = Date.now()): boolean {
	const at = Number(marker);
	return Boolean(marker) && Number.isFinite(at) && at > 0 && now - at < PENDING_MS;
}

export function signInStartedHere(now = Date.now()): boolean {
	if (typeof window === 'undefined') return false;
	return startedHere(window.localStorage.getItem(PENDING), now);
}

export function clearSignInStarted() {
	if (typeof window !== 'undefined') window.localStorage.removeItem(PENDING);
}

export function stravaConnected(): boolean {
	return get(stravaTokens) !== null;
}

/** Signing out is forgetting the token: nothing of the runner's was ever held anywhere else. */
export function forgetStrava() {
	stravaTokens.set(null);
}

/** A minute's grace, so a token that expires while the upload is in flight is refreshed first. */
const GRACE_SECONDS = 60;

export function isStale(tokens: StravaTokens, now = Date.now()): boolean {
	return tokens.expiresAt - GRACE_SECONDS <= Math.floor(now / 1000);
}

export class StravaError extends Error {
	constructor(
		/** `disconnected` means the runner has to sign in again: no retry will fix it. */
		readonly kind: 'offline' | 'disconnected' | 'refused' | 'unreadable',
		message: string
	) {
		super(message);
		this.name = 'StravaError';
	}
}

/** Both halves of the OAuth dance land here: the shapes differ only in the grant. */
async function askForTokens(body: Record<string, string>): Promise<StravaTokens> {
	let response: Response;
	try {
		response = await fetch(STRAVA_TOKEN, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_id: strava.clientId,
				client_secret: strava.clientSecret,
				...body
			})
		});
	} catch (error) {
		throw new StravaError('offline', String(error));
	}

	// A refused grant is a used code or a revoked permission, and asking again with it never helps.
	if (response.status === 400 || response.status === 401) {
		throw new StravaError('disconnected', `Strava answered ${response.status}`);
	}
	if (!response.ok) throw new StravaError('refused', `Strava answered ${response.status}`);

	const said = (await response.json().catch(() => null)) as {
		access_token?: string;
		refresh_token?: string;
		expires_at?: number;
		athlete?: { firstname?: string; lastname?: string; username?: string };
	} | null;
	if (!said?.access_token || !said.refresh_token) {
		throw new StravaError('unreadable', 'Strava sent no token back');
	}

	const named = [said.athlete?.firstname, said.athlete?.lastname].filter(Boolean).join(' ').trim();
	return {
		accessToken: said.access_token,
		refreshToken: said.refresh_token,
		expiresAt: said.expires_at ?? 0,
		athlete: named || said.athlete?.username || null
	};
}

/** The code the browser came back with, traded once for a token pair. */
export async function exchangeCode(code: string): Promise<StravaTokens> {
	const tokens = await askForTokens({ code, grant_type: 'authorization_code' });
	stravaTokens.set(tokens);
	return tokens;
}

/**
 * The token to upload with, renewed if it is about to run out. Strava's access tokens last six
 * hours and the refresh token does not expire, so the runner signs in once and never again.
 */
export async function freshAccessToken(now = Date.now()): Promise<string> {
	const held = get(stravaTokens);
	if (!held) throw new StravaError('disconnected', 'not connected to Strava');
	if (!isStale(held, now)) return held.accessToken;

	try {
		const renewed = await askForTokens({
			refresh_token: held.refreshToken,
			grant_type: 'refresh_token'
		});
		// The athlete is only named when signing in, so a refresh must not forget who this is.
		stravaTokens.set({ ...renewed, athlete: renewed.athlete ?? held.athlete });
		return renewed.accessToken;
	} catch (error) {
		// A refusal here means the runner took the permission away at Strava's end.
		if (error instanceof StravaError && error.kind === 'disconnected') forgetStrava();
		throw error;
	}
}
