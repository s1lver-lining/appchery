<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import {
		schemaFor,
		groupsOf,
		diffSettings,
		displaySetting,
		parseSetting,
		formatSetting,
		type BowSettings,
		type SettingField
	} from '$lib/domain/equipment/schemas';
	import { interpolateHeight, formatHeight } from '$lib/domain/equipment/sight';
	import { defaultBowId, dateFormats, sightColumns } from '$lib/prefs';
	import { startOfDay } from '$lib/domain/dates';
	import {
		getBow,
		updateBow,
		deleteBow,
		listRevisions,
		currentRevision,
		createRevision,
		bowUsage,
		listSightMarks,
		createSightMark,
		updateSightMark,
		deleteSightMark,
		listSessions,
		createSession,
		createTuningActivity,
		type BowRow,
		type RevisionRow,
		type BowUsage,
		type SightMarkRow
	} from '$lib/db/repository';
	import { originOf, withOrigin } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import Toggle from '$lib/ui/Toggle.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';

	const bowId = $derived($page.params.id as string);
	/** Opened from the list, from the home page, or straight from the tab bar: back follows the link. */
	const origin = $derived(originOf($page.url, '/equipment'));

	let bow = $state<BowRow | null>(null);
	let revisions = $state<RevisionRow[]>([]);
	let usage = $state<BowUsage | null>(null);
	let tab = $state<'overview' | 'settings' | 'history'>('overview');
	const TABS = $derived([
		{ key: 'overview' as const, label: $t('equipment.overviewTab') },
		{ key: 'settings' as const, label: $t('equipment.settingsTab') },
		{ key: 'history' as const, label: $t('equipment.historyTab') }
	]);
	let draft = $state<BowSettings>({});
	let reason = $state('');
	let saving = $state(false);

	const type = $derived((bow?.type ?? 'recurve') as BowType);
	const fields = $derived(schemaFor(type));
	const groups = $derived(groupsOf(fields));
	const saved = $derived<BowSettings>(
		revisions[0]?.settings ? JSON.parse(revisions[0].settings) : {}
	);
	const pending = $derived(diffSettings(type, saved, draft));
	const isDefault = $derived($defaultBowId === bowId);

	async function refresh() {
		bow = await getBow(bowId);
		revisions = await listRevisions(bowId);
		usage = await bowUsage(bowId);
		marks = await listSightMarks(bowId);
		const latest = await currentRevision(bowId);
		draft = latest ? JSON.parse(latest.settings) : {};
	}
	$effect(() => {
		refresh();
	});

	/** The group whose sheet is open. Values are written to the draft as they are typed and the
	 * sheet has nothing to confirm: leaving it is the save, and the revision is what gets confirmed. */
	let editingGroup = $state<string | null>(null);

	const fieldsOf = $derived((group: string) => fields.filter((field) => field.group === group));

	/** What the row says without opening it: the settings that carry a value, in schema order. */
	const summaryOf = $derived((group: string) => {
		const filled = fieldsOf(group)
			.filter((field) => draft[field.key] !== null && draft[field.key] !== undefined && draft[field.key] !== '')
			.map((field) => `${field.label} ${formatSetting(field, draft[field.key] ?? null)}`);
		return filled.length > 0 ? filled.join(' · ') : $t('equipment.groupEmpty');
	});

	function setValue(field: SettingField, raw: string) {
		draft = { ...draft, [field.key]: parseSetting(field, raw) };
	}

	/** Only settings the archer actually filled in, so the overview stays a summary not a blank form. */
	const filledSettings = $derived(
		fields
			.map((field) => ({ field, value: saved[field.key] ?? null }))
			.filter((row) => row.value !== null && row.value !== '')
	);

	async function save() {
		if (pending.length === 0) return;
		saving = true;
		await createRevision(bowId, draft, reason);
		reason = '';
		await refresh();
		saving = false;
	}

	/**
	 * Sight marks: one row a distance, kept as their own rows rather than as a bow setting, because
	 * a mark list grows a distance at a time and is read at the shooting line, not in a form.
	 */
	let marks = $state<SightMarkRow[]>([]);
	let markUnit = $state<'m' | 'yd'>('m');
	/** Which shortened caption is spelled out, since four across leaves no room to spell them all. */
	let explained = $state<string | null>(null);
	let newDistance = $state<number | string>('');

	/** The extra columns, off until asked for: most archers only ever record a height. */
	const EXTRAS = ['windage', 'clicker', 'plunger'] as const;
	type Extra = (typeof EXTRAS)[number];
	const extraLabel = $derived<Record<Extra, string>>({
		windage: $t('sight.windage'),
		clicker: $t('sight.clicker'),
		plunger: $t('sight.plunger')
	});
	/**
	 * Shown only when asked for. Hiding a column hides it: what was entered stays in the row and
	 * comes back untouched the moment the column is asked for again.
	 */
	const shownExtras = $derived(EXTRAS.filter((key) => $sightColumns.includes(key)));

	function toggleExtra(key: Extra) {
		sightColumns.update((list) =>
			list.includes(key) ? list.filter((item) => item !== key) : [...list, key]
		);
	}

	/** A new distance opens with the mark the proved ones imply, flagged as the guess it is. */
	async function addMark() {
		const distance = Math.round(Number(newDistance));
		if (!Number.isFinite(distance) || distance <= 0) return;
		const guess = interpolateHeight(marks, distance, markUnit);
		await createSightMark({
			bowId,
			distance,
			unit: markUnit,
			height: guess === null ? null : formatHeight(guess),
			interpolated: guess !== null
		});
		newDistance = '';
		await reloadMarks();
	}

	/**
	 * Written on leaving the field rather than on change, because the field is emptied on focus and a
	 * change event cannot tell that apart from an archer clearing a mark they no longer trust.
	 */
	function saveHeight(mark: SightMarkRow, input: HTMLInputElement) {
		const value = input.value.trim();
		if (value === (mark.height ?? '')) return;
		if (!value && mark.interpolated) {
			input.value = mark.height ?? '';
			return;
		}
		setMark(mark.id, { height: value || null });
	}

	/** Typing a height is proving it: the mark stops being a guess the moment it is entered by hand. */
	async function setMark(id: string, patch: Parameters<typeof updateSightMark>[1]) {
		await updateSightMark(id, 'height' in patch ? { ...patch, interpolated: 0 } : patch);
		await reloadMarks();
	}

	async function removeMark(id: string) {
		await deleteSightMark(id);
		await reloadMarks();
	}

	/**
	 * Every guess is worked out again whenever the proved marks change, so a mark added today moves
	 * the distances that were only ever estimated from the ones around them.
	 */
	async function reloadMarks() {
		const rows = await listSightMarks(bowId);
		for (const mark of rows.filter((row) => row.interpolated)) {
			const guess = interpolateHeight(rows, mark.distance, mark.unit);
			const height = guess === null ? null : formatHeight(guess);
			if (height !== mark.height) await updateSightMark(mark.id, { height });
		}
		marks = await listSightMarks(bowId);
	}

	async function startTuning(templateKey: string) {
		const sessions = await listSessions();
		// Tuning joins today's session for this bow when there is one, rather than opening a new outing.
		const today = startOfDay(Date.now());
		const open = sessions.find((s) => s.bowId === bowId && startOfDay(s.startedAt) === today);
		const sessionId = open?.id ?? (await createSession({ bowId, label: bow?.name }));
		goto(`/activities/${await createTuningActivity(sessionId, templateKey)}`);
	}

	async function rename(value: string) {
		const trimmed = value.trim();
		if (!trimmed || !bow) return;
		await updateBow(bowId, { name: trimmed });
		await refresh();
	}

	async function remove() {
		if (isDefault) defaultBowId.set(null);
		await deleteBow(bowId);
		goto('/equipment');
	}
</script>

<!-- A press anywhere else puts a spelled out caption away, the way a tooltip goes. -->
<svelte:window onpointerdown={() => (explained = null)} />

{#if bow}
	<PageHeader motif="bow">
		{#snippet lead()}
			{@const named = bow}
			<!-- Arrow and name on one line, as on the session page: the name is the page, not a field. -->
			<div class="flex items-center gap-2">
				<a href={origin} class="-ml-1 shrink-0 text-muted" aria-label={$t('common.back')}>
					<Icon name="back" size={22} />
				</a>
				<input
					class="min-w-0 flex-1 border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-ink outline-none"
					value={named?.name ?? ''}
					onchange={(e) => rename(e.currentTarget.value)}
				/>
			</div>
			<p class="text-sm text-muted">
				{$t(`bow.${named?.type}`)}
				{#if isDefault}· <span class="text-brand-text">{$t('equipment.default')}</span>{/if}
			</p>
		{/snippet}

		{#snippet actions()}
			<MoreMenu
				label={$t('common.more')}
				icon="dots"
				placement="down"
				wrapperClass=""
				triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
				items={[
					{ label: $t('equipment.viewList'), icon: 'bow', onselect: () => goto('/equipment') },
					{
							label: $t('tuning.guideTitle'),
							icon: 'wrench',
							onselect: () => goto(withOrigin('/tuning', `/equipment/${bowId}`))
						},
					{
							label: $t('help.title'),
							icon: 'help',
							onselect: () => goto(withOrigin('/help/equipment', `/equipment/${bowId}`))
						}
				]}
			/>
		{/snippet}
	</PageHeader>

	<div class="mx-auto w-full max-w-2xl space-y-4 p-4">

		<TabDeck tabs={TABS} bind:value={tab} paneClass="space-y-4">
			{#snippet pane(key)}
				{#if key === 'overview'}
					{#if usage}
				<!-- Four across, so the captions are shortened rather than allowed to wrap under them,
						and a tap spells the whole word out in a bubble, leaning back into the page at the
						ends of the row rather than hanging off it. -->
					<section class="grid grid-cols-4 gap-2">
						{#each [{ value: usage.arrowsShot, label: $t('equipment.arrowsShotShort'), full: $t('equipment.arrowsShot') }, { value: usage.sessions, label: $t('equipment.sessionsCount'), full: $t('equipment.sessionsCount') }, { value: usage.activities, label: $t('equipment.activitiesCount'), full: $t('equipment.activitiesCount') }, { value: usage.bestScore ?? '—', label: $t('stats.personalBestShort'), full: $t('stats.personalBest') }] as stat, i (stat.label)}
							<button
								class="relative rounded-xl border bg-surface p-2.5 text-left
									{explained === stat.full ? 'border-brand' : 'border-line'}"
								title={stat.full}
								onpointerdown={(event) => {
									// Ahead of the window handler that closes it, or it would never open.
									event.stopPropagation();
									explained = explained === stat.full ? null : stat.full;
								}}
							>
								<p class="tabular text-lg leading-none font-bold">{stat.value}</p>
								<p
									class="mt-1 truncate text-[10px] leading-tight whitespace-nowrap text-muted first-letter:uppercase"
								>
									{stat.label}
								</p>

								{#if explained === stat.full}
									<span
										class="absolute top-full z-10 mt-1.5 rounded-lg bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-bg shadow-lg
											{i === 0 ? 'left-0' : i === 3 ? 'right-0' : 'left-1/2 -translate-x-1/2'}"
									>
										{stat.full}
									</span>
								{/if}
							</button>
						{/each}
					</section>

					<!-- The one page an archer opens on the shooting line, so it is a list, not a form. -->
					<section class="overflow-hidden rounded-xl border border-line bg-surface">
						<div class="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
							<h2 class="text-sm font-semibold">{$t('sight.title')}</h2>
							<!-- Unit belongs to the mark being added: an archer shooting both keeps both. -->
							<div class="flex gap-1 rounded-lg bg-sunk p-0.5">
								{#each ['m', 'yd'] as const as unit (unit)}
									<button
										class="rounded-md px-2 py-1 text-xs font-medium
											{markUnit === unit ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
										onclick={() => (markUnit = unit)}
									>
										{unit}
									</button>
								{/each}
							</div>
						</div>

						{#if marks.length === 0}
							<p class="px-4 pt-3 text-sm text-muted">{$t('sight.empty')}</p>
						{:else}
							<ul class="divide-y divide-line">
								{#each marks as mark (mark.id)}
									<li class="flex items-center gap-2 px-4 py-2">
										<span
											class="tabular w-14 shrink-0 text-sm font-semibold"
										>
											{mark.distance}<span class="text-xs font-normal text-muted">{mark.unit}</span>
										</span>
										<!-- A worked out mark is drawn as what it is: dashed, quieter, and led by a tilde.
										Typing over it proves it, and the styling goes with the guess. -->
										<span class="relative min-w-0 flex-1">
											{#if mark.interpolated}
												<span
													class="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-brand-text"
													aria-hidden="true"
												>
													~
												</span>
											{/if}
											<input
												class="tabular w-full rounded-lg border bg-bg py-1.5 text-sm
													{mark.interpolated
													? 'border-dashed border-brand/50 pr-2 pl-5 text-muted italic'
													: 'border-line px-2 text-ink'}"
												inputmode="decimal"
												aria-label={mark.interpolated
													? $t('sight.interpolatedHeight')
													: $t('sight.height')}
												placeholder={$t('sight.height')}
												value={mark.height ?? ''}
												onfocus={(e) => {
													// A guess gets out of the way of the mark being typed over it, and comes
													// back untouched if the archer walks away without entering one.
													if (mark.interpolated) e.currentTarget.value = '';
												}}
												onblur={(e) => saveHeight(mark, e.currentTarget)}
												onkeydown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
											/>
										</span>
										{#each shownExtras as key (key)}
											<input
												class="min-w-0 flex-1 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink"
												aria-label={extraLabel[key]}
												placeholder={extraLabel[key]}
												value={mark[key] ?? ''}
												onchange={(e) =>
													setMark(mark.id, { [key]: e.currentTarget.value.trim() || null })}
											/>
										{/each}
										<button
											class="shrink-0 rounded-lg p-1 text-muted"
											aria-label={$t('common.delete')}
											onclick={() => removeMark(mark.id)}
										>
											<Icon name="close" size={16} />
										</button>
									</li>
								{/each}
							</ul>
						{/if}

						<div class="flex items-center gap-2 border-t border-line px-4 py-2.5">
							<input
								type="number"
								inputmode="numeric"
								min="1"
								class="tabular w-20 rounded-lg border border-line bg-bg px-2 py-1.5 text-sm text-ink"
								placeholder={$t('sight.distance')}
								aria-label={$t('sight.distance')}
								bind:value={newDistance}
								onkeydown={(e) => e.key === 'Enter' && addMark()}
							/>
							<button
								class="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
								onclick={addMark}
							>
								<Icon name="plus" size={16} />
								{$t('sight.addMark')}
							</button>
						</div>

						{#if marks.some((mark) => mark.interpolated)}
							<!-- Said once, at the foot of the list, rather than on every row it applies to. -->
							<p class="border-t border-line px-4 py-2 text-xs text-muted">
								<span class="text-brand-text">~</span>
								{$t('sight.interpolatedHint')}
							</p>
						{/if}

						<!-- The extra columns live behind chips: they are the exception, not the shape. -->
						<div class="flex flex-wrap gap-1.5 border-t border-line px-4 py-2.5">
							{#each EXTRAS as key (key)}
								<button
									class="rounded-full border px-2.5 py-1 text-xs font-medium
										{shownExtras.includes(key) ? 'border-brand text-brand-text' : 'border-line text-muted'}"
									aria-pressed={shownExtras.includes(key)}
									onclick={() => toggleExtra(key)}
								>
									{extraLabel[key]}
								</button>
							{/each}
						</div>
					</section>

					{#if usage.lastUsedAt}
							<p class="text-sm text-muted">
								{$t('equipment.lastUsed', {
									date: $dateFormats.date(usage.lastUsedAt)
								})}
							</p>
						{/if}
					{/if}

					<section class="rounded-xl border border-line bg-surface p-4">
						<h2 class="mb-2 text-sm font-semibold">{$t('equipment.currentSetup')}</h2>
						{#if filledSettings.length === 0}
							<p class="text-sm text-muted">{$t('equipment.noRevisions')}</p>
						{:else}
							<dl class="space-y-1 text-sm">
								{#each filledSettings as row (row.field.key)}
									<div class="flex justify-between gap-2">
										<dt class="text-muted">{row.field.label}</dt>
										<dd class="font-medium">{formatSetting(row.field, row.value)}</dd>
									</div>
								{/each}
							</dl>
							<p class="mt-2 text-xs text-muted">
								{$t('equipment.revision', { n: revisions[0].revisionNo })}
							</p>
						{/if}
					</section>

					<section class="rounded-xl border border-line bg-surface p-4">
						<h2 class="mb-1 text-sm font-semibold">{$t('equipment.tuningSteps')}</h2>
						<p class="mb-2 text-sm text-muted">{$t('tuning.forBow', { bow: bow?.name ?? '' })}</p>
						<ul class="space-y-1">
							{#each templatesForBowType(type) as template (template.key)}
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
					</section>
				{:else if key === 'settings'}
					<section class="rounded-xl border border-line bg-surface p-4">
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<p class="font-medium">{$t('equipment.defaultTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('equipment.defaultHint')}</p>
							</div>
							<Toggle
								checked={isDefault}
								label={$t('equipment.defaultTitle')}
								onchange={(v) => defaultBowId.set(v ? bowId : null)}
							/>
						</div>
					</section>

					<!--
						A list rather than a page of inputs: what a bow is set to is read far more often than
						it is changed, so the page says what it is and a tap opens the one group being changed.
					-->
					<section class="overflow-hidden rounded-xl border border-line bg-surface">
						{#each groups as group, i (group)}
							<button
								class="flex w-full items-center gap-3 p-4 text-left {i > 0
									? 'border-t border-line'
									: ''}"
								onclick={() => (editingGroup = group)}
							>
								<div class="min-w-0 flex-1">
									<p class="font-medium">{group}</p>
									<p class="mt-0.5 truncate text-sm text-muted">{summaryOf(group)}</p>
								</div>
								<span class="shrink-0 rotate-180 text-muted"><Icon name="back" size={18} /></span>
							</button>
						{/each}
					</section>

					<!-- Anything the schema has no field for: a shim thickness, a serial, a note to self. -->
					<section class="rounded-xl border border-line bg-surface p-4">
						<h2 class="mb-2 text-sm font-semibold">{$t('equipment.remarks')}</h2>
						<textarea
							class="min-h-24 w-full resize-y rounded-lg border border-line bg-bg p-2 text-sm text-ink"
							placeholder={$t('equipment.remarksHint')}
							value={bow?.notes ?? ''}
							onchange={(e) => updateBow(bowId, { notes: e.currentTarget.value.trim() || null })}
						></textarea>
					</section>

					<section class="rounded-xl border border-line bg-surface p-4">
						{#if pending.length === 0}
							<p class="text-sm text-muted">{$t('equipment.noChanges')}</p>
						{:else}
							<h2 class="mb-2 text-sm font-semibold">
								{$t('equipment.pendingChanges', { n: pending.length })}
							</h2>
							<ul class="mb-3 space-y-1 text-sm">
								{#each pending as change (change.field.key)}
									<li class="flex justify-between gap-2">
										<span class="text-muted">{change.field.label}</span>
										<span>
											{formatSetting(change.field, change.before)} → <strong
												>{formatSetting(change.field, change.after)}</strong
											>
										</span>
									</li>
								{/each}
							</ul>
							<input
								class="mb-2 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								placeholder={$t('equipment.reason')}
								bind:value={reason}
							/>
							<button
								class="w-full rounded-lg bg-brand py-2 font-semibold text-brand-ink disabled:opacity-50"
								disabled={saving}
								onclick={save}
							>
								{$t('equipment.saveRevision')}
							</button>
						{/if}
					</section>

					<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
						<Icon name="trash" size={16} />
						{$t('equipment.deleteBow')}
					</button>
				{:else if revisions.length === 0}
					<p class="rounded-xl border border-dashed border-line p-6 text-center text-muted">
						{$t('equipment.noRevisions')}
					</p>
				{:else}
					<ul class="space-y-2">
						{#each revisions as revision, i (revision.id)}
							{@const previous = revisions[i + 1]}
							{@const changes = previous
								? diffSettings(type, JSON.parse(previous.settings), JSON.parse(revision.settings))
								: []}
							<li class="rounded-xl border border-line bg-surface p-3">
								<div class="flex items-baseline justify-between">
									<p class="font-semibold">{$t('equipment.revision', { n: revision.revisionNo })}</p>
									<p class="text-xs text-muted">
										{$dateFormats.date(revision.effectiveFrom)}
									</p>
								</div>
								{#if revision.reason}
									<p class="mt-1 text-sm italic text-muted">{revision.reason}</p>
								{/if}
								{#if changes.length > 0}
									<ul class="mt-2 space-y-0.5 text-sm">
										{#each changes as change (change.field.key)}
											<li class="flex justify-between gap-2">
												<span class="text-muted">{change.field.label}</span>
												<span>
													{formatSetting(change.field, change.before)} → <strong
														>{formatSetting(change.field, change.after)}</strong
													>
												</span>
											</li>
										{/each}
									</ul>
								{:else if !previous}
									<p class="mt-1 text-sm text-muted">{$t('equipment.initialRevision')}</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			{/snippet}
		</TabDeck>
	</div>
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}

{#if editingGroup}
	<!-- One group at a time. Typing writes to the draft, so closing the sheet is the save; what turns
		a draft into history is the revision below it, which is the thing worth confirming. -->
	<div class="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
		<button
			class="absolute inset-0 bg-black/40"
			aria-label={$t('common.close')}
			onclick={() => (editingGroup = null)}
		></button>

		<div
			class="relative m-4 max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-2xl border border-line bg-surface p-4 shadow-xl"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-lg font-bold">{editingGroup}</h2>
				<button
					class="text-muted"
					aria-label={$t('common.close')}
					onclick={() => (editingGroup = null)}
				>
					<Icon name="close" size={20} />
				</button>
			</div>

			<div class="space-y-3">
				{#each fieldsOf(editingGroup) as field (field.key)}
					<label class="block text-sm">
						{field.label}
						{#if field.unit}<span class="text-muted">({field.unit})</span>{/if}
						{#if field.kind === 'select'}
							<select
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								value={displaySetting(field, draft[field.key] ?? null)}
								oninput={(e) => setValue(field, e.currentTarget.value)}
							>
								<option value=""></option>
								{#each field.options ?? [] as option (option)}
									<option value={option}>{option}</option>
								{/each}
							</select>
						{:else}
							<input
								type={field.kind === 'text' ? 'text' : 'number'}
								step={field.kind === 'text' ? undefined : '0.05'}
								inputmode={field.kind === 'text' ? undefined : 'decimal'}
								class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
								value={displaySetting(field, draft[field.key] ?? null)}
								oninput={(e) => setValue(field, e.currentTarget.value)}
							/>
						{/if}
					</label>
				{/each}
			</div>

			<button
				class="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-brand-ink"
				onclick={() => (editingGroup = null)}
			>
				{$t('common.done')}
			</button>
		</div>
	</div>
{/if}

