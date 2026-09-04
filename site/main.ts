import { hydrate } from 'svelte';
import './styles.css';
import App from './App.svelte';

// Hydrated rather than mounted: the markup is already in the file, written by scripts/prerender-site.mjs.
export default hydrate(App, { target: document.getElementById('site')! });
