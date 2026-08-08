<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { BOW_TYPES, templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import {
		listBows,
		createBow,
		deleteBow,
		listSessions,
		createSession,
		createTuningActivity,
		type BowRow
	} from '$lib/db/repository';

	let bows = $state<BowRow[]>([]);
	let adding = $state(false);
	let name = $state('');
	let type = $state<BowType>('recurve');
	let expanded = $state<string | null>(null);

	async function refresh() {
		bows = await listBows();
	}
	$effect(() => {
		refresh();
	});

	async function add() {
		if (!name.trim()) return;
		await createBow(name.trim(), type);
		name = '';
		adding = false;
		await refresh();
	}

	/**
	 * A tuning step is an activity, so it needs a session to live in.
	 * Reuse the most recent open session rather than making the archer create one first.
	 */
	async function startTuning(bow: BowRow, templateKey: string) {
		const sessions = await listSessions();
		const open = sessions.find((s) => s.endedAt === null && s.bowId === bow.id);
		const sessionId = open?.id ?? (await createSession({ bowId: bow.id, label: bow.name }));
		goto(`/activities/${await createTuningActivity(sessionId, templateKey)}`);
	}
</script>

<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
	<header class="flex items-center justify-between">
		<h1 class="text-2xl font-bold tracking-tight">{$t('equipment.title')}</h1>
		<button
			class="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-ink"
			onclick={() => (adding = !adding)}
		>
			{adding ? $t('common.cancel') : $t('equipment.addBow')}
		</button>
	</header>

	{#if adding}
		<section class="space-y-3 rounded-xl border border-line bg-surface p-4">
			<label class="block text-sm font-semibold">
				{$t('equipment.bowName')}
				<input class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink" bind:value={name} />
			</label>
			<label class="block text-sm font-semibold">
				{$t('equipment.bowType')}
				<select class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink" bind:value={type}>
					{#each BOW_TYPES as option (option)}
						<option value={option}>{$t(`bow.${option}`)}</option>
					{/each}
				</select>
			</label>
			<button class="w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink" onclick={add}>
				{$t('common.save')}
			</button>
		</section>
	{/if}

	{#if bows.length === 0}
		<p class="rounded-xl border border-dashed border-line p-8 text-center text-muted">
			{$t('equipment.empty')}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each bows as bow (bow.id)}
				<li class="rounded-xl border border-line bg-surface">
					<div class="flex items-center justify-between p-4">
						<div>
							<p class="font-semibold">{bow.name}</p>
							<p class="text-sm text-muted">{$t(`bow.${bow.type}`)}</p>
						</div>
						<button
							class="text-sm font-medium text-brand"
							onclick={() => (expanded = expanded === bow.id ? null : bow.id)}
						>
							{$t('equipment.tuningSteps')}
						</button>
					</div>

					{#if expanded === bow.id}
						<div class="border-t border-line p-4">
							<p class="mb-2 text-sm text-muted">{$t('tuning.forBow', { bow: bow.name })}</p>
							<ul class="space-y-1">
								{#each templatesForBowType(bow.type as BowType) as template (template.key)}
									<li>
										<button
											class="w-full rounded-lg border border-line p-2 text-left text-sm"
											onclick={() => startTuning(bow, template.key)}
										>
											{template.name}
										</button>
									</li>
								{/each}
							</ul>
							<button
								class="mt-3 text-sm text-danger"
								onclick={async () => {
									await deleteBow(bow.id);
									await refresh();
								}}
							>
								{$t('common.delete')}
							</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>
