<script lang="ts">
	import '../app.css';
	import { App } from '@capacitor/app';
	import { Capacitor } from '@capacitor/core';
	import { goto, pushState } from '$app/navigation';
	import { page } from '$app/stores';
	import { initDb, dbInfo } from '$lib/db';
	// Imported for its side effect: beforeinstallprompt fires early, and a listener registered only
	// once Settings is opened would already have missed it.
	import '$lib/install';
	import {
		backGuards,
		isMainPage,
		originOf,
		pageTabs,
		pageUp,
		parentPath,
		runBackGuards
	} from '$lib/nav';
	import { t } from '$lib/i18n';
	import { defaultBowId } from '$lib/prefs';
	import { theme } from '$lib/theme';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import UndoBar from '$lib/ui/UndoBar.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Pager from '$lib/ui/Pager.svelte';

	let { children } = $props();

	let ready = $state(false);
	let error = $state<string | null>(null);
	let volatileStorage = $state(false);
	// Deliberately not persisted: the data really is about to be lost, so the warning comes back on
	// the next load. Dismissing it buys back the screen for this visit, not for good.
	let warningIgnored = $state(false);
	let confirmingExit = $state(false);

	$effect(() => {
		// Touch the store so the theme attribute is applied before the shell first paints.
		void $theme;
		initDb()
			.then(() => {
				volatileStorage = !dbInfo().persistent;
				ready = true;
			})
			// Not every rejection is an Error: worker APIs reject with plain response objects, and
			// String() renders those as "[object Object]", which tells a user nothing at all.
			.catch((e) => {
				if (e instanceof Error) error = e.message;
				else if (e && typeof e === 'object')
					error = ((e as { message?: string }).message ?? JSON.stringify(e)).slice(0, 500);
				else error = String(e);
			});
	});

	const tabs: { href: string; key: string; icon: IconName }[] = [
		{ href: '/', key: 'nav.home', icon: 'home' },
		{ href: '/sessions', key: 'nav.sessions', icon: 'target' },
		{ href: '/equipment', key: 'nav.equipment', icon: 'bow' },
		{ href: '/stats', key: 'nav.stats', icon: 'chart' },
		{ href: '/settings', key: 'nav.settings', icon: 'sliders' }
	];

	// The hardware key climbs the tree rather than unwinding history, so a long detour inside one
	// section still leaves the app in one press from its root.
	$effect(() => {
		const listener = App.addListener('backButton', () => {
			if (runBackGuards($backGuards)) return;
			// A page opened from somewhere other than its own section goes back there first.
			const up = $pageUp ?? originOf($page.url, null) ?? parentPath($page.url.pathname);
			if (up) {
				goto(up);
				return;
			}
			// A main page has no parent to climb to, so the key falls back to home, which slides in
			// the way a tab tap does. Only home itself asks whether to leave, and only the answer
			// closes the app: the key alone never does.
			if ($page.url.pathname !== '/') {
				goto('/');
				return;
			}
			confirmingExit = true;
		});
		return () => {
			listener.then((l) => l.remove());
		};
	});

	/**
	 * The same job as the listener above, for the browser, which has no back key to listen to: back
	 * is a history move, and by the time it arrives the page it was meant to protect has gone.
	 *
	 * So while anything dismissable is open, a spare history entry for the same URL is parked on top
	 * of the page. Popping it navigates nowhere, which gives the guards the chance the hardware key
	 * gives them on Android — back closes the dialog, and the page underneath stays put.
	 *
	 * A focused text field counts as dismissable for the same reason it does natively: the first
	 * back press there means "I am done typing", not "leave".
	 */
	let trapped = false;
	/** Where the spare entry was parked, so it is only ever reclaimed while it is still on top. */
	let trappedAt: string | null = null;

	function editableFocused(): boolean {
		const el = document.activeElement as HTMLElement | null;
		if (!el) return false;
		return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
	}

	// Focus moves without touching any store, so the trap has to be re-evaluated when it does.
	let focusTick = $state(0);
	$effect(() => {
		const bump = () => focusTick++;
		document.addEventListener('focusin', bump);
		document.addEventListener('focusout', bump);
		return () => {
			document.removeEventListener('focusin', bump);
			document.removeEventListener('focusout', bump);
		};
	});

	$effect(() => {
		void focusTick;
		// Capacitor's listener already owns the key on a device, and a second interception there
		// would eat the press before the guards ever saw it.
		if (Capacitor.isNativePlatform()) return;

		const holding = $backGuards.length > 0 || editableFocused();

		if (holding && !trapped) {
			trapped = true;
			trappedAt = location.href;
			pushState('', {});
		} else if (!holding && trapped) {
			// Closed by its own button rather than by back: take the spare entry back out, or the next
			// back press would spend itself popping an entry nothing is waiting on.
			trapped = false;
			// Unless the sheet closed by opening a page, in which case the spare entry is buried under
			// the new one and going back would leave the page that was just opened.
			const stale = location.href !== trappedAt;
			trappedAt = null;
			if (!stale) history.back();
		}
	});

	// The pop is read from the event rather than from `page.state`, which does not re-emit for a
	// same URL entry: the flag above stayed stale and the spare entry was never reclaimed.
	$effect(() => {
		const onPop = () => {
			// Not ours: either a real navigation, or the cleanup above reclaiming its own entry.
			if (!trapped) return;
			trapped = false;
			if (!runBackGuards($backGuards) && editableFocused()) {
				(document.activeElement as HTMLElement).blur();
			}
		};
		window.addEventListener('popstate', onPop);
		return () => window.removeEventListener('popstate', onPop);
	});

	// A page with its own tabs still swipes between them. The main pages leave the gesture to the
	// pager, which drags the next page into view instead of replacing this one.
	const SWIPE_MIN = 60;
	let touch: { x: number; y: number } | null = null;

	function swipe(direction: 1 | -1) {
		const tabs = $pageTabs;
		if (!tabs) return;
		const next = tabs.index + direction;
		if (next >= 0 && next < tabs.count) tabs.select(next);
	}

	function onTouchEnd(event: TouchEvent) {
		const start = touch;
		touch = null;
		if (!start || event.changedTouches.length !== 1) return;
		const dx = event.changedTouches[0].clientX - start.x;
		const dy = event.changedTouches[0].clientY - start.y;
		// Twice as far across as down, otherwise a slanted scroll would count as a swipe.
		if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 2) return;
		swipe(dx < 0 ? 1 : -1);
	}

	/**
	 * The equipment slot shows the default bow, so the tab needs no shortcut of its own. Holding it
	 * asks for the list instead, which is the only thing the tap cannot reach.
	 */
	const holdsList = (href: string) => href === '/equipment' && Boolean($defaultBowId);

	let held = false;
	let holdTimer: ReturnType<typeof setTimeout> | null = null;

	/**
	 * The tab bar moves on the press rather than on the release. A tap is a press and a release with
	 * a hundred milliseconds and a browser's click delay between them, and on a page switch that
	 * gap is the whole of what makes an app feel slow.
	 */
	function pressTab(event: PointerEvent, href: string) {
		holdTab(href);
		// Cleared first: a click always follows its own press, so the flag never outlives one.
		pressed = false;
		// Left button and primary touch only: the middle click and the long press have their own jobs.
		if (event.button !== 0) return;
		if (onGestureBar(event, href)) return;
		pressed = true;
		event.preventDefault();
		if ($page.url.pathname !== href) goto(href);
	}

	/**
	 * The phone's own gesture handle sits along the bottom edge, under the middle tab. A press that
	 * starts there is as likely to be a swipe to another app as a tap, and answering it at once would
	 * change page under a finger on its way somewhere else. That band waits for the release instead.
	 */
	function onGestureBar(event: PointerEvent, href: string): boolean {
		if (href !== '/equipment') return false;
		const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
		return event.clientY - box.top > box.height * 0.65;
	}

	function holdTab(href: string) {
		cancelHold();
		if (!holdsList(href)) return;
		holdTimer = setTimeout(() => {
			held = true;
			goto('/equipment?list=1');
		}, 450);
	}

	function cancelHold() {
		if (holdTimer) clearTimeout(holdTimer);
		holdTimer = null;
	}

	/** True while a click is on its way to a page the press has already opened. */
	let pressed = false;

	/** The click still does the work when the press stood aside, and nothing when it did not. */
	function openTab(event: MouseEvent) {
		if (!pressed && !held) return;
		event.preventDefault();
		pressed = false;
		held = false;
	}

	const isActive = (href: string) =>
		href === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(href);
</script>

<div class="flex h-full flex-col bg-bg text-ink">
	{#if error}
		<div class="m-4 rounded-lg border border-danger/40 bg-danger/10 p-4 text-danger">
			<p class="font-semibold">Database failed to open</p>
			<p class="mt-1 text-sm">{error}</p>
		</div>
	{:else if !ready}
		<div class="flex flex-1 items-center justify-center text-muted">{$t('common.loading')}</div>
	{:else}
		{#if volatileStorage && !warningIgnored}
			<div class="safe-top flex items-center gap-3 bg-accent/20 px-4 py-1.5 text-sm">
				<p class="min-w-0 flex-1">{$t('storage.volatileWarning')}</p>
				<button class="shrink-0 font-semibold text-muted" onclick={() => (warningIgnored = true)}>
					{$t('storage.volatileDismiss')}
				</button>
			</div>
		{/if}

		{#if isMainPage($page.url.pathname)}
			<Pager />
		{:else}
			<main
				class="flex-1 overflow-y-auto"
				ontouchstart={(e) => {
					// A page that drags, such as a target face, opts out so a shot is never read as a swipe.
					const inert = (e.target as Element | null)?.closest('[data-noswipe]');
					touch =
						!inert && e.touches.length === 1
							? { x: e.touches[0].clientX, y: e.touches[0].clientY }
							: null;
				}}
				ontouchend={onTouchEnd}
				ontouchcancel={() => (touch = null)}
			>
				{@render children()}
			</main>
		{/if}

		<!-- Over the page but under the tab bar: what it offers back is worth a glance, not the screen. -->
		<UndoBar />

		<nav class="safe-bottom flex border-t border-line bg-surface">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class="flex flex-1 flex-col items-center gap-0.5 py-2
						{isActive(tab.href) ? 'text-brand-text' : 'text-muted'}"
					aria-current={isActive(tab.href) ? 'page' : undefined}
					onclick={openTab}
					onpointerdown={(event) => pressTab(event, tab.href)}
					onpointerup={cancelHold}
					onpointerleave={cancelHold}
					onpointercancel={cancelHold}
					oncontextmenu={(event) => {
						if (!holdsList(tab.href)) return;
						event.preventDefault();
						goto('/equipment?list=1');
					}}
				>
					<Icon name={tab.icon} size={24} filled={isActive(tab.href)} />
					<span class="text-[11px] leading-none font-medium">{$t(tab.key)}</span>
				</a>
			{/each}
		</nav>
	{/if}
</div>

{#if confirmingExit}
	<ConfirmDialog
		title={$t('app.exitTitle')}
		message={$t('app.exitBody')}
		confirmLabel={$t('app.exitAction')}
		onconfirm={() => App.exitApp()}
		oncancel={() => (confirmingExit = false)}
	/>
{/if}
