<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { ROUNDS, UNVERIFIED_ROUNDS, getScoreSet, roundNeedsVerification } from '$lib/domain/rounds/seed';
	import { maxScore, totalArrows } from '$lib/domain/rounds/geometry';
	import {
		buildCustomRound,
		validateCustomRound,
		FACE_SIZES,
		DISTANCES_M,
		DISTANCES_YD,
		END_COUNTS,
		ARROWS_PER_END,
		type CustomRoundInput
	} from '$lib/domain/rounds/custom';
	import { BOW_TYPES, templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import { formatDistance } from '$lib/domain/units';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import { registerTabs } from '$lib/nav';
	import {
		captureConditions,
		formatTemperature,
		formatWind,
		weatherIcon,
		weatherLabelKey,
		autoLocation,
		autoWeather,
		autoPlaceName,
		LocationDeniedError
	} from '$lib/conditions';
	import type { RoundDefinition } from '$lib/domain/rounds/types';
	import {
		getSession,
		updateSession,
		deleteSession,
		listActivities,
		listBows,
		createScoringActivity,
		createTuningActivity,
		type ActivityRow
	} from '$lib/db/repository';
	import Icon from '$lib/ui/Icon.svelte';
	import WheelPicker from '$lib/ui/WheelPicker.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import { formatDateTime } from '$lib/prefs';

	const sessionId = $derived($page.params.id as string);

	let session = $state<Awaited<ReturnType<typeof getSession>>>(null);
	let activities = $state<ActivityRow[]>([]);
	let bows = $state<Awaited<ReturnType<typeof listBows>>>([]);
	let tab = $state<'overview' | 'settings'>('overview');
	const TABS = $derived([
		{ key: 'overview' as const, label: $t('session.overviewTab') },
		{ key: 'settings' as const, label: $t('session.settingsTab') }
	]);
	$effect(() =>
		registerTabs({
			count: TABS.length,
			index: TABS.findIndex((item) => item.key === tab),
			select: (i) => (tab = TABS[i].key)
		})
	);
	let adding = $state(false);
	let fetching = $state(false);
	let notice = $state<string | null>(null);
	/** The name reads as a heading until tapped, so the page does not look like a form. */
	let editingName = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);
	let confirmingDelete = $state(false);

	let custom = $state<CustomRoundInput>({
		ends: 6,
		arrowsPerEnd: 6,
		faceSize: 40,
		distance: 18,
		unit: 'm',
		name: ''
	});
	const customErrors = $derived(validateCustomRound(custom));
	const distances = $derived(custom.unit === 'm' ? DISTANCES_M : DISTANCES_YD);

	const weather = $derived(session?.weather ? JSON.parse(session.weather) : null);
	const selectedBowType = $derived<BowType | null>(
		(bows.find((b) => b.id === session?.bowId)?.type ?? session?.bowType ?? null) as BowType | null
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

	// Fetch once for a session that has none yet, so a slow permission prompt never blocks the UI.
	let attempted = false;
	$effect(() => {
		if (!session || attempted || !$autoLocation || session.latitude !== null) return;
		attempted = true;
		fetchConditions();
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
			const conditions = await captureConditions($autoWeather, $autoPlaceName);
			await updateSession(sessionId, {
				latitude: conditions.latitude,
				longitude: conditions.longitude,
				location: conditions.place,
				weather: conditions.weather ? JSON.stringify(conditions.weather) : null
			});
			// Being offline at a range is normal, so a failed lookup says so rather than showing nothing.
			if (!$autoWeather) notice = $t('session.weatherOff');
			else if (!conditions.weather) notice = $t('session.weatherFailed');
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

	function startRename() {
		editingName = true;
		// Focus after the input exists, and select so a placeholder name is replaced by typing.
		queueMicrotask(() => nameInput?.select());
	}

	async function saveName(value: string) {
		editingName = false;
		await updateSession(sessionId, { label: value.trim() || null });
		await refresh();
	}

	async function remove() {
		await deleteSession(sessionId);
		goto('/sessions');
	}

	function activityTitle(a: ActivityRow) {
		if (a.kind === 'tuning') return a.templateKey ?? $t('tuning.title');
		const round: RoundDefinition | null = a.roundDefinition ? JSON.parse(a.roundDefinition) : null;
		return round?.name ?? '';
	}

	function summarise(round: RoundDefinition) {
		const stages = round.stages
			.map((s) =>
				s.distance ? formatDistance(s.distance.value, s.distance.unit) : $t('round.unmarked')
			)
			.join(' · ');
		return `${stages} · ${$t('round.arrows', { n: totalArrows(round) })}`;
	}
</script>

{#if session}
	<PageHeader motif="session" subtitle={$formatDateTime(session.startedAt)}>
		{#snippet lead()}
			{@const named = session}
			<a href="/sessions" class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
				<Icon name="back" size={22} />
			</a>
			{#if editingName}
				<input
					bind:this={nameInput}
					class="mt-1 w-full rounded-lg border-2 border-brand bg-surface px-3 py-2 text-2xl font-bold tracking-tight text-ink outline-none"
					value={named?.label ?? ''}
					placeholder={$t('sessions.untitled')}
					onblur={(e) => saveName(e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
						if (e.key === 'Escape') editingName = false;
					}}
				/>
			{:else}
				<button
					class="-mx-1 mt-1 rounded-lg px-1 text-left text-2xl font-bold tracking-tight
						{named?.label ? 'text-ink' : 'text-muted'}"
					onclick={startRename}
				>
					{named?.label ?? $t('sessions.untitled')}
				</button>
			{/if}
		{/snippet}
	</PageHeader>

	<div class="mx-auto w-full max-w-2xl space-y-4 p-4">
		<nav class="flex gap-1 rounded-lg bg-sunk p-1">
			{#each TABS as item (item.key)}
				<button
					class="flex-1 rounded-md py-1.5 text-sm font-medium
						{tab === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
					onclick={() => (tab = item.key as typeof tab)}
				>
					{item.label}
				</button>
			{/each}
		</nav>

		{#if tab === 'overview'}
			<!-- Where and in what weather comes first, because it frames every score below it. -->
			{#if session.location || session.latitude !== null}
				<section class="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
					{#if weather}
						<div class="flex flex-col items-center text-brand-text">
							<Icon name={weatherIcon(weather.code)} size={40} />
							<span class="mt-1 text-xs text-muted">{$t(weatherLabelKey(weather.code))}</span>
						</div>
					{/if}
					<div class="flex-1">
						<p class="text-lg font-semibold">{session.location ?? $t('session.unknownPlace')}</p>
						{#if weather}
							<p class="tabular text-sm text-muted">
								{formatTemperature(weather)} · {formatWind(weather)}
							</p>
						{:else}
							<p class="text-sm text-muted">{$t('session.weatherNone')}</p>
						{/if}
					</div>
				</section>
			{/if}

			<section>
				<div class="mb-2 flex items-center justify-between">
					<h2 class="text-sm font-semibold">{$t('session.activities')}</h2>
					<button
						class="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
						onclick={() => (adding = true)}
					>
						<Icon name="plus" size={16} />
						{$t('common.add')}
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
		{:else}
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

			<section class="overflow-hidden rounded-xl border border-line bg-surface">
				<div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
					<h2 class="text-sm font-semibold">{$t('session.conditions')}</h2>
					<button
						class="text-sm font-medium text-brand-text disabled:opacity-50"
						disabled={fetching}
						onclick={fetchConditions}
					>
						{fetching ? $t('session.fetching') : $t('session.fetchConditions')}
					</button>
				</div>

				{#if session.location || session.latitude !== null}
					<div class="flex items-center gap-4 p-4">
						{#if weather}
							<div class="flex flex-col items-center text-brand-text">
								<Icon name={weatherIcon(weather.code)} size={40} />
								<span class="mt-1 text-xs text-muted">{$t(weatherLabelKey(weather.code))}</span>
							</div>
						{/if}
						<div class="flex-1">
							<p class="text-lg font-semibold">
								{session.location ?? $t('session.unknownPlace')}
							</p>
							{#if weather}
								<p class="tabular text-sm text-muted">
									{formatTemperature(weather)} · {formatWind(weather)}
								</p>
							{:else}
								<p class="text-sm text-muted">{$t('session.weatherNone')}</p>
							{/if}
						</div>
					</div>
				{:else}
					<p class="p-4 text-sm text-muted">{$t('session.noConditions')}</p>
				{/if}

				{#if notice}
					<p class="border-t border-line px-4 py-2 text-sm text-danger">{notice}</p>
				{/if}
			</section>

			<button
				class="flex items-center gap-1.5 text-sm text-danger"
				onclick={() => (confirmingDelete = true)}
			>
				<Icon name="trash" size={16} />
				{$t('session.delete')}
			</button>
		{/if}
	</div>

	{#if adding}
		<div class="fixed inset-0 z-50 flex flex-col bg-bg">
			<header
				class="safe-top flex items-center justify-between border-b border-line px-4 py-3 pt-6"
			>
				<h2 class="text-lg font-bold">{$t('session.addActivity')}</h2>
				<button class="text-muted" aria-label={$t('common.close')} onclick={() => (adding = false)}>
					<Icon name="close" size={22} />
				</button>
			</header>

			<div class="mx-auto w-full max-w-2xl flex-1 space-y-4 overflow-y-auto p-4">
				<section class="rounded-xl border border-line bg-surface p-4">
					<div class="grid grid-cols-2 gap-3">
						<WheelPicker
							values={END_COUNTS}
							value={custom.ends}
							label={$t('round.ends')}
							onchange={(v) => (custom.ends = v)}
						/>
						<WheelPicker
							values={ARROWS_PER_END}
							value={custom.arrowsPerEnd}
							label={$t('round.arrowsPerEnd')}
							onchange={(v) => (custom.arrowsPerEnd = v)}
						/>
					</div>

					<div class="mt-3">
						<span class="text-sm text-muted">{$t('round.faceSize')}</span>
						<div class="mt-1 flex gap-2">
							{#each FACE_SIZES as size (size)}
								<button
									class="flex-1 rounded-lg border py-2 text-sm font-medium
										{custom.faceSize === size
										? 'border-brand bg-brand text-brand-ink'
										: 'border-line'}"
									onclick={() => (custom.faceSize = size)}
								>
									{size}
								</button>
							{/each}
						</div>
					</div>

					<div class="mt-3">
						<span class="text-sm text-muted">{$t('round.unit')}</span>
						<div class="mt-1 flex gap-2">
							{#each ['m', 'yd'] as const as unit (unit)}
								<button
									class="flex-1 rounded-lg border py-2 text-sm font-medium
										{custom.unit === unit ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
									onclick={() => {
										custom.unit = unit;
										// Keep the value on the new unit's scale rather than leaving an impossible one.
										const list = unit === 'm' ? DISTANCES_M : DISTANCES_YD;
										if (!list.includes(custom.distance)) custom.distance = list[0];
									}}
								>
									{unit}
								</button>
							{/each}
						</div>
						<div class="mt-2">
							<WheelPicker
								values={distances}
								value={custom.distance}
								label={$t('round.distance')}
								format={(v) => `${v} ${custom.unit}`}
								onchange={(v) => (custom.distance = v)}
							/>
						</div>
					</div>

					<label class="mt-3 block text-sm">
						{$t('round.name')} <span class="text-muted">({$t('common.optional')})</span>
						<input
							class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
							bind:value={custom.name}
						/>
					</label>

					<button
						class="mt-3 w-full rounded-lg bg-brand py-2.5 font-semibold text-brand-ink disabled:opacity-50"
						disabled={customErrors.length > 0}
						onclick={startCustom}
					>
						{$t('round.create')}
					</button>
				</section>

				<section>
					<div class="space-y-2">
						{#each [...ROUNDS, ...UNVERIFIED_ROUNDS] as round (round.id)}
							<button
								class="w-full rounded-xl border border-line bg-surface p-3 text-left"
								onclick={() => startRound(round)}
							>
								<div class="flex items-baseline justify-between gap-2">
									<span class="font-medium">{round.name}</span>
									<span class="text-xs text-muted">
										{roundNeedsVerification(round)
											? $t('round.unverifiedShort')
											: $t('round.max', { n: maxScore(round, getScoreSet(round.scoreSetId)) })}
									</span>
								</div>
								<p class="text-sm text-muted">{summarise(round)}</p>
							</button>
						{/each}
					</div>
				</section>

				<section class="rounded-xl border border-line bg-surface p-4">
					<h3 class="mb-2 font-medium">{$t('tuning.title')}</h3>
					{#if !selectedBowType}
						<p class="text-sm text-muted">{$t('tuning.noBowSelected')}</p>
					{:else}
						<ul class="space-y-1">
							{#each tuningTemplates as template (template.key)}
								<li>
									<button
										class="flex w-full items-center gap-2 rounded-lg border border-line p-2 text-left text-sm"
										onclick={() => startTuning(template.key)}
									>
										<Icon name="wrench" size={16} />
										{template.name}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>
		</div>
	{/if}
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}

{#if confirmingDelete}
	<ConfirmDialog
		title={$t('session.confirmTitle')}
		message={$t('session.confirmBody')}
		onconfirm={remove}
		oncancel={() => (confirmingDelete = false)}
	/>
{/if}
