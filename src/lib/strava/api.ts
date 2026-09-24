import {
	STRAVA_API,
	STRAVA_AUTH,
	STRAVA_REDIRECT,
	STRAVA_SCOPE,
	strava
} from './config';
import { StravaError, freshAccessToken, forgetStrava } from './tokens';

/** Where the runner is sent to say yes. `force` asks again even if they already said it once. */
export function authorizeUrl(force = false): string {
	const asking = new URLSearchParams({
		client_id: strava.clientId ?? '',
		redirect_uri: STRAVA_REDIRECT,
		response_type: 'code',
		approval_prompt: force ? 'force' : 'auto',
		scope: STRAVA_SCOPE
	});
	return `${STRAVA_AUTH}?${asking}`;
}

/** What came back on the callback: the code to trade, or why there is not one. */
export function readCallback(search: URLSearchParams): { code: string } | { refused: string } {
	const error = search.get('error');
	if (error) return { refused: error };
	const code = search.get('code');
	if (!code) return { refused: 'missing_code' };
	// Strava grants each scope separately, and a run cannot be written without this one.
	const scope = search.get('scope') ?? '';
	if (!scope.split(',').includes(STRAVA_SCOPE)) return { refused: 'missing_scope' };
	return { code };
}

/** How long a run is given to appear on Strava before the app stops watching for it. */
const PROCESSING_MS = 60_000;
const POLL_MS = 2_000;

export interface StravaUpload {
	uploadId: number;
	activityId: number | null;
	/** Set when Strava took the file and then refused it, which is a finished answer, not a wait. */
	error: string | null;
}

async function asStrava<T>(url: string, init: RequestInit): Promise<T> {
	let response: Response;
	try {
		response = await fetch(url, init);
	} catch (error) {
		throw new StravaError('offline', String(error));
	}
	if (response.status === 401) {
		forgetStrava();
		throw new StravaError('disconnected', 'Strava no longer accepts this sign in');
	}
	if (!response.ok && response.status !== 400) {
		throw new StravaError('refused', `Strava answered ${response.status}`);
	}
	const said = await response.json().catch(() => null);
	if (said === null) throw new StravaError('unreadable', 'Strava sent nothing back');
	return said as T;
}

type UploadSaid = {
	id?: number;
	id_str?: string;
	activity_id?: number | null;
	error?: string | null;
	status?: string;
};

function upload(said: UploadSaid | null): StravaUpload {
	if (!said?.id) throw new StravaError('unreadable', 'Strava named no upload');
	return {
		uploadId: said.id,
		activityId: said.activity_id ?? null,
		error: said.error ?? null
	};
}

/**
 * The run handed over as the GPX the app already writes, so a run sent to Strava and a run exported
 * to a file are the same run. Strava takes the file and works on it afterwards, so this comes back
 * with an upload rather than with an activity.
 */
export async function startUpload(
	gpx: string,
	name: string,
	externalId: string,
	description?: string
): Promise<StravaUpload> {
	const token = await freshAccessToken();
	const form = new FormData();
	form.append('file', new Blob([gpx], { type: 'application/gpx+xml' }), `${externalId}.gpx`);
	form.append('data_type', 'gpx');
	form.append('name', name);
	// Strava uses this to recognise a file it has already taken, which is what stops a double upload.
	form.append('external_id', externalId);
	if (description) form.append('description', description);

	return upload(
		await asStrava<UploadSaid>(`${STRAVA_API}/uploads`, {
			method: 'POST',
			headers: { authorization: `Bearer ${token}` },
			body: form
		})
	);
}

export async function readUpload(uploadId: number): Promise<StravaUpload> {
	const token = await freshAccessToken();
	return upload(
		await asStrava<UploadSaid>(`${STRAVA_API}/uploads/${uploadId}`, {
			headers: { authorization: `Bearer ${token}` }
		})
	);
}

/**
 * Waiting for Strava to turn the file into an activity. It is asked rather than told, because there
 * is nothing for Strava to call back to on a phone.
 */
export async function waitForActivity(
	uploadId: number,
	wait = (ms: number) => new Promise((done) => setTimeout(done, ms))
): Promise<StravaUpload> {
	const until = Date.now() + PROCESSING_MS;
	let last = await readUpload(uploadId);
	while (!last.activityId && !last.error && Date.now() < until) {
		await wait(POLL_MS);
		last = await readUpload(uploadId);
	}
	return last;
}

/**
 * Strava works the sport out from the file, and a GPX it is unsure about becomes a workout, which it
 * then shows without a pace. The file says `running` and this says it again on the activity itself,
 * because the one that matters on screen is the activity's own.
 *
 * Never worth failing a send over: the run is on Strava either way and the sport can be changed there.
 */
export async function nameTheSport(activityId: number): Promise<void> {
	try {
		const token = await freshAccessToken();
		await fetch(`${STRAVA_API}/activities/${activityId}`, {
			method: 'PUT',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ sport_type: 'Run' })
		});
	} catch {
		// Said in the file too, so there is nothing here worth telling the runner about.
	}
}

/**
 * Strava says a file it has seen before is a duplicate, and names the activity it became. That is a
 * run already on Strava rather than a failure, so it is read back out and the run is marked with it.
 */
export function duplicateOf(error: string | null): number | null {
	if (!error) return null;
	const found = /duplicate of activity (\d+)/i.exec(error);
	return found ? Number(found[1]) : null;
}
