import { hydrate } from 'svelte';
import '../styles.css';
import Terms from './Terms.svelte';

export default hydrate(Terms, { target: document.getElementById('site')! });
