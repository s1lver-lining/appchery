<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import { templatesForBowType, type BowType } from '$lib/domain/tuning/templates';
	import {
		schemaFor,
		groupsOf,
		diffSettings,
		type BowSettings,
		type SettingField
	} from '$lib/domain/equipment/schemas';
	import { mmToInches, inchesToMm } from '$lib/domain/units';
	import {
		getBow,
		updateBow,
		deleteBow,
		listRevisions,
		currentRevision,
		createRevision,
		listSessions,
		createSession,
		createTuningActivity,
		type BowRow,
		type RevisionRow
	} from '$lib/db/repository';
	import Icon from '$lib/ui/Icon.svelte';

	const bowId = $derived($page.params.id as string);

	let bow = $state<BowRow | null>(null);
	let revisions = $state<RevisionRow[]>([]);
	let tab = $state<'settings' | 'tuning' | 'history'>('settings');
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

	async function refresh() {
		bow = await getBow(bowId);
		revisions = await listRevisions(bowId);
		const latest = await currentRevision(bowId);
		draft = latest ? JSON.parse(latest.settings) : {};
	}
	$effect(() => {
		refresh();
	});

	/** Length fields store mm and are entered in inches, so the input never sees the stored unit. */
	function displayValue(field: SettingField): string {
		const value = draft[field.key];
		if (value === null || value === undefined || value === '') return '';
		if (field.kind === 'lengthMm') return String(Math.round(mmToInches(Number(value)) * 100) / 100);
		return String(value);
	}

	function setValue(field: SettingField, raw: string) {
		if (raw === '') {
			draft = { ...draft, [field.key]: null };
			return;
		}
		if (field.kind === 'lengthMm') {
			draft = { ...draft, [field.key]: Math.round(inchesToMm(Number(raw)) * 10) / 10 };
		} else if (field.kind === 'number') {
			draft = { ...draft, [field.key]: Number(raw) };
		} else {
			draft = { ...draft, [field.key]: raw };
		}
	}

	function formatStored(field: SettingField, value: string | number | null): string {
		if (value === null || value === '') return '—';
		if (field.kind === 'lengthMm') return `${Math.round(mmToInches(Number(value)) * 100) / 100}"`;
		return field.unit ? `${value} ${field.unit}` : String(value);
	}

	async function save() {
		if (pending.length === 0) return;
		saving = true;
		await createRevision(bowId, draft, reason);
		reason = '';
		await refresh();
		saving = false;
	}

	async function pickPhoto(event: Event) {
		const file = (event.target as HTMLInputElement).files?.[0];
		if (!file) return;
		// Downscaled to a data URL so the photo stays on device and does not bloat the database.
		const bitmap = await createImageBitmap(file);
		const size = 480;
		const scale = Math.min(size / bitmap.width, size / bitmap.height, 1);
		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);
		canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		await updateBow(bowId, { photo: canvas.toDataURL('image/jpeg', 0.8) });
		await refresh();
	}

	async function startTuning(templateKey: string) {
		const sessions = await listSessions();
		const open = sessions.find((s) => s.endedAt === null && s.bowId === bowId);
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
		await deleteBow(bowId);
		goto('/equipment');
	}
</script>

{#if bow}
	<div class="safe-top mx-auto w-full max-w-2xl space-y-4 p-4">
		<header class="flex items-start gap-3">
			<div class="flex-1">
				<a href="/equipment" class="text-sm text-muted">‹ {$t('common.back')}</a>
				<input
					class="w-full border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-ink outline-none"
					value={bow.name}
					onchange={(e) => rename(e.currentTarget.value)}
				/>
				<p class="text-sm text-muted">{$t(`bow.${bow.type}`)}</p>
			</div>
			<label class="cursor-pointer">
				{#if bow.photo}
					<img src={bow.photo} alt="" class="h-20 w-20 rounded-lg object-cover" />
				{:else}
					<span class="flex h-20 w-20 items-center justify-center rounded-lg bg-sunk text-muted">
						<Icon name="camera" size={24} />
					</span>
				{/if}
				<input type="file" accept="image/*" class="hidden" onchange={pickPhoto} />
			</label>
		</header>

		<nav class="flex gap-1 rounded-lg bg-sunk p-1">
			{#each [{ key: 'settings', label: $t('equipment.settingsTab') }, { key: 'tuning', label: $t('equipment.tuningSteps') }, { key: 'history', label: $t('equipment.historyTab') }] as item (item.key)}
				<button
					class="flex-1 rounded-md py-1.5 text-sm font-medium
						{tab === item.key ? 'bg-surface text-ink shadow-sm' : 'text-muted'}"
					onclick={() => (tab = item.key as typeof tab)}
				>
					{item.label}
				</button>
			{/each}
		</nav>

		{#if tab === 'settings'}
			{#each groups as group (group)}
				<section class="rounded-xl border border-line bg-surface p-4">
					<h2 class="mb-3 text-sm font-semibold text-muted">{group}</h2>
					<div class="grid gap-3 sm:grid-cols-2">
						{#each fields.filter((f) => f.group === group) as field (field.key)}
							<label class="text-sm">
								{field.label}
								{#if field.unit}<span class="text-muted">({field.unit})</span>{/if}
								{#if field.kind === 'select'}
									<select
										class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
										value={displayValue(field)}
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
										step={field.kind === 'lengthMm' ? '0.05' : 'any'}
										class="mt-1 w-full rounded-lg border border-line bg-bg p-2 text-ink"
										value={displayValue(field)}
										oninput={(e) => setValue(field, e.currentTarget.value)}
									/>
								{/if}
							</label>
						{/each}
					</div>
				</section>
			{/each}

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
									{formatStored(change.field, change.before)} → <strong
										>{formatStored(change.field, change.after)}</strong
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
		{:else if tab === 'tuning'}
			<section class="rounded-xl border border-line bg-surface p-4">
				<p class="mb-2 text-sm text-muted">{$t('tuning.forBow', { bow: bow.name })}</p>
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
		{:else}
			{#if revisions.length === 0}
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
								<p class="font-semibold">
									{$t('equipment.revision', { n: revision.revisionNo })}
								</p>
								<p class="text-xs text-muted">
									{new Date(revision.effectiveFrom).toLocaleDateString()}
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
												{formatStored(change.field, change.before)} → <strong
													>{formatStored(change.field, change.after)}</strong
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

			<button class="flex items-center gap-1.5 text-sm text-danger" onclick={remove}>
				<Icon name="trash" size={16} />
				{$t('equipment.deleteBow')}
			</button>
		{/if}
	</div>
{:else}
	<p class="p-8 text-center text-muted">{$t('common.loading')}</p>
{/if}
