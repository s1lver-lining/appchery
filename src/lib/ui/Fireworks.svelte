<script lang="ts">
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	/**
	 * A record is the one moment in this app worth interrupting for. It says what was beaten, then
	 * gets out of the way on its own, because the archer is still stood on the shooting line.
	 */
	let { score, roundName, onclose }: { score: number; roundName: string; onclose: () => void } =
		$props();

	const LIFE = 4200;
	$effect(() => {
		const timer = setTimeout(onclose, LIFE);
		return () => clearTimeout(timer);
	});

	/** Three shells at different heights and times, so the sky is never lit all at once. */
	const SHELLS = [
		{ x: 26, y: 28, delay: 0, hue: 'var(--color-brand)' },
		{ x: 72, y: 20, delay: 420, hue: 'var(--color-accent)' },
		{ x: 50, y: 44, delay: 900, hue: 'var(--color-brand)' }
	];
	const SPARKS = Array.from({ length: 14 }, (_, i) => (i * 360) / 14);
</script>

<!-- Over everything and through to everything: the tap that dismisses it is the card's own. -->
<div class="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
	{#each SHELLS as shell (shell.delay)}
		{#each SPARKS as angle (angle)}
			<span
				class="spark"
				style="left: {shell.x}%; top: {shell.y}%; background: {shell.hue};
					--angle: {angle}deg; --reach: {58 + (angle % 3) * 16}px; --delay: {shell.delay + (angle % 5) * 24}ms"
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
		width: 9px;
		height: 9px;
		margin: -4.5px 0 0 -4.5px;
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
