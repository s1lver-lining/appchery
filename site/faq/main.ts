import { hydrate } from 'svelte';
import { locale } from '$lib/i18n';
import { localeOf } from '../lib/routes';
import '../styles.css';
import Faq from './Faq.svelte';

locale.set(localeOf(window.location.pathname));

export default hydrate(Faq, { target: document.getElementById('site')! });
