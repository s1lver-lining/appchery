<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listSessions, listAllActivities, createSession, deleteSession } from '$lib/db/repository';
	import Icon from '$lib/ui/Icon.svelte';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let counts = $state<Record<string, number>>({});

	async function refresh() {
		sessions = await listSessions();
		const activities = await listAllActivities();
		counts = activities.reduce<Record<string, number>>((acc, a) => {
			acc[a.sessionId] = (acc[a.sessionId] ?? 0) + 1;
			return acc;
		}, {});
	}
	$effect(() => {
		refresh();
	});

	/**
	 * The session is created and opened immediately. Conditions are fetched on the session page
	 * afterwards, because waiting on a geolocation prompt here left the button stuck on "fetching".
	 */
	async function start() {
		goto(`/sessions/${await createSession({})}`);
	}

	async function remove(id: string) {
		await deleteSession(id);
		await refresh();
	}

	function activityLabel(id: string) {
		const n = counts[id] ?? 0;
		return n === 1 ? $t('sessions.oneActivity') : $t('sessions.activityCount', { n });
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl p-4">
	<header class="mb-4 flex items-center justify-between">
		<h1 class="text-2xl font-bold tracking-tight">{$t('sessions.title')}</h1>
		<button
			class="flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
			onclick={start}
		>
			<Icon name="plus" size={18} />
			{$t('sessions.new')}
		</button>
	</header>

	{#if sessions.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('sessions.empty')}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each sessions as s (s.id)}
				<li class="flex items-center gap-1 rounded-xl border border-line bg-surface">
					<a href="/sessions/{s.id}" class="flex-1 p-4">
						<p class="font-semibold">{s.label ?? $t('sessions.untitled')}</p>
						<p class="text-sm text-muted">
							{new Date(s.startedAt).toLocaleDateString()} · {activityLabel(s.id)}
						</p>
					</a>
					<button
						class="p-4 text-muted"
						aria-label={$t('common.delete')}
						onclick={() => remove(s.id)}
					>
						<Icon name="trash" size={18} />
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
