import { version } from '$app/environment';

/**
 * What this build calls itself. SvelteKit's version string is set in svelte.config.js to the
 * release followed by the build number, and the service worker names its cache after the same
 * string, so what the about section says is what the device is actually running.
 */
const [release, build] = version.split('+');

export const appVersion = release;
/** Missing only in a dev server started from a tree with no git history. */
export const appBuild = build ?? '';
