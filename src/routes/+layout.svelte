<script lang="ts">
	import '../app.css';
	import { App } from '@capacitor/app';
	import { Capacitor } from '@capacitor/core';
	import { afterNavigate, beforeNavigate, goto, pushState } from '$app/navigation';
	import { navigating, page } from '$app/stores';
	import { tick } from 'svelte';
	import { get } from 'svelte/store';
	import { initDb, dbInfo } from '$lib/db';
	// Imported for its side effect: beforeinstallprompt fires early, and a listener registered only
	// once Settings is opened would already have missed it.
	import '$lib/install';
	import {
		askTab,
		forgetMainScroll,
		leaveGuarded,
		backGuards,
		isMainPage,
		originOf,
		pageLoading,
		pageTabs,
		pageUp,
		parentPath,
		runBackGuards
	} from '$lib/nav';
	import { t } from '$lib/i18n';
	import { defaultBowId } from '$lib/prefs';
	import { theme } from '$lib/theme';
	import { incomingFile, namedFile } from '$lib/import/incoming';
	import { refreshApp, watchForUpdates } from '$lib/update';
	import { watchSync } from '$lib/sync/watch';
	import { syncAlertUnread, refreshSyncAlert } from '$lib/sync/alert';
	import Icon, { type IconName } from '$lib/ui/Icon.svelte';
	import PageSkeleton from '$lib/ui/PageSkeleton.svelte';
	import UndoBar from '$lib/ui/UndoBar.svelte';
	import ConfirmDialog from '$lib/ui/ConfirmDialog.svelte';
	import Pager from '$lib/ui/Pager.svelte';
	import Rail from '$lib/ui/Rail.svelte';
	import { watchPresses } from '$lib/ui/press';

	let { children } = $props();

	// One watcher for every pressable card in the app, installed before the first one can be tapped.
	watchPresses();

	/**
	 * Where each page inside the tree was left, and where it is put back when it is come back to.
	 *
	 * Every page outside the swipe pager shares one scrolling element, which outlives the navigation
	 * between them: without this, opening an exercise from halfway down the library opens it halfway
	 * down. The browser's own restoration cannot help, because it only ever knew about the window.
	 *
	 * Coming back is not only a history pop. The back arrow in a header is a link to wherever the
	 * page was opened from, so a page arriving at its own origin is a return too, and is the one the
	 * archer actually makes. Anything else is a fresh arrival, and a fresh arrival starts at the top.
	 */
	let scroller = $state<HTMLElement | null>(null);
	const scrolledTo = new Map<string, number>();

	beforeNavigate((nav) => {
		if (scroller && nav.from?.url) scrolledTo.set(nav.from.url.pathname, scroller.scrollTop);
	});

	/** How long a page arriving is kept off screen, rather than shown at the wrong offset and moved. */
	const HIDE_MS = 450;
	/** The end of every wait: a page that never grows enough is left at its top, which is honest. */
	const RESTORE_MS = 6000;
	/** What a page that has stopped growing and is fetching nothing is still given, for a late row. */
	const SETTLED_MS = 300;
	let restoring = 0;
	/** Held back while the offset is being put back, so nobody watches the page land in two places. */
	let withheld = $state(false);

	/**
	 * Put back over the frames that follow rather than in one go. A page arriving is not its full
	 * height yet, and a browser clamps a scroll to what the element can currently reach, so a single
	 * assignment lands short and stays there.
	 *
	 * Nothing is moved until the page is tall enough to hold the offset, because the clamp is worse
	 * than doing nothing: it drops the archer at the bottom of the rows a competition list happens to
	 * have read so far. Until then the page waits at its top, out of sight for the moment it usually
	 * takes, and a page that says it is still loading is waited for however long that is.
	 */
	async function scrollBackTo(top: number) {
		// The scroller is shared, so a restore left running by an earlier page must not move this one.
		const mine = ++restoring;
		const started = performance.now();
		withheld = true;
		let height = -1;
		while (scroller && restoring === mine) {
			let landed = false;
			if (scroller.scrollHeight - scroller.clientHeight >= top - 1) {
				scroller.scrollTop = top;
				landed = Math.abs(scroller.scrollTop - top) < 1;
			} else if (scroller.scrollTop !== 0) scroller.scrollTop = 0;

			const loading = get(pageLoading);
			// A page landed on the right row is still held while it says it is reading: a return to the
			// top of a list is otherwise shown the few rows it starts with before the rest arrive.
			if (landed && !loading) break;
			const waited = performance.now() - started;
			// Shown again well before the wait is out: a slow page is better read than blank.
			if (waited > HIDE_MS) withheld = false;
			if (waited > RESTORE_MS || (landed && !withheld)) break;
			const stuck = scroller.scrollHeight === height && !loading;
			if (!landed && stuck && waited > SETTLED_MS) break;
			height = scroller.scrollHeight;
			await new Promise(requestAnimationFrame);
		}
		if (restoring === mine) withheld = false;
	}

	afterNavigate(async (nav) => {
		// A navigation can name a target it knows nothing else about, so neither url is assumed here.
		const to = nav.to?.url?.pathname ?? null;
		const returning =
			nav.type === 'popstate' || (nav.from?.url ? originOf(nav.from.url, null) === to : false);
		const back = returning && to ? scrolledTo.get(to) : undefined;
		// After the page it is scrolling has been laid out, or the element is still the old height.
		await tick();
		// Zero is a place too: a return to the top of a list waits for it like any other offset.
		if (back !== undefined) await scrollBackTo(back);
		else if (scroller) {
			restoring++;
			withheld = false;
			scroller.scrollTop = 0;
		}
	});

	let ready = $state(false);
	let error = $state<string | null>(null);
	let volatileStorage = $state(false);
	// Deliberately not persisted: the data really is about to be lost, so the warning comes back on
	// the next load. Dismissing it buys back the screen for this visit, not for good.
	let warningIgnored = $state(false);
	let confirmingExit = $state(false);

	$effect(() => watchForUpdates());
	// Only once the database is open, because an exchange reads it. Returns immediately and loads
	// nothing unless a server is configured and somebody is signed in.
	$effect(() => (ready ? watchSync() : undefined));
	// Read once the database is open, so a warning raised on the last run is on screen before the
	// archer goes looking for it.
	$effect(() => {
		if (ready) void refreshSyncAlert();
	});

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
				console.error('Appchery: the database would not open', e);
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

	// An export opened from a file manager or handed over by another app: the file is carried in and
	// the import page picks it up, so opening one is the whole of what the archer has to do.
	$effect(() => {
		if (!Capacitor.isNativePlatform()) {
			const queue = (window as unknown as { launchQueue?: LaunchQueue }).launchQueue;
			queue?.setConsumer(async (params) => {
				const [handle] = params.files ?? [];
				if (!handle) return;
				incomingFile.set(await handle.getFile());
				goto('/import');
			});
			return;
		}

		App.getLaunchUrl().then((launch) => {
			if (launch?.url) openHanded(launch.url);
		});
		const listener = App.addListener('appUrlOpen', (event) => openHanded(event.url));
		return () => {
			listener.then((l) => l.remove());
		};
	});

	/** A cold start reports the launch through both the promise and the listener, so it is deduped. */
	let handedUrl: string | null = null;

	/**
	 * Where the app's own pages live on the web. A link to one of them, scanned off somebody's phone
	 * or followed out of a message, opens the page here rather than the site: the app that claimed
	 * the link is the app that should answer it.
	 */
	const SITE = 'https://app.appchery.com';

	/** Whatever the platform handed over: a file to import, or a link to one of the app's own pages. */
	async function openHanded(url: string) {
		if (url === handedUrl) return;
		handedUrl = url;

		if (url.startsWith(SITE)) {
			const here = new URL(url);
			goto(`${here.pathname}${here.search}` || '/');
			return;
		}

		await openHandedFile(url);
	}

	/** Android hands over a content URI rather than a file, and only the platform can read it. */
	async function openHandedFile(url: string) {
		if (!/\.xlsx(\?|$)/i.test(url) && !url.startsWith('content://')) return;
		try {
			const { Filesystem } = await import('@capacitor/filesystem');
			const { data } = await Filesystem.readFile({ path: url });
			const binary = atob(typeof data === 'string' ? data : '');
			const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
			const name = decodeURIComponent(url.split('/').pop() ?? '').split('?')[0];
			incomingFile.set(namedFile(new Blob([bytes as BlobPart]), name));
			goto('/import');
		} catch {
			// A file the platform will not hand over leaves the import page to say so.
			goto('/import');
		}
	}

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
	 * Only for things that are open, never for a cursor sitting in a text field. Tapping a search
	 * result blurs the field and navigates in the same gesture, and the blur asked for the entry back
	 * a task before the navigation had begun: taking it killed the navigation, and the archer tapped
	 * a competition and stayed on the search. The hardware key does not treat a focused field as
	 * dismissable either, so the browser no longer does.
	 */
	let trapped = false;
	/** Where the spare entry was parked, so it is only ever reclaimed while it is still on top. */
	let trappedAt: string | null = null;

	/** SvelteKit keeps `pushState` state here, and a popstate does not re-emit it through the store. */
	const isSpareEntry = () =>
		(history.state?.['sveltekit:states'] as App.PageState | undefined)?.spare === true;

	function editableFocused(): boolean {
		const el = document.activeElement as HTMLElement | null;
		if (!el) return false;
		return el.isContentEditable || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
	}

	$effect(() => {
		// Capacitor's listener already owns the key on a device, and a second interception there
		// would eat the press before the guards ever saw it.
		if (Capacitor.isNativePlatform()) return;

		const holding = $backGuards.length > 0;

		if (holding && !trapped) {
			trapped = true;
			trappedAt = location.href;
			pushState('', { spare: true });
		} else if (!holding && trapped) {
			// Closed by its own button rather than by back: take the spare entry back out, or the next
			// back press would spend itself popping an entry nothing is waiting on.
			trapped = false;
			// Unless the sheet closed by opening a page, in which case the spare entry is buried under
			// the new one and going back would leave the page that was just opened.
			const at = trappedAt;
			trappedAt = null;
			// A task later, because a menu item that closes and navigates in one handler has not moved
			// the URL yet: reclaiming now would pop the page it just opened straight back off. The
			// entry stays buried under that page instead, and the pop that lands on it later is spent.
			setTimeout(() => {
				if (location.href === at && get(navigating) === null) history.back();
			});
		}
	});

	// The pop is read from the event rather than from `page.state`, which does not re-emit for a
	// same URL entry: the flag above stayed stale and the spare entry was never reclaimed.
	$effect(() => {
		const onPop = () => {
			// A buried spare: the same page twice over, so landing on it looks like the press did
			// nothing. Spend it and take the entry the archer was actually reaching for.
			if (!trapped) {
				if (isSpareEntry()) history.back();
				return;
			}
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
		// A tab stands for the top of its page, so the tap drops wherever that page was left.
		forgetMainScroll(href);
		// A page holding unsaved work answers a way out with a question. Asked on the press, it would
		// stand under a finger already down, and the click ending that press would take it away
		// unread, so this one tab tap waits for the release the link navigates on anyway.
		if (leaveGuarded()) {
			cancelHold();
			return;
		}
		pressed = true;
		event.preventDefault();
		if ($page.url.pathname !== href) {
			goto(href);
			return;
		}
		// Already here: the tap asks this page for itself. The equipment slot answers with the list,
		// which the bow it usually shows is the only thing standing in front of; everything else is
		// left to the page, which knows what going back to its own start means.
		if (holdsList(href) && !$page.url.searchParams.has('list')) goto('/equipment?list=1');
		else askTab(href);
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
		<!--
			Almost always a deploy that landed while this tab was open: the shell is new and the
			database the old one left behind is not. The cause is not worth explaining in a stack
			trace, so the screen offers the one thing that fixes it. The error itself goes to the
			console for whoever is looking for it.
		-->
		<div class="flex flex-1 items-center justify-center p-6">
			<div class="w-full max-w-sm text-center">
				<div
					class="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand/15 text-brand-text"
				>
					<Icon name="refresh" size={26} />
				</div>
				<h1 class="text-xl font-bold tracking-tight">{$t('dbError.title')}</h1>
				<p class="mt-2 text-sm leading-snug text-muted">{$t('dbError.body')}</p>
				<p class="mt-1 text-sm leading-snug text-muted">{$t('dbError.safe')}</p>
				<button
					class="press mt-5 w-full rounded-xl bg-brand px-4 py-2.5 font-semibold text-brand-ink"
					onclick={async () => {
						// refreshApp refuses while offline rather than emptying the cache; a plain
						// reload is still the right move here, since the shell is already loaded.
						if (!(await refreshApp())) location.reload();
					}}
				>
					{$t('dbError.action')}
				</button>
				<p class="mt-4 text-xs leading-snug text-muted">{$t('dbError.persist')}</p>
			</div>
		</div>
	{:else if !ready}
		<!-- The database opening, which is the one wait every tab shares. -->
		<PageSkeleton />
	{:else}
		{#if volatileStorage && !warningIgnored}
			<div class="safe-top flex items-center gap-3 bg-accent/20 px-4 py-1.5 text-sm">
				<p class="min-w-0 flex-1">{$t('storage.volatileWarning')}</p>
				<button class="shrink-0 font-semibold text-muted" onclick={() => (warningIgnored = true)}>
					{$t('storage.volatileDismiss')}
				</button>
			</div>
		{/if}

		<!-- A row on the desk and a column on a phone: the rail and the tab bar are the same nav. -->
		<div class="flex min-h-0 flex-1 lg:flex-row">
		<Rail {tabs} />

		{#if isMainPage($page.url.pathname)}
			<Pager />
		{:else}
			<!--
				Scroll anchoring is off because it fights the restore above: a list arriving row by row
				moves the browser's anchor node down the page with it, taking the offset to the bottom.
			-->
			<main
				bind:this={scroller}
				class="flex-1 overflow-y-auto [overflow-anchor:none]"
				style={withheld ? 'visibility: hidden' : ''}
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
		</div>

		<!-- Over the page but under the tab bar: what it offers back is worth a glance, not the screen. -->
		<UndoBar />

		<!-- Gone once the rail has taken over: two navs saying the same thing is one too many. -->
		<nav data-tabbar class="overbar safe-bottom flex border-t border-line bg-surface lg:hidden">
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
					<span class="relative">
						<Icon name={tab.icon} size={24} filled={isActive(tab.href)} />
						<!-- Settings is where the sync warning lives, so the bar says there is one to read. -->
						{#if tab.href === '/settings' && $syncAlertUnread}
							<span class="absolute -top-0.5 -right-1 size-2 rounded-full bg-danger"></span>
						{/if}
					</span>
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
