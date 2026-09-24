/**
 * The Strava application this app signs in as. Both halves ship to the phone, because the upload
 * happens on the phone and a phone cannot keep a secret: see doc/llm-memory/strava.md for what that costs and
 * why it is the trade taken for now.
 *
 * Unset and the export never appears, the way the app builds without sync when Supabase is unset.
 */
export const strava = {
	clientId: import.meta.env.PUBLIC_STRAVA_CLIENT_ID as string | undefined,
	clientSecret: import.meta.env.PUBLIC_STRAVA_CLIENT_SECRET as string | undefined
};

export function stravaConfigured(): boolean {
	return Boolean(strava.clientId && strava.clientSecret);
}

/**
 * Where Strava sends the runner back to. It has to sit on the callback domain registered with
 * Strava, and it is the app's own site, which the installed app claims: the same link opens the app
 * on a phone and the site in a browser, so one address serves both.
 */
export const STRAVA_REDIRECT = 'https://app.appchery.com/strava/callback';

/**
 * The same page on the app's own scheme. Strava will only return to its registered domain, and
 * Chrome will not hand an https redirect to an app, so the page it returns to forwards to this: a
 * scheme the browser cannot open itself is one it has to pass on. See doc/llm-memory/strava.md.
 */
export const STRAVA_APP_CALLBACK = 'appchery://strava/callback';

/** Writing an activity is all this asks for. It never reads anything back out of Strava. */
export const STRAVA_SCOPE = 'activity:write';

export const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
export const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';
export const STRAVA_API = 'https://www.strava.com/api/v3';
