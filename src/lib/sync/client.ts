import type { SupabaseClient } from '@supabase/supabase-js';
import { syncConfig } from './config';

// One client, created on first use and never at boot: an archer who never signs in never downloads
// the library, and an unreachable server can never delay the score sheet opening.

let client: SupabaseClient | null = null;
let signature: string | null = null;

export async function supabase(): Promise<SupabaseClient | null> {
	const config = await syncConfig();
	if (!config) return null;

	const wanted = `${config.url}|${config.anonKey}`;
	if (client && signature === wanted) return client;

	const { createClient } = await import('@supabase/supabase-js');
	client = createClient(config.url, config.anonKey, {
		// Sign in is an email and a password, so nothing ever arrives back through the address bar.
		auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
	});
	signature = wanted;
	return client;
}

