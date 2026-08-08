<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listSessions, listAllActivities, createSession } from '$lib/db/repository';
	import { defaultBowId } from '$lib/prefs';
	import Icon from '$lib/ui/Icon.svelte';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let counts = $state<Record<string, { activities: number; arrows: number }>>({});

	async function refresh() {
		sessions = await listSessions();
		const activities = await listAllActivities();
		counts = activities.reduce<Record<string, { activities: number; arrows: number }>>((acc, a) => {
			const entry = (acc[a.sessionId] ??= { activities: 0, arrows: 0 });
			entry.activities += 1;
			entry.arrows += a.arrowsShot;
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
		goto(`/sessions/${await createSession({ bowId: $defaultBowId })}`);
	}

	function activityLabel(id: string) {
		const n = counts[id]?.activities ?? 0;
		return n === 1 ? $t('sessions.oneActivity') : $t('sessions.activityCount', { n });
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl p-4 pt-6">
	<header class="mt-2 mb-4 flex items-center justify-between">
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
				<li>
					<a
						href="/sessions/{s.id}"
						class="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4"
					>
						<div class="min-w-0">
							<p class="truncate font-semibold">{s.label ?? $t('sessions.untitled')}</p>
							<p class="text-sm text-muted">
								{new Date(s.startedAt).toLocaleDateString()} · {activityLabel(s.id)}
							</p>
						</div>
						<div class="text-right">
							<p class="tabular text-xl font-bold">{counts[s.id]?.arrows ?? 0}</p>
							<p class="text-xs text-muted">{$t('sessions.arrows')}</p>
						</div>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
