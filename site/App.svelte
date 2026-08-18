<script lang="ts">
	import Footer from './lib/Footer.svelte';
	import Nav from './lib/Nav.svelte';
	import Badges from './sections/Badges.svelte';
	import Camera from './sections/Camera.svelte';
	import Cta from './sections/Cta.svelte';
	import Hero from './sections/Hero.svelte';
	import Plot from './sections/Plot.svelte';
	import Privacy from './sections/Privacy.svelte';
	import Stats from './sections/Stats.svelte';
	import Training from './sections/Training.svelte';
</script>

<div class="min-h-full bg-bg text-ink">
	<Nav />
	<main>
		<Hero />
		<Plot />
		<Camera />
		<Stats />
		<Training />
		<Badges />
		<Privacy />
		<Cta />
	</main>
	<Footer />
</div>
