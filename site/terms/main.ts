import { hydrate } from 'svelte';
import { locale } from '$lib/i18n';
import { localeOf } from '../lib/routes';
import '../styles.css';
import Terms from './Terms.svelte';

/**
 * The address decides the language, ahead of the browser's own preference: each language is its own
 * page, and a French browser landing on the English URL has to be given the page it asked for, both
 * because that is the one a crawler indexed and because the markup it is hydrating is that one.
 */
locale.set(localeOf(window.location.pathname));

export default hydrate(Terms, { target: document.getElementById('site')! });
