<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import { awardBadges, listBadges, loadBadgeInput } from '$lib/db/repository';
	import { evaluateBadges, sortBadges, type BadgeFamily, type EarnedBadge } from '$lib/domain/badges';
	import { badgeDetailView } from '$lib/prefs';
	import { originOf, setPageUp } from '$lib/nav';
	import Icon from '$lib/ui/Icon.svelte';
	import MoreMenu from '$lib/ui/MoreMenu.svelte';
	import PageHeader from '$lib/ui/PageHeader.svelte';
	import BadgeCard from '$lib/ui/BadgeCard.svelte';
	import BadgeGlyph from '$lib/ui/BadgeGlyph.svelte';
	import BadgeDialog from '$lib/ui/BadgeDialog.svelte';

	// Reached from the stats menu and from the settings page, so back goes where the link came from.
	const origin = $derived(originOf($page.url, '/stats'));
	$effect(() => setPageUp(origin));

	const FAMILIES: BadgeFamily[] = [
		'volume',
		'habit',
		'record',
		'accuracy',
		'milestone',
		'training',
		'ffta'
	];

	let badges = $state<EarnedBadge[]>([]);
	let opened = $state<EarnedBadge | null>(null);

	/**
	 * The stored rows decide what is earned, not the rules: a badge is kept once won, so a round
	 * deleted afterwards leaves it standing. The rules are still run, for the progress on the rest.
	 */
	async function refresh() {
		// Read once and used twice: awarding and measuring progress ask the same question of the data.
		const history = await loadBadgeInput();
		await awardBadges(history);
		const held = new Map((await listBadges()).map((row) => [row.key, row.earnedAt]));
		badges = evaluateBadges(history).map((badge) => ({
			...badge,
			earnedAt: held.get(badge.definition.key) ?? null
		}));
	}

	$effect(() => {
		refresh();
	});

	const earned = $derived(badges.filter((badge) => badge.earnedAt !== null).length);
	const inFamily = (family: BadgeFamily) =>
		sortBadges(badges.filter((badge) => badge.definition.family === family));
</script>

<PageHeader motif="badges" title={$t('badges.title')} subtitle={$t('badges.hint')}>
	{#snippet lead()}
		<a href={origin} class="-ml-1 inline-flex text-muted" aria-label={$t('common.back')}>
			<Icon name="back" size={22} />
		</a>
	{/snippet}
	{#snippet actions()}
		<MoreMenu
			label={$t('common.more')}
			icon="dots"
			placement="down"
			wrapperClass=""
			triggerClass="flex items-center justify-center rounded-lg p-1.5 text-muted"
			items={[
				{
					label: $t($badgeDetailView ? 'badges.viewGrid' : 'badges.viewDetail'),
					icon: $badgeDetailView ? 'grid' : 'list',
					onselect: () => badgeDetailView.set(!$badgeDetailView)
				}
			]}
		/>
	{/snippet}
</PageHeader>

<div class="mx-auto w-full max-w-2xl space-y-6 p-4">
	<p class="text-sm text-muted">
		{$t('badges.earnedCount', { n: earned, total: badges.length })}
	</p>

	{#each FAMILIES as family (family)}
		{@const list = inFamily(family)}
		{#if list.length > 0}
			<section>
				<h2 class="mb-2 text-sm font-semibold text-muted">{$t(`badges.families.${family}`)}</h2>
				{#if $badgeDetailView}
					<div class="space-y-2">
						{#each list as badge (badge.definition.key)}
							<BadgeCard {badge} />
						{/each}
					</div>
				{:else}
					<!-- Icon over name, four across: the wall of badges is the point of the default view. -->
					<div class="grid grid-cols-4 gap-2">
						{#each list as badge (badge.definition.key)}
							<button
								class="press flex flex-col items-center gap-1.5 rounded-xl border p-2 text-center {badge.earnedAt !==
								null
									? 'border-accent/40 bg-surface'
									: 'border-line bg-surface/60'}"
								onclick={() => (opened = badge)}
							>
								<BadgeGlyph {badge} size={30} />
								<span
									class="text-[11px] leading-tight {badge.earnedAt !== null ? '' : 'text-muted'}"
								>
									{$t(`badges.list.${badge.definition.key}.name`)}
								</span>
							</button>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	{/each}
</div>

{#if opened}
	<BadgeDialog badge={opened} onclose={() => (opened = null)} />
{/if}
