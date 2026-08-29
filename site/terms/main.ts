import { mount } from 'svelte';
import '../styles.css';
import Terms from './Terms.svelte';

export default mount(Terms, { target: document.getElementById('site')! });
