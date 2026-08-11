<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import { closeOnBack } from './dismiss.svelte';

	/**
	 * A record is the one moment in this app worth interrupting for. It says what was beaten, then
	 * gets out of the way on its own, because the archer is still stood on the shooting line.
	 */
	let { score, roundName, onclose }: { score: number; roundName: string; onclose: () => void } =
		$props();

	// A record is dismissed by the back key like anything else sitting on top of the page.
	closeOnBack(
		() => true,
		() => onclose()
	);

	const LIFE = 5600;
	$effect(() => {
		const timer = setTimeout(onclose, LIFE);
		return () => clearTimeout(timer);
	});

	/** A volley rather than one bang: shells go up across the screen, none of them together. */
	const SHELLS = [
		{ x: 26, y: 30, delay: 0, size: 1, hue: 'var(--color-brand)' },
		{ x: 72, y: 20, delay: 260, size: 1.2, hue: 'var(--color-accent)' },
		{ x: 50, y: 46, delay: 620, size: 0.85, hue: 'var(--color-brand)' },
		{ x: 14, y: 58, delay: 980, size: 0.7, hue: 'var(--color-accent)' },
		{ x: 86, y: 52, delay: 1260, size: 0.8, hue: 'var(--color-brand)' },
		{ x: 40, y: 14, delay: 1640, size: 1.1, hue: 'var(--color-accent)' },
		{ x: 64, y: 66, delay: 2040, size: 0.9, hue: 'var(--color-brand)' },
		{ x: 30, y: 74, delay: 2420, size: 1, hue: 'var(--color-accent)' }
	];
	const SPARKS = Array.from({ length: 18 }, (_, i) => (i * 360) / 18);
</script>

<!-- Over everything and through to everything: the tap that dismisses it is the card's own. -->
<div class="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
	{#each SHELLS as shell (shell.delay)}
		{#each SPARKS as angle (angle)}
			<span
				class="spark"
				style="left: {shell.x}%; top: {shell.y}%; background: {shell.hue};
					--angle: {angle}deg; --reach: {(64 + (angle % 3) * 18) * shell.size}px;
					--size: {8 * shell.size}px; --delay: {shell.delay + (angle % 5) * 22}ms"
			></span>
		{/each}
	{/each}

	<div class="absolute inset-x-0 top-[22%] flex justify-center px-6">
		<button
			class="pointer-events-auto card flex items-center gap-3 rounded-2xl border border-accent/50 bg-surface/95 px-5 py-4 shadow-2xl backdrop-blur"
			onclick={onclose}
		>
			<span class="text-accent"><Icon name="medal" size={30} filled /></span>
			<span class="text-left">
				<span class="block text-[11px] font-semibold tracking-wide text-accent uppercase">
					{$t('home.newBest')}
				</span>
				<span class="block truncate text-base font-bold">{roundName}</span>
			</span>
			<span class="tabular text-3xl leading-none font-bold">{score}</span>
		</button>
	</div>
</div>

<style>
	.spark {
		position: absolute;
		width: var(--size, 8px);
		height: var(--size, 8px);
		margin: calc(var(--size, 8px) / -2) 0 0 calc(var(--size, 8px) / -2);
		border-radius: 999px;
		opacity: 0;
		animation: burst 1400ms var(--delay, 0ms) cubic-bezier(0.15, 0.75, 0.35, 1) forwards;
	}

	/* Thrown out along its own angle, then falling: a spark that only flies out reads as a star. */
	@keyframes burst {
		0% {
			opacity: 0;
			transform: rotate(var(--angle)) translateX(0) scale(0.4);
		}
		12% {
			opacity: 1;
		}
		70% {
			opacity: 1;
			transform: rotate(var(--angle)) translateX(var(--reach)) translateY(10px) scale(1);
		}
		100% {
			opacity: 0;
			transform: rotate(var(--angle)) translateX(calc(var(--reach) * 1.1)) translateY(46px) scale(0.3);
		}
	}

	.card {
		animation: rise 420ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(14px) scale(0.94);
		}
	}

	/* Nothing moves for someone who asked for nothing to move: the card still says what happened. */
	@media (prefers-reduced-motion: reduce) {
		.spark {
			display: none;
		}
		.card {
			animation: none;
		}
	}
</style>
