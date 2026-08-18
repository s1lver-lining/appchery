/**
 * The half `scripts/check-sql.sh` cannot speak for: GoTrue, PostgREST and Row Level Security as
 * actually deployed. It makes the same calls push, pull and social.ts make, using two real accounts.
 *
 * Usage: node scripts/check-server.mjs [.env.preprod]
 *
 * Two fixed accounts, reused run after run and signed in rather than signed up when they already
 * exist, so repeated checks leave two rows in the user list and never a growing pile. Their data is
 * cleared at both ends of the run: before, so a half finished run cannot fail the next one, and
 * after, so the project is left as it was found.
 *
 * It still writes real rows under real accounts, so it belongs on preprod, and production is refused.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const envFile = process.argv[2] ?? '.env.preprod';
if (envFile.includes('production')) {
	console.error('Refusing to create test accounts in production.');
	process.exit(1);
}

const env = Object.fromEntries(
	readFileSync(envFile, 'utf8')
		.split('\n')
		.filter((line) => line.includes('='))
		.map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()])
);

const URL = env.PUBLIC_SUPABASE_URL;
const KEY = env.PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !KEY) {
	console.error(`${envFile} carries no server: see .env.example.`);
	process.exit(1);
}
console.log(`checking ${URL}\n`);

/** Fixed, so the project accumulates two accounts rather than two per run. */
const ACCOUNTS = {
	a: { email: 'appchery.check.a@example.com', password: 'appchery-check-a-pw' },
	b: { email: 'appchery.check.b@example.com', password: 'appchery-check-b-pw' }
};

const stamp = Date.now();
const results = [];
function check(name, ok, detail = '') {
	results.push({ name, ok, detail });
	console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function signUp(tag) {
	const { email, password } = ACCOUNTS[tag];
	const client = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

	const existing = await client.auth.signInWithPassword({ email, password });
	if (existing.data?.session) return { client, id: existing.data.user.id, email };

	const { data, error } = await client.auth.signUp({ email, password });
	if (error) throw new Error(`${tag} sign in and sign up both failed: ${error.message}`);
	if (!data.session) throw new Error(`${tag} sign up returned no session (confirmations on?)`);
	return { client, id: data.user.id, email };
}

/** Everything a previous run wrote, so each run starts from the same place and leaves it that way. */
async function clear(who, other) {
	void other;
	await who.client.from('block').delete().eq('blocker_id', who.id);
	await who.client.from('follow').delete().eq('follower_id', who.id);
	await who.client.from('follow').delete().eq('followee_id', who.id);
	for (const table of ['shot', 'round_end', 'activity', 'session']) {
		await who.client.from(table).delete().eq('user_id', who.id);
	}
	await who.client.from('profile').update({ is_public: false }).eq('user_id', who.id);
}

const a = await signUp('a');
const b = await signUp('b');
check('two accounts sign in and receive a session', Boolean(a.id && b.id));

await clear(a, b);
await clear(b, a);

const now = Date.now();
const base = (id) => ({ id, created_at: now, updated_at: now, deleted_at: null, device_id: 'e2e' });

/* Push: the shapes push.ts actually sends */
const sessionId = `e2e-session-${stamp}`;
const activityId = `e2e-activity-${stamp}`;
const endId = `e2e-end-${stamp}`;

let { error } = await a.client
	.from('session')
	.upsert([{ ...base(sessionId), started_at: now, kind: 'practice', label: 'End to end' }], { onConflict: 'id' });
check('push writes a session', !error, error?.message);

({ error } = await a.client
	.from('activity')
	.upsert([{ ...base(activityId), session_id: sessionId, kind: 'scoring', started_at: now, total_score: 271 }], {
		onConflict: 'id'
	}));
check('push writes an activity', !error, error?.message);

({ error } = await a.client
	.from('round_end')
	.upsert([{ ...base(endId), activity_id: activityId, stage_index: 0, end_no: 1, subtotal: 27 }], { onConflict: 'id' }));
check('push writes an end', !error, error?.message);

/* The server stamps its own cursor column */
const { data: cursorRows } = await a.client.from('session').select('server_updated_at').eq('id', sessionId);
check('server_updated_at is set by the server', Boolean(cursorRows?.[0]?.server_updated_at), cursorRows?.[0]?.server_updated_at);

/* Pull: the exact query pull.ts issues */
const { data: pulled, error: pullError } = await a.client
	.from('session')
	.select('*')
	.eq('user_id', a.id)
	.gt('server_updated_at', '1970-01-01T00:00:00Z')
	.order('server_updated_at', { ascending: true })
	.limit(500);
check('pull reads its own rows back', !pullError && pulled?.length === 1, pullError?.message ?? `${pulled?.length} rows`);

/* user_id is stamped by the default, never sent by the client */
check('user_id is stamped server side', pulled?.[0]?.user_id === a.id);

/* Isolation */
const { data: theirs } = await b.client.from('session').select('*');
check('a second account reads none of the first ones rows', theirs?.length === 0, `${theirs?.length} rows`);

const { data: stolen } = await b.client.from('session').update({ label: 'stolen' }).eq('id', sessionId).select();
check('a second account cannot edit them', (stolen ?? []).length === 0);

const { data: deleted } = await b.client.from('session').delete().eq('id', sessionId).select();
check('a second account cannot delete them', (deleted ?? []).length === 0);

/* Ownership cannot be handed over */
const { error: giveaway } = await a.client.from('session').update({ user_id: b.id }).eq('id', sessionId);
check('a row cannot be handed to another account', Boolean(giveaway), giveaway?.message);

/* Handles */
const handleA = `e2e_a_${String(stamp).slice(-8)}`;
const handleB = `e2e_b_${String(stamp).slice(-8)}`;
({ error } = await a.client.rpc('claim_handle', { wanted: handleA, display: 'Archer A' }));
check('claim_handle takes a handle', !error, error?.message);

({ error } = await b.client.rpc('claim_handle', { wanted: handleB, display: 'Archer B' }));
check('a second archer claims their own', !error, error?.message);

({ error } = await b.client.rpc('claim_handle', { wanted: 'admin' }));
check('a reserved handle is refused', error?.message === 'handle unavailable', error?.message);

({ error } = await b.client.rpc('claim_handle', { wanted: handleA.toUpperCase() }));
check('a handle differing only in case is refused', Boolean(error), error?.message);

/* Lookup */
const { data: found, error: lookupError } = await b.client.rpc('lookup_profile', { wanted: handleA });
check('lookup_profile finds an exact handle', !lookupError && found?.[0]?.handle === handleA, lookupError?.message);
check('a private profile reports itself private', found?.[0]?.is_public === false);

const { data: missing } = await b.client.rpc('lookup_profile', { wanted: 'nobody_here_at_all' });
check('lookup_profile finds nothing for an unknown handle', (missing ?? []).length === 0);

const { data: openTable, error: openError } = await b.client.from('profile').select('*');
check('the profile table itself is not a directory', (openTable ?? []).length <= 1, openError?.message ?? `${openTable?.length} rows`);

/* Follow a private profile */
const { data: requested, error: followError } = await b.client.rpc('request_follow', { target: a.id });
check('request_follow on a private profile is pending', requested === 'pending', followError?.message ?? String(requested));

const { data: pending } = await a.client.from('follow').select('*').eq('followee_id', a.id);
check('the request reaches the pending list', pending?.length === 1);

/* Sharing, before approval */
await a.client.from('activity').update({ shared_at: Date.now() }).eq('id', activityId);
let { data: visible } = await b.client.from('activity').select('*').eq('id', activityId);
check('a shared activity stays hidden from an unapproved follower', (visible ?? []).length === 0);

/* Approve, then look again */
await a.client.from('follow').update({ status: 'approved' }).eq('follower_id', b.id).eq('followee_id', a.id);
({ data: visible } = await b.client.from('activity').select('*').eq('id', activityId));
check('an approved follower sees the shared activity', visible?.length === 1);

const { data: endsSeen } = await b.client.from('round_end').select('*').eq('activity_id', activityId);
check('and the ends underneath it', endsSeen?.length === 1);

const { data: sessionSeen } = await b.client.from('session').select('*').eq('id', sessionId);
check('but never the session, so the conditions stay private', (sessionSeen ?? []).length === 0);

/* Unsharing revokes */
await a.client.from('activity').update({ shared_at: null }).eq('id', activityId);
({ data: visible } = await b.client.from('activity').select('*').eq('id', activityId));
check('unsharing takes it back', (visible ?? []).length === 0);
await a.client.from('activity').update({ shared_at: Date.now() }).eq('id', activityId);

/* Blocking */
const beforeBlock = await b.client.rpc('lookup_profile', { wanted: handleA });
await a.client.rpc('block_account', { target: b.id });
const afterBlock = await b.client.rpc('lookup_profile', { wanted: handleA });

/*
 * follow_status is compared separately: a dropped follow reads as 'none', which is also what a
 * refused request reads as. That the two are indistinguishable is the property worth having, since a
 * status nobody else could produce would announce the block.
 */
check(
	'a blocked account sees the same profile fields as before',
	JSON.stringify({ ...(beforeBlock.data?.[0] ?? {}), follow_status: null }) ===
		JSON.stringify({ ...(afterBlock.data?.[0] ?? {}), follow_status: null }),
	JSON.stringify(afterBlock.data?.[0])
);
check('a blocked account is shown a private profile', afterBlock.data?.[0]?.is_public === false);
check('a blocked account is not told its follow was dropped', afterBlock.data?.[0]?.follow_status === 'none');

const { data: reRequest } = await b.client.rpc('request_follow', { target: a.id });
check('a follow request from a blocked account answers as usual', reRequest === 'pending', String(reRequest));

const { data: stillPending } = await a.client.from('follow').select('*').eq('followee_id', a.id);
check('and never reaches the pending list', (stillPending ?? []).length === 0, `${stillPending?.length} rows`);

const { data: blockedView } = await b.client.from('activity').select('*').eq('id', activityId);
check('a blocked account can no longer read what it could', (blockedView ?? []).length === 0);

/* Tombstones */
await a.client.from('session').update({ deleted_at: Date.now(), updated_at: Date.now() }).eq('id', sessionId);
const { data: tombstoned } = await a.client.from('session').select('deleted_at').eq('id', sessionId);
check('a tombstone is an ordinary row the owner still reads', Boolean(tombstoned?.[0]?.deleted_at));

/* Anonymous reach */
const anon = createClient(URL, KEY, { auth: { persistSession: false } });
const { data: anonRows, error: anonError } = await anon.from('session').select('*');
check('an unauthenticated caller reaches nothing', (anonRows ?? []).length === 0, anonError?.message ?? '0 rows');

const { error: anonRpc } = await anon.rpc('lookup_profile', { wanted: handleA });
check('and cannot call the lookup function', Boolean(anonRpc), anonRpc?.message);

/*
 * Every write the app makes, in the shape it makes it. Column level grants mean a statement naming
 * one column too many fails whole, and the client reads that as "no connection": a class of bug that
 * only shows up against a real deployment, and only if something actually tries the statement.
 */
async function writes(who, other) {
	const now = Date.now();
	const base = (id) => ({ id, created_at: now, updated_at: now, deleted_at: null, device_id: 'write-check' });

	return [
		['a session, as push sends it', () => who.client.from('session').upsert([{ ...base(`w-session-${stamp}`), started_at: now, kind: 'practice' }])],
		['an activity, shared', () => who.client.from('activity').upsert([{ ...base(`w-activity-${stamp}`), session_id: `w-session-${stamp}`, kind: 'scoring', started_at: now, shared_at: now }])],
		['an end', () => who.client.from('round_end').upsert([{ ...base(`w-end-${stamp}`), activity_id: `w-activity-${stamp}`, stage_index: 0, end_no: 1, subtotal: 27 }])],
		['a shot', () => who.client.from('shot').upsert([{ ...base(`w-shot-${stamp}`), end_id: `w-end-${stamp}`, ordinal: 1, value: 9, zone_label: '9' }])],
		['a bow', () => who.client.from('bow').upsert([{ ...base(`w-bow-${stamp}`), name: 'A bow', type: 'recurve' }])],
		['the profile going public', () => who.client.from('profile').update({ is_public: true }).eq('user_id', who.id)],
		['the profile going private again', () => who.client.from('profile').update({ is_public: false }).eq('user_id', who.id)],
		['the profile card', () => who.client.from('profile_card').upsert({ user_id: who.id, arrows: 10, sessions: 1, badges: 0, level: 1, updated_at: now }, { onConflict: 'user_id' })],
		['approving a follower', () => who.client.from('follow').update({ status: 'approved' }).eq('follower_id', other.id).eq('followee_id', who.id)],
		['removing a follower', () => who.client.from('follow').delete().eq('follower_id', other.id).eq('followee_id', who.id)],
		['unblocking', () => who.client.from('block').delete().eq('blocker_id', who.id).eq('blocked_id', other.id)]
	];
}

for (const [what, write] of await writes(a, b)) {
	const { error } = await write();
	check(`the client can write ${what}`, !error, error?.message);
}

await clear(a, b);
await clear(b, a);

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
console.log(`accounts reused, rows cleared: ${a.email} / ${b.email}`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
