import { mount } from 'svelte';
import CryptoDashboard from './CryptoDashboard.svelte';
import './app.css';

mount(CryptoDashboard, { target: document.getElementById('app')! });
