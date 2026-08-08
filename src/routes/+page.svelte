<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { listSessions, listAllActivities, createSession } from '$lib/db/repository';
	import { autoConditions, captureConditions, LocationDeniedError } from '$lib/conditions';

	let sessions = $state<Awaited<ReturnType<typeof listSessions>>>([]);
	let counts = $state<Record<string, number>>({});
	let busy = $state(false);
	let notice = $state<string | null>(null);

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

	async function start() {
		busy = true;
		notice = null;
		let position: { latitude: number; longitude: number; weather: string | null } | null = null;

		if ($autoConditions) {
			try {
				const conditions = await captureConditions();
				position = {
					latitude: conditions.latitude,
					longitude: conditions.longitude,
					weather: conditions.weather ? JSON.stringify(conditions.weather) : null
				};
			} catch (error) {
				// A refused permission must not block starting a session.
				notice =
					error instanceof LocationDeniedError ? $t('session.locationDenied') : String(error);
			}
		}

		const id = await createSession({
			latitude: position?.latitude ?? null,
			longitude: position?.longitude ?? null,
			weather: position?.weather ?? null
		});
		busy = false;
		goto(`/sessions/${id}`);
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
			class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
			disabled={busy}
			onclick={start}
		>
			{busy ? $t('session.fetching') : $t('sessions.new')}
		</button>
	</header>

	{#if notice}
		<p class="mb-4 rounded-lg border border-accent/40 bg-accent/10 p-3 text-sm">{notice}</p>
	{/if}

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
						class="flex items-center justify-between rounded-xl border border-line bg-surface p-4"
					>
						<div>
							<p class="font-semibold">{s.label ?? $t('sessions.untitled')}</p>
							<p class="text-sm text-muted">
								{new Date(s.startedAt).toLocaleDateString()} · {activityLabel(s.id)}
							</p>
						</div>
						<span class="text-muted">›</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>
