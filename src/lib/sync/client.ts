import type { SupabaseClient } from '@supabase/supabase-js';
import { syncConfig, type SyncConfig } from './config';

/**
 * One Supabase client, created on first use and never at boot.
 *
 * Deliberately lazy and dynamically imported: an archer who never signs in must not pay for the
 * library in their startup path, and a server that is unreachable must not be able to delay the
 * score sheet opening. Nothing in `src/lib/sync` may be imported from the app's boot path.
 */

let client: SupabaseClient | null = null;
let signature: string | null = null;

export async function supabase(): Promise<SupabaseClient | null> {
	const config = await syncConfig();
	if (!config) return null;
	return clientFor(config);
}

export async function clientFor(config: SyncConfig): Promise<SupabaseClient> {
	const wanted = `${config.url}|${config.anonKey}`;
	if (client && signature === wanted) return client;

	const { createClient } = await import('@supabase/supabase-js');
	client = createClient(config.url, config.anonKey, {
		auth: {
			persistSession: true,
			autoRefreshToken: true,
			// Nothing arrives back through a URL: sign in is an email and a password, so there is no
			// redirect to detect and no reason to let the library rewrite the address bar.
			detectSessionInUrl: false
		}
	});
	signature = wanted;
	return client;
}

/** Dropped when the endpoint changes, so a new server never inherits the old one's session. */
export function forgetClient() {
	client = null;
	signature = null;
}
