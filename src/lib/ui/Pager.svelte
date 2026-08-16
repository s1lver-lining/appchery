<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { askToLeave, MAIN_PAGES, mainPageIndex } from '$lib/nav';
	import { swipe, COMMIT_RATIO, SNAP_MS, SNAP_EASE } from './swipe';
	import Home from '$lib/pages/Home.svelte';
	import Sessions from '$lib/pages/Sessions.svelte';
	import Equipment from '$lib/pages/Equipment.svelte';
	import Stats from '$lib/pages/Stats.svelte';
	import Settings from '$lib/pages/Settings.svelte';

	/**
	 * The main pages ride on one track so a swipe drags the next page into view rather than
	 * replacing this one. Only the current page and its neighbours are mounted: five live pages
	 * means five sets of queries on boot, and nobody sees the far ones anyway.
	 */
	const VIEWS = [Home, Sessions, Equipment, Stats, Settings];

	let width = $state(1);
	let index = $state(Math.max(0, mainPageIndex($page.url.pathname)));
	let offset = $state(0);
	let duration = $state(0);
	let settling = $state(false);

	/**
	 * A page being slid to from somewhere other than a swipe, such as a tab bar tap. It rides one
	 * screen away whatever its real distance, because three screens flying past reads as a glitch.
	 */
	let sliding = $state<number | null>(null);

	// The URL leads, except while a swipe is settling: there the pager already knows where it lands.
	$effect(() => {
		const at = mainPageIndex($page.url.pathname);
		if (at < 0 || settling || at === index) return;
		slideTo(at);
	});

	/**
	 * A slide leaves the neighbours behind: the page being slid to takes the slot one of them holds.
	 *
	 * Always in page order, never in the order they were named. The track is keyed, so a list that
	 * put a page before one already ahead of it would have the browser move the node rather than
	 * re-render it, and moving a node resets the scroll of everything inside it: sliding back to an
	 * earlier tab dropped the page behind it to its top, while swiping the same way left it alone.
	 */
	const visible = $derived(
		(sliding !== null ? [index, sliding] : [index - 1, index, index + 1])
			.filter((i) => i >= 0 && i < MAIN_PAGES.length)
			.sort((a, b) => a - b)
	);

	const progress = $derived(Math.min(1, Math.abs(offset) / width));
	const towards = $derived(sliding ?? (offset < 0 ? index + 1 : index - 1));

	/** Where a page sits on the track, in screens from the one on show. */
	const slot = (i: number) => (i === sliding ? Math.sign(sliding - index) : i - index);

	let headerHeights = $state<Record<number, number>>({});

	/**
	 * Header heights are measured rather than declared, because each page sizes its own motif. The
	 * whole page is watched rather than the header itself: a page that waits on a query has no header
	 * to measure at mount, and measuring it as zero would raise its neighbour by a header's height.
	 */
	function measure(node: HTMLElement, i: number) {
		const read = () => {
			const header = node.querySelector<HTMLElement>('[data-page-header]');
			headerHeights = { ...headerHeights, [i]: header?.offsetHeight ?? 0 };
		};
		// Read at once as well as observed: the observer reports after the frame, by which time a page
		// slid to from the tab bar has already arrived, and its header would drop with nothing to show.
		read();
		const observer = new ResizeObserver(read);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}

	/**
	 * The taller of the two headers climbs out of view as the move advances, so the two coloured
	 * blocks meet at the same height by the time the new page is centred.
	 */
	function rise(i: number) {
		const partner = i === index ? towards : i === towards ? index : null;
		if (partner === null || progress === 0) return 0;
		const mine = headerHeights[i];
		const theirs = headerHeights[partner];
		// A header not measured yet is not a short header: nothing moves until both are known.
		if (!mine || !theirs) return 0;
		const delta = mine - theirs;
		if (delta <= 0) return 0;
		return delta * (i === index ? progress : 1 - progress);
	}

	/** Runs the track to `target` and hands it the page once it is centred, whatever moved it. */
	function settle(target: number) {
		settling = true;
		duration = SNAP_MS;
		offset = -Math.sign(target - index) * width;
		setTimeout(async () => {
			// A tab bar tap has already changed the URL, and going there twice would double the history.
			// The bare path, so a page arrived at afresh is in the state its tab stands for rather than
			// in whatever detour was last asked of it.
			if (mainPageIndex($page.url.pathname) !== target)
				await goto(MAIN_PAGES[target], { noScroll: true });
			duration = 0;
			offset = 0;
			sliding = null;
			index = target;
			settling = false;
		}, SNAP_MS);
	}

	/** A tap on the tab bar travels the same way a swipe does, so the two never feel like two apps. */
	function slideTo(target: number) {
		sliding = target;
		// One frame at rest, otherwise the page mounts already at its destination and nothing moves.
		requestAnimationFrame(() => settle(target));
	}

	/** A swipe off the first or last page pulls against a rubber band instead of dead stopping. */
	function damp(dx: number) {
		const target = dx < 0 ? index + 1 : index - 1;
		return target < 0 || target >= MAIN_PAGES.length ? dx * 0.25 : dx;
	}

	function release(dx: number, flicked: boolean) {
		const target = dx < 0 ? index + 1 : index - 1;
		const far = Math.abs(offset) > width * COMMIT_RATIO;
		const reachable = target >= 0 && target < MAIN_PAGES.length;

		duration = SNAP_MS;
		if (!reachable || !(far || flicked)) {
			offset = 0;
			return;
		}
		// A swipe changes no URL, so a page holding unsaved work would slide away without being asked.
		if (askToLeave(() => settle(target))) {
			offset = 0;
			return;
		}
		settle(target);
	}
</script>

<main
	class="relative flex-1 overflow-hidden"
	onscroll={(event) => {
		// The track is positioned, never scrolled. Anything that scrolls it leaves the app between
		// two pages, so it is put back at once.
		const node = event.currentTarget;
		if (node.scrollLeft !== 0) node.scrollLeft = 0;
		if (node.scrollTop !== 0) node.scrollTop = 0;
	}}
	bind:clientWidth={width}
	use:swipe={{
		enabled: () => !settling,
		onMove: (dx) => {
			duration = 0;
			offset = damp(dx);
		},
		onEnd: release
	}}
>
	{#each visible as i (MAIN_PAGES[i])}
		{@const View = VIEWS[i]}
		<section
			class="absolute inset-0 overflow-y-auto overscroll-y-contain"
			style="transform: translate3d({slot(i) * width +
				offset}px, 0, 0); transition: transform {duration}ms {SNAP_EASE}; --header-ease: {duration}ms; {rise(
				i
			) > 0
				? `--header-shift: translateY(-${rise(i)}px)`
				: ''}"
			inert={i !== index || undefined}
			use:measure={i}
		>
			<View />
		</section>
	{/each}
</main>
