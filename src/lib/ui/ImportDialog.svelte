<script lang="ts">
	import { t } from '$lib/i18n';
	import { readWorkbook, WorkbookError } from '$lib/import/xlsx';
	import { planCapTargetImport, type CapTargetPlan } from '$lib/import/captarget';
	import { importPlan, listBows, recalculateBadges, type BowRow } from '$lib/db/repository';
	import { dataChanged } from '$lib/db/changed';
	import { portal } from './portal';
	import { scrim } from './statusBar';
	import { lockScroll } from './scrollLock';
	import { closeOnBack } from './dismiss.svelte';
	import Icon from './Icon.svelte';

	// One dialog wherever a file arrives from, so opening an export and picking one in the settings
	// ask the same questions and report the same result.
	let { file, onclose }: { file: File; onclose: () => void } = $props();

	type Stage = 'reading' | 'confirm' | 'writing' | 'done' | 'failed';

	let stage = $state<Stage>('reading');
	let plan = $state<CapTargetPlan | null>(null);
	let error = $state<string | null>(null);
	let result = $state<string | null>(null);
	let progress = $state({ done: 0, total: 0 });
	let bows = $state<BowRow[]>([]);
	// The export names no bow, and guessing one attributes scores to equipment that never shot them.
	let bowId = $state('');

	// Only while there is something to leave: a half written database has nothing safe to cancel to.
	closeOnBack(
		() => stage === 'confirm' || stage === 'done' || stage === 'failed',
		() => onclose()
	);

	$effect(() => {
		listBows().then((rows) => (bows = rows.filter((bow) => bow.isActive)));
	});

	$effect(() => {
		read(file);
	});

	async function read(source: File) {
		stage = 'reading';
		try {
			const parsed = planCapTargetImport(await readWorkbook(await source.arrayBuffer()));
			if (parsed.summary.sessions === 0) {
				error = $t('importer.error.nothingFound');
				stage = 'failed';
				return;
			}
			plan = parsed;
			stage = 'confirm';
		} catch (e) {
			error = e instanceof WorkbookError ? $t(`importer.error.${e.message}`) : String(e);
			stage = 'failed';
		}
	}

	/** Rows the file carries but nothing can be made of, said out loud rather than quietly dropped. */
	const skipped = $derived(
		(plan?.warnings ?? [])
			.filter((w) => w.code === 'undatedRow' || w.code === 'unreadableRow')
			.reduce((sum, w) => sum + w.count, 0)
	);

	async function run() {
		if (!plan) return;
		stage = 'writing';
		progress = { done: 0, total: plan.sessions.length };
		try {
			const report = await importPlan(plan, {
				bowId: bowId || null,
				onProgress: (done, total) => (progress = { done, total })
			});
			// Years of shooting arriving at once earns whatever it earns, so the badges are rechecked.
			await recalculateBadges();
			dataChanged();
			result = $t('importer.imported', { sessions: report.sessions, arrows: report.arrows });
			stage = 'done';
		} catch (e) {
			error = String(e);
			stage = 'failed';
		}
	}

	const fraction = $derived(progress.total === 0 ? 0 : (progress.done / progress.total) * 0.9);
</script>

<div
	class="fixed inset-0 z-[60] flex items-center justify-center p-4"
	use:portal
	use:lockScroll
	role="alertdialog"
	aria-label={$t('importer.title')}
>
	<div class="absolute inset-0 bg-black/50" use:scrim={0.5}></div>

	<div class="relative w-full max-w-xs rounded-2xl border border-line bg-surface p-4 shadow-xl">
		{#if stage === 'reading'}
			<p class="font-semibold">{$t('importer.reading')}</p>
			<p class="mt-1 truncate text-sm text-muted">{file.name}</p>
		{:else if stage === 'confirm' && plan}
			<h2 class="text-base font-bold">{$t('importer.confirmTitle')}</h2>
			<p class="mt-1 text-sm text-muted">
				{$t('importer.confirmBody', {
					name: file.name,
					sessions: plan.summary.sessions,
					rounds: plan.summary.rounds,
					arrows: plan.summary.arrows
				})}
			</p>
			{#if skipped > 0}
				<p class="mt-1 text-sm text-muted">{$t('importer.skipped', { n: skipped })}</p>
			{/if}

			{#if bows.length > 0}
				<label class="mt-3 block text-sm">
					<span class="text-muted">{$t('importer.bow')}</span>
					<select
						class="mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink"
						bind:value={bowId}
					>
						<option value="">{$t('importer.noBow')}</option>
						{#each bows as bow (bow.id)}
							<option value={bow.id}>{bow.name}</option>
						{/each}
					</select>
				</label>
			{/if}

			<div class="mt-4 flex gap-2">
				<button class="flex-1 rounded-lg border border-line py-2 text-sm font-medium" onclick={onclose}>
					{$t('common.cancel')}
				</button>
				<button
					class="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
					onclick={run}
				>
					{$t('importer.confirmAction')}
				</button>
			</div>
		{:else if stage === 'writing'}
			<p class="font-semibold">{$t('importer.working')}</p>
			<p class="mt-1 text-sm text-muted">
				{progress.done < progress.total
					? $t('importer.progress', { done: progress.done, total: progress.total })
					: $t('importer.workingHint')}
			</p>
			<div
				class="mt-3 h-2 overflow-hidden rounded-full bg-sunk"
				role="progressbar"
				aria-valuemin={0}
				aria-valuemax={100}
				aria-valuenow={Math.round(fraction * 100)}
			>
				<div
					class="h-full rounded-full bg-brand transition-[width] duration-200"
					style="width: {Math.round(fraction * 100)}%"
				></div>
			</div>
		{:else}
			<p class="flex items-center gap-1.5 font-semibold {stage === 'failed' ? 'text-danger' : ''}">
				{#if stage === 'done'}<Icon name="target" size={16} />{/if}
				{stage === 'done' ? $t('importer.doneTitle') : $t('importer.failedTitle')}
			</p>
			<p class="mt-1 text-sm text-muted">{stage === 'done' ? result : error}</p>
			<button
				class="mt-4 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink"
				onclick={onclose}
			>
				{$t('common.close')}
			</button>
		{/if}
	</div>
</div>
