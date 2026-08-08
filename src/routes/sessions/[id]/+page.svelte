<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { ROUNDS, getScoreSet } from '$lib/domain/rounds/seed';
	import { maxScore, totalArrows } from '$lib/domain/rounds/geometry';
	import {
		buildCustomRound,
		validateCustomRound,
		type CustomRoundInput
	} from '$lib/domain/rounds/custom';
	import { BOW_TYPES, templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import { formatDistance } from '$lib/domain/units';
	import { captureConditions, formatWeather, LocationDeniedError } from '$lib/conditions';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import {
		getSession,
		updateSession,
		listActivities,
		listBows,
		createScoringActivity,
		createTuningActivity,
		type ActivityRow
	} from '$lib/db/repository';

	const sessionId = $derived($page.params.id as string);

	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);
	let activities = $state<ActivityRow[]>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let adding = $state(false);
	let fetching = $state(false);
	let notice = $state<string | null>(null);

	let custom = $state<CustomRoundInput>({
		ends: 10,
		arrowsPerEnd: 3,
		faceSize: 40,
		distance: 18,
		unit: 'm',
		name: ''
	});
	const customErrors = $derived(validateCustomRound(custom));

	const weather = $derived(session?.weather ? JSON.parse(session.weather) : null);
	const selectedBowType = $derived<BowType | null>(
		((bows.find((b) => b.id === session?.bowId)?.type ?? session?.bowType ?? null) as BowType | null)
	);
	const tuningTemplates = $derived(selectedBowType ? templatesForBowType(selectedBowType) : []);

	async function refresh() {
		session = await getSession(sessionId);
		activities = await listActivities(sessionId);
		bows = await listBows();
	}
	$effect(() => {
		refresh();
	});

	async function setBow(value: string) {
		if (value.startsWith('bow:'))
			await updateSession(sessionId, { bowId: value.slice(4), bowType: null });
		else await updateSession(sessionId, { bowId: null, bowType: value || null });
		await refresh();
	}

	async function fetchConditions() {
		fetching = true;
		notice = null;
		try {
			const conditions = await captureConditions();
			await updateSession(sessionId, {
				latitude: conditions.latitude,
				longitude: conditions.longitude,
				weather: conditions.weather ? JSON.stringify(conditions.weather) : null
			});
			if (!conditions.weather) notice = $t('session.weatherFailed');
			await refresh();
		} catch (error) {
			notice = error instanceof LocationDeniedError ? $t('session.locationDenied') : String(error);
		}
		fetching = false;
	}

	async function startRound(round: RoundDefinition) {
		goto(`/activities/${await createScoringActivity(sessionId, round)}`);
	}

	async function startCustom() {
		if (customErrors.length > 0) return;
		await startRound(buildCustomRound(custom));
	}

	async function startTuning(key: string) {
		goto(`/activities/${await createTuningActivity(sessionId, key)}`);
	}

	function activityTitle(a: ActivityRow) {
		if (a.kind === 'tuning') return a.templateKey ?? $t('tuning.title');
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? '';
	}

	function summarise(round: RoundDefinition) {
		const distances = round.stages
			.map((s) =>
				s.distance ? formatDistance(s.distance.value, s.distance.unit) : $t('round.unmarked')
			)
			.join(' · ');
		return `${distances} · ${$t('round.arrows', { n: totalArrows(round) })}`;
	}
</script>

{#if session}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
		<header>
			<a href="/" class="text-sm text-muted">‹ {$t('common.back')}</a>
			<h1 class="text-2xl font-bold tracking-tight">{session.label ?? $t('sessions.untitled')}</h1>
			<p class="text-sm text-muted">{new Date(session.startedAt).toLocaleString()}</p>
		</header>

		<section class="rounded-xl border border-line bg-surface p-4">
			<label class="mb-1 block text-sm font-semibold" for="bow">{$t('session.bow')}</label>
			<select
				id="bow"
				class="w-full rounded-lg border border-line bg-bg p-2 text-ink"
				value={session.bowId ? `bow:${session.bowId}` : (session.bowType ?? '')}
				onchange={(e) => setBow(e.currentTarget.value)}
			>
				<option value="">{$t('session.noBow')}</option>
				{#if bows.length > 0}
					<optgroup label={$t('session.myBows')}>
						{#each bows as b (b.id)}
							<option value="bow:{b.id}">{b.name}</option>
						{/each}
					</optgroup>
				{/if}
				<optgroup label={$t('session.genericBow')}>
					{#each BOW_TYPES as type (type)}
						<option value={type}>{$t(`bow.${type}`)}</option>
					{/each}
				</optgroup>
			</select>
		</section>

		<section class="rounded-xl border border-line bg-surface p-4">
			<div class="flex items-center justify-between gap-2">
				<h2 class="text-sm font-semibold">{$t('session.conditions')}</h2>
				<button class="text-sm font-medium text-brand" disabled={fetching} onclick={fetchConditions}>
					{fetching ? $t('session.fetching') : $t('session.fetchConditions')}
				</button>
			</div>
			{#if session.latitude !== null && session.longitude !== null}
				<p class="mt-2 text-sm text-muted">
					{session.latitude.toFixed(3)}, {session.longitude.toFixed(3)}
					{#if weather}· {formatWeather(weather)}{/if}
				</p>
			{/if}
			{#if notice}
				<p class="mt-2 text-sm text-danger">{notice}</p>
			{/if}
		</section>

		<section>
			<div class="mb-2 flex items-center justify-between">
				<h2 class="text-sm font-semibold">{$t('session.activities')}</h2>
				<button
					class="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
					onclick={() => (adding = !adding)}
				>
					{adding ? $t('common.close') : $t('common.add')}
				</button>
			</div>

			{#if activities.length === 0}
				<p class="rounded-xl border border-dashed border-line p-6 text-center text-muted">
					{$t('session.noActivities')}
				</p>
			{:else}
				<ul class="space-y-2">
					{#each activities as a (a.id)}
						<li>
							<a
								href="/activities/{a.id}"
								class="flex items-center justify-between rounded-xl border border-line bg-surface p-3"
							>
								<div>
									<p class="font-medium">{activityTitle(a)}</p>
									<p class="text-xs text-muted">
										{a.kind === 'tuning'
											? $t('tuning.title')
											: `${a.arrowsShot} ${$t('score.arrow')}`}
									</p>
								</div>
								{#if a.kind === 'scoring'}
									<span class="tabular text-xl font-bold">{a.totalScore}</span>
								{/if}
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if adding}
			<section class="space-y-3 rounded-xl border border-line bg-surface p-4">
				<h3 class="text-sm font-semibold">{$t('session.addScoring')}</h3>
				<div class="space-y-2">
					{#each ROUNDS as round (round.id)}
						<button
							class="w-full rounded-lg border border-line p-3 text-left"
							onclick={() => startRound(round)}
						>
							<div class="flex items-baseline justify-between gap-2">
								<span class="font-medium">{round.name}</span>
								<span class="text-xs text-muted">
									{$t('round.max', { n: maxScore(round, getScoreSet(round.scoreSetId)) })}
								</span>
							</div>
							<p class="text-sm text-muted">{summarise(round)}</p>
						</button>
					{/each}
				</div>

				<div class="rounded-lg border border-line p-3">
					<h4 class="font-medium">{$t('round.custom')}</h4>
					<p class="mb-3 text-sm text-muted">{$t('round.customHint')}</p>
					<div class="grid grid-cols-2 gap-3">
						<label class="text-sm">
							{$t('round.ends')}
							<input
								type="number"
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								bind:value={custom.ends}
							/>
						</label>
						<label class="text-sm">
							{$t('round.arrowsPerEnd')}
							<input
								type="number"
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								bind:value={custom.arrowsPerEnd}
							/>
						</label>
						<label class="text-sm">
							{$t('round.faceSize')}
							<input
								type="number"
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								bind:value={custom.faceSize}
							/>
						</label>
						<label class="text-sm">
							{$t('round.distance')}
							<div class="mt-1 flex gap-1">
								<input
									type="number"
									class="w-full rounded-lg border border-line bg-bg p-2 text-ink"
									bind:value={custom.distance}
								/>
								<select
									class="rounded-lg border border-line bg-bg p-2 text-ink"
									bind:value={custom.unit}
								>
									<option value="m">m</option>
									<option value="yd">yd</option>
								</select>
							</div>
						</label>
						<label class="col-span-2 text-sm">
							{$t('round.name')} <span class="text-muted">({$t('common.optional')})</span>
							<input
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								bind:value={custom.name}
							/>
						</label>
					</div>
					<button
						class="mt-3 w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink disabled:opacity-50"
						disabled={customErrors.length > 0}
						onclick={startCustom}
					>
						{$t('round.create')}
					</button>
				</div>

				<div class="rounded-lg border border-line p-3">
					<h4 class="mb-2 font-medium">{$t('session.addTuning')}</h4>
					{#if !selectedBowType}
						<p class="text-sm text-muted">{$t('tuning.noBowSelected')}</p>
					{:else}
						<ul class="space-y-1">
							{#each tuningTemplates as template (template.key)}
								<li>
									<button
										class="w-full rounded-lg border border-line p-2 text-left text-sm"
										onclick={() => startTuning(template.key)}
									>
										{template.name}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</section>
		{/if}
	</div>
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
