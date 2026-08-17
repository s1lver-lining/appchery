<script lang="ts">
	import { t, locale, LOCALES, LOCALE_NAMES } from '$lib/i18n';
	import { theme, THEMES } from '$lib/theme';
	import { dbInfo } from '$lib/db';
	import {
		autoLocation,
		autoWeather,
		autoPlaceName,
		requestPosition,
		LocationDeniedError
	} from '$lib/conditions';
	import {
		use24Hour,
		recordCameraVideo,
		arrowDetector,
		plotTapMs,
		haptics,
		arrowDriftWarning,
		fullNewSessionButton,
		competitionColour,
		COMPETITION_COLOURS,
		noAnimations,
		celebratedLevel,
		celebratedBests,
		dismissedBest
	} from '$lib/prefs';
	import { recalculateBadges, deleteImportedSessions, deleteEverything } from '$lib/db/repository';
	import ImportDialog from '$lib/ui/ImportDialog.svelte';
	import { dataChanged } from '$lib/db/changed';
	import {
		exportBackup,
		importBackup,
		parseBackup,
		backupFilename,
		BackupError
	} from '$lib/db/backup';
	import Toggle from '$lib/ui/Toggle.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import TabDeck from '$lib/ui/TabDeck.svelte';
	import { saveFile, recordingsPath } from '$lib/files';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Icon from '$lib/ui/Icon.svelte';
	import AppGrid from '$lib/ui/AppGrid.svelte';
	import {
		fullscreenSupported,
		isFullscreen,
		setFullscreen,
		onFullscreenChange
	} from '$lib/fullscreen';
	import { installable, promptInstall } from '$lib/install';
	import { refreshApp } from '$lib/update';
	import { appVersion, appBuild } from '$lib/build';
	import AccountCard from '$lib/ui/AccountCard.svelte';
	import { account } from '$lib/sync/auth';

	/** Named rather than read from package.json, which no bundle ships. */
	const LICENCE = 'AGPL-3.0-only';

	const info = dbInfo();

	// The browser owns this, so the switch follows it: leaving fullscreen by the system gesture or
	// the back key has to move the toggle too, or it starts lying.
	const canFullscreen = fullscreenSupported();
	let fullscreen = $state(false);
	/** Said only after a refresh was asked for and there was no network to serve it. */
	let refreshFailed = $state(false);
	$effect(() => {
		fullscreen = isFullscreen();
		return onFullscreenChange(() => (fullscreen = isFullscreen()));
	});
	/**
	 * Three tabs, split by what a setting is about rather than by how often it is touched: how the
	 * app looks, what it records while shooting, and what happens to the data afterwards.
	 */
	let tab = $state<'app' | 'shooting' | 'data'>('app');
	const TABS = $derived([
		{ key: 'app' as const, label: $t('settings.appTab') },
		{ key: 'shooting' as const, label: $t('settings.shootingTab') },
		{ key: 'data' as const, label: $t('settings.dataTab') }
	]);
	let error = $state<string | null>(null);
	let backupNotice = $state<string | null>(null);
	let backupError = $state<string | null>(null);
	let busy = $state(false);
	let fileInput = $state<HTMLInputElement | null>(null);
	/** Held aside until the archer confirms, because restoring replaces everything already stored. */
	let pendingFile = $state<File | null>(null);
	let importInput = $state<HTMLInputElement | null>(null);
	/** The file being imported, which the dialog reads, asks about and writes on its own. */
	let importFile = $state<File | null>(null);

	/**
	 * Permission is requested the moment the archer opts in, not silently at session start, and a
	 * refusal leaves the setting off rather than enabled but quietly broken.
	 */
	async function toggleLocation(enabled: boolean) {
		error = null;
		if (!enabled) {
			autoLocation.set(false);
			// Both are derived from coordinates, so neither can outlive location being switched off.
			autoWeather.set(false);
			autoPlaceName.set(false);
			return;
		}
		try {
			await requestPosition();
			autoLocation.set(true);
		} catch (e) {
			autoLocation.set(false);
			error = e instanceof LocationDeniedError ? $t('session.locationDenied') : String(e);
		}
	}

	let badgeNotice = $state<string | null>(null);

	/** Kept behind a button rather than run on load: it is the one thing that can take a badge away. */
	async function recheckBadges() {
		busy = true;
		badgeNotice = null;
		const { awarded, revoked } = await recalculateBadges();
		badgeNotice = $t('settings.recalcResult', { awarded: awarded.length, revoked: revoked.length });
		busy = false;
	}

	let celebrationNotice = $state<string | null>(null);

	/**
	 * Every memory of a celebration already given, cleared at once. The badges are deliberately not
	 * here: one revoked by the recheck is announced again the moment it is re-earned, so they need no
	 * forgetting of their own.
	 */
	function forgetCelebrations() {
		// One, not nothing: nothing means the app has never looked, which announces no level at all.
		celebratedLevel.set(1);
		celebratedBests.set([]);
		dismissedBest.set(null);
		celebrationNotice = $t('settings.forgetResult');
	}

	async function exportToFile() {
		busy = true;
		backupError = null;
		backupNotice = null;
		try {
			const backup = await exportBackup();
			const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
			await saveFile(blob, backupFilename(backup.exportedAt), $t('backup.title'));
			const rows = Object.values(backup.tables).reduce((sum, list) => sum + list.length, 0);
			backupNotice = $t('backup.exported', { n: rows });
		} catch (e) {
			backupError = String(e);
		}
		busy = false;
	}

	function chooseFile(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		pendingFile = input.files?.[0] ?? null;
		// Cleared so choosing the same file twice still fires a change event.
		input.value = '';
	}

	function chooseImport(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		importFile = input.files?.[0] ?? null;
		// Cleared so choosing the same file twice still fires a change event.
		input.value = '';
	}

	let dangerDialog = $state<'imported' | 'everything' | null>(null);
	let dangerNotice = $state<string | null>(null);

	async function runDanger() {
		const mode = dangerDialog;
		dangerDialog = null;
		if (!mode) return;
		busy = true;
		try {
			if (mode === 'imported') {
				const removed = await deleteImportedSessions();
				dangerNotice = $t('danger.importedRemoved', { n: removed });
			} else if ($account) {
				// Erasing the device and closing the account are separate acts, and neither implies the
				// other: an archer freeing up a phone is not asking to lose their history, see doc/sync.md.
				dangerNotice = $t('account.wipeSignedIn');
			} else {
				await deleteEverything();
				dangerNotice = $t('danger.everythingRemoved');
			}
			dataChanged();
		} catch (e) {
			dangerNotice = String(e);
		} finally {
			busy = false;
		}
	}

	async function restore() {
		const file = pendingFile;
		pendingFile = null;
		if (!file) return;

		busy = true;
		backupError = null;
		backupNotice = null;
		try {
			const report = await importBackup(parseBackup(await file.text()));
			dataChanged();
			backupNotice = $t('backup.imported', { n: report.rows });
		} catch (e) {
			backupError =
				e instanceof BackupError ? $t(`backup.error.${e.message}`) : String(e);
		}
		busy = false;
	}
</script>

<PageHeader motif="settings" title={$t('settings.title')} />

<div class="mx-auto w-full max-w-2xl p-4">
	<TabDeck tabs={TABS} bind:value={tab} paneClass="space-y-6 pt-4" swipeable={false}>
		{#snippet pane(key)}
			{#if key === 'app'}
				<AppGrid from="/settings" />

				<!-- What this build is, for a bug report: the release, the commit count behind it, and
					the licence the whole thing is under. -->
				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.about')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4 text-center">
						<p class="font-semibold">{$t('app.name')}</p>
						<p class="mt-0.5 text-xs text-muted">{$t('app.tagline')}</p>
						<p class="tabular mt-2 text-xs text-muted">
							{$t('settings.version', { version: appVersion })}
							{#if appBuild}· {$t('settings.build', { n: appBuild })}{/if}
						</p>
						<p class="mt-0.5 text-xs text-muted">{$t('settings.licence', { name: LICENCE })}</p>
					</div>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.language')}</h2>
					<div class="flex gap-2">
						{#each LOCALES as code (code)}
							<button
								class="rounded-lg border px-4 py-2 text-sm
									{$locale === code ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
								onclick={() => locale.set(code)}
							>
								{LOCALE_NAMES[code]}
							</button>
						{/each}
					</div>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.theme')}</h2>
					<div class="flex gap-2">
						{#each THEMES as option (option)}
							<button
								class="rounded-lg border px-4 py-2 text-sm
									{$theme === option ? 'border-brand bg-brand text-brand-ink' : 'border-line'}"
								onclick={() => theme.set(option)}
							>
								{$t(
									option === 'light'
										? 'settings.themeLight'
										: option === 'dark'
											? 'settings.themeDark'
											: 'settings.themeSystem'
								)}
							</button>
						{/each}
					</div>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.display')}</h2>
					<div class="space-y-4">
						<!-- The installed app can sit on an old build for as long as it is never fully closed,
						     so there is a way to ask for the current one without uninstalling anything. -->
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.refreshTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">
									{refreshFailed ? $t('settings.refreshOffline') : $t('settings.refreshHint')}
								</p>
							</div>
							<button
								class="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-semibold"
								onclick={async () => (refreshFailed = !(await refreshApp()))}
							>
								{$t('settings.refreshAction')}
							</button>
						</div>

						<!-- Only while Chrome has actually handed over a prompt to pass on. Already installed, or
						     a browser that installs from its own menu, and there is nothing to show. -->
						{#if $installable}
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<p class="font-medium">{$t('settings.installTitle')}</p>
									<p class="mt-0.5 text-sm text-muted">{$t('settings.installHint')}</p>
								</div>
								<button
									class="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-brand-ink"
									onclick={() => promptInstall()}
								>
									{$t('settings.installAction')}
								</button>
							</div>
						{/if}

						<!-- Absent rather than disabled where the browser has no element fullscreen, which on a
						     phone means Safari: a dead switch would read as a bug in the app. -->
						{#if canFullscreen}
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1">
									<p class="font-medium">{$t('settings.fullscreenTitle')}</p>
									<p class="mt-0.5 text-sm text-muted">{$t('settings.fullscreenHint')}</p>
								</div>
								<Toggle
									checked={fullscreen}
									label={$t('settings.fullscreenTitle')}
									onchange={(v) => setFullscreen(v)}
								/>
							</div>
						{/if}

						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.clockTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('settings.clockHint')}</p>
							</div>
							<Toggle
								checked={$use24Hour}
								label={$t('settings.clockTitle')}
								onchange={(v) => use24Hour.set(v)}
							/>
						</div>

						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.newButtonTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('settings.newButtonHint')}</p>
							</div>
							<Toggle
								checked={$fullNewSessionButton}
								label={$t('settings.newButtonTitle')}
								onchange={(v) => fullNewSessionButton.set(v)}
							/>
						</div>

						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.noAnimationsTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('settings.noAnimationsHint')}</p>
							</div>
							<Toggle
								checked={$noAnimations}
								label={$t('settings.noAnimationsTitle')}
								onchange={(v) => noAnimations.set(v)}
							/>
						</div>

						<!-- A short palette: every option has to stay readable on the surface, in both themes. -->
						<div>
							<p class="font-medium">{$t('settings.competitionColourTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">{$t('settings.competitionColourHint')}</p>
							<div class="mt-2 flex flex-wrap gap-2">
								{#each [null, ...COMPETITION_COLOURS] as choice (choice ?? 'default')}
									{@const on = $competitionColour === choice}
									<button
										class="flex items-center gap-2 rounded-full border py-1 pr-3 pl-1.5 text-sm
											{on ? 'border-brand font-semibold' : 'border-line text-muted'}"
										aria-pressed={on}
										onclick={() => competitionColour.set(choice)}
									>
										<span
											class="h-4 w-4 rounded-full border border-line"
											style="background: {choice
												? `var(--c-comp-${choice})`
												: 'var(--c-kind-competition-base)'}"
										></span>
										{choice ? $t(`settings.colour.${choice}`) : $t('settings.colour.default')}
									</button>
								{/each}
							</div>
						</div>
					</div>
				</section>
			{:else if key === 'shooting'}
				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.plotting')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4">
						<div class="flex items-baseline justify-between gap-3">
							<p class="font-medium">{$t('settings.tapWindowTitle')}</p>
							<p class="tabular shrink-0 text-sm font-semibold text-brand-text">
								{$t('settings.milliseconds', { n: $plotTapMs })}
							</p>
						</div>
						<p class="mt-0.5 text-sm text-muted">{$t('settings.tapWindowHint')}</p>
						<!-- Opted out of the page swipe: dragging the handle is sideways too, and the pager
							would take the gesture and slide the page instead of moving the slider. -->
						<input
							data-noswipe
							type="range"
							min="80"
							max="500"
							step="10"
							class="mt-3 w-full accent-brand"
							aria-label={$t('settings.tapWindowTitle')}
							value={$plotTapMs}
							oninput={(e) => plotTapMs.set(Number(e.currentTarget.value))}
						/>
						<div class="tabular flex justify-between text-[11px] text-muted">
							<span>{$t('settings.tapWindowShort')}</span>
							<span>{$t('settings.tapWindowLong')}</span>
						</div>
					</div>

					<div class="mt-4 flex items-start justify-between gap-4">
						<div class="flex-1">
							<p class="font-medium">{$t('settings.driftTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">{$t('settings.driftHint')}</p>
						</div>
						<Toggle
							checked={$arrowDriftWarning}
							label={$t('settings.driftTitle')}
							onchange={(v) => arrowDriftWarning.set(v)}
						/>
					</div>

					<div class="mt-4 flex items-start justify-between gap-4">
						<div class="flex-1">
							<p class="font-medium">{$t('settings.hapticsTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">{$t('settings.hapticsHint')}</p>
						</div>
						<Toggle
							checked={$haptics}
							label={$t('settings.hapticsTitle')}
							onchange={(v) => haptics.set(v)}
						/>
					</div>
				</section>

				<section class="space-y-4">
					<h2 class="text-sm font-semibold text-muted">{$t('settings.conditions')}</h2>

					<div class="flex items-start justify-between gap-4">
						<div class="flex-1">
							<p class="font-medium">{$t('settings.locationTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">{$t('settings.locationHint')}</p>
						</div>
						<Toggle
							checked={$autoLocation}
							label={$t('settings.locationTitle')}
							onchange={toggleLocation}
						/>
					</div>

					{#if $autoLocation}
						<div class="flex items-start justify-between gap-4 border-l-2 border-line pl-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.weatherTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('settings.weatherHint')}</p>
							</div>
							<Toggle
								checked={$autoWeather}
								label={$t('settings.weatherTitle')}
								onchange={(v) => autoWeather.set(v)}
							/>
						</div>

						<div class="flex items-start justify-between gap-4 border-l-2 border-line pl-4">
							<div class="flex-1">
								<p class="font-medium">{$t('settings.placeTitle')}</p>
								<p class="mt-0.5 text-sm text-muted">{$t('settings.placeHint')}</p>
							</div>
							<Toggle
								checked={$autoPlaceName}
								label={$t('settings.placeTitle')}
								onchange={(v) => autoPlaceName.set(v)}
							/>
						</div>
					{/if}

					{#if error}
						<p class="text-sm text-danger">{error}</p>
					{/if}
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('auto.title')}</h2>
					<div class="mb-4">
						<p class="font-medium">{$t('settings.detectorTitle')}</p>
						<p class="mt-0.5 text-sm text-muted">{$t('settings.detectorHint')}</p>
						<div class="mt-2 flex gap-2" role="group" aria-label={$t('settings.detectorTitle')}>
							{#each [['classical', $t('settings.detectorClassical')], ['learned', $t('settings.detectorLearned')]] as [value, label] (value)}
								<button
									type="button"
									class="flex-1 rounded-lg border py-2 text-sm font-medium
										{($arrowDetector ?? 'classical') === value
										? 'border-brand bg-brand text-brand-ink'
										: 'border-line'}"
									aria-pressed={($arrowDetector ?? 'classical') === value}
									onclick={() => arrowDetector.set(value)}
								>
									{label}
								</button>
							{/each}
						</div>
					</div>

					<div class="flex items-start justify-between gap-4">
						<div class="flex-1">
							<p class="font-medium">{$t('settings.recordTitle')}</p>
							<p class="mt-0.5 text-sm text-muted">{$t('settings.recordHint')}</p>
						</div>
						<Toggle
							checked={$recordCameraVideo}
							label={$t('settings.recordTitle')}
							onchange={(v) => recordCameraVideo.set(v)}
						/>
					</div>
					{#if $recordCameraVideo}
						<!-- Where to go looking, since nothing here hands the files over one at a time. -->
						<p class="mt-3 rounded-lg bg-sunk p-3 text-sm text-muted">
							{$t('settings.recordPath')}
							<code class="mt-1 block break-all text-xs text-ink">{recordingsPath()}</code>
						</p>
					{/if}
				</section>
			{:else}
				<!-- First on the tab because it decides where the data lives, and above the backup card
					because an account is the answer to the same worry a backup answers. -->
				<AccountCard />

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.storage')}</h2>
					<p class="text-sm">
						<code class="rounded bg-sunk px-1">{info.kind}</code>
						· {info.persistent ? $t('settings.persistent') : $t('settings.volatile')}
					</p>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('backup.title')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4">
						<p class="text-sm text-muted">{$t('backup.hint')}</p>

						<div class="mt-3 flex gap-2">
							<button
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2 text-sm font-semibold text-brand-ink disabled:opacity-50"
								disabled={busy}
								onclick={exportToFile}
							>
								{$t('backup.export')}
							</button>
							<button
								class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
								disabled={busy}
								onclick={() => fileInput?.click()}
							>
								{$t('backup.import')}
							</button>
						</div>

						<input
							bind:this={fileInput}
							type="file"
							accept="application/json,.json"
							class="hidden"
							onchange={chooseFile}
						/>

						{#if backupNotice}
							<p class="mt-3 flex items-center gap-1.5 text-sm text-brand-text">
								<Icon name="target" size={16} />
								{backupNotice}
							</p>
						{/if}
						{#if backupError}
							<p class="mt-3 text-sm text-danger">{backupError}</p>
						{/if}
					</div>
				</section>

				<!-- Scores shot before this app existed. Adding to what is here rather than replacing
					it, which is what makes this a different button from restoring a backup. -->
				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('importer.title')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4">
						<p class="text-sm text-muted">{$t('importer.hint')}</p>

						<button
							class="mt-3 w-full rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
							disabled={busy}
							onclick={() => importInput?.click()}
						>
							{$t('importer.choose')}
						</button>

						<input
							bind:this={importInput}
							type="file"
							accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
							class="hidden"
							onchange={chooseImport}
						/>
					</div>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.recalcTitle')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4">
						<p class="text-sm text-muted">{$t('settings.recalcHint')}</p>
						<button
							class="mt-3 w-full rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
							disabled={busy}
							onclick={recheckBadges}
						>
							{$t('settings.recalcAction')}
						</button>
						{#if badgeNotice}
							<p class="mt-3 flex items-center gap-1.5 text-sm text-brand-text">
								<Icon name="medal" size={16} />
								{badgeNotice}
							</p>
						{/if}
					</div>
				</section>

				<section>
					<h2 class="mb-2 text-sm font-semibold text-muted">{$t('settings.forgetTitle')}</h2>
					<div class="rounded-xl border border-line bg-surface p-4">
						<p class="text-sm text-muted">{$t('settings.forgetHint')}</p>
						<button
							class="mt-3 w-full rounded-lg border border-line py-2 text-sm font-medium disabled:opacity-50"
							disabled={busy}
							onclick={forgetCelebrations}
						>
							{$t('settings.forgetAction')}
						</button>
						{#if celebrationNotice}
							<p class="mt-3 flex items-center gap-1.5 text-sm text-brand-text">
								<Icon name="star" size={16} />
								{celebrationNotice}
							</p>
						{/if}
					</div>
				</section>

				<!-- Last on the tab, and the only place in the app that throws shooting away. -->
				<section>
					<h2 class="mb-2 text-sm font-semibold text-danger">{$t('danger.title')}</h2>
					<div class="rounded-xl border border-danger/40 bg-danger/5 p-4">
						<p class="text-sm text-muted">{$t('danger.importedHint')}</p>
						<button
							class="mt-3 w-full rounded-lg border border-danger/60 py-2 text-sm font-medium text-danger disabled:opacity-50"
							disabled={busy}
							onclick={() => (dangerDialog = 'imported')}
						>
							{$t('danger.imported')}
						</button>

						<p class="mt-4 text-sm text-muted">{$t('danger.everythingHint')}</p>
						{#if $account}
							<p class="mt-1 text-sm text-muted">{$t('account.wipeSignedIn')}</p>
						{/if}
						<button
							class="mt-3 w-full rounded-lg bg-danger py-2 text-sm font-semibold text-white disabled:opacity-50"
							disabled={busy || Boolean($account)}
							onclick={() => (dangerDialog = 'everything')}
						>
							{$t('danger.everything')}
						</button>

						{#if dangerNotice}
							<p class="mt-3 text-sm text-muted">{dangerNotice}</p>
						{/if}
					</div>
				</section>
			{/if}
		{/snippet}
	</TabDeck>
</div>

{#if pendingFile}
	<ConfirmDialog
		title={$t('backup.confirmTitle')}
		message={$t('backup.confirmBody', { name: pendingFile.name })}
		confirmLabel={$t('backup.confirmAction')}
		onconfirm={restore}
		oncancel={() => (pendingFile = null)}
	/>
{/if}

<!-- No way out of this one on purpose: the write is half done and there is nothing safe to cancel
	into, so the screen is held until it finishes. -->
{#if importFile}
	<ImportDialog file={importFile} onclose={() => (importFile = null)} />
{/if}

{#if dangerDialog}
	<ConfirmDialog
		title={$t(`danger.confirmTitle.${dangerDialog}`)}
		message={$t(`danger.confirmBody.${dangerDialog}`)}
		confirmLabel={$t(`danger.confirmAction.${dangerDialog}`)}
		onconfirm={runDanger}
		oncancel={() => (dangerDialog = null)}
	/>
{/if}
