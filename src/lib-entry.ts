import ChartDashboard from './pages/ChartDashboard/ChartDashboard.svelte';
import { mount } from 'svelte';

// Helper function to mount the component in non-Svelte environments (like Jupyter HTML)
export function mountDashboard(target: HTMLElement, props: any) {
    return mount(ChartDashboard, {
        target,
        props
    });
}

// Default export for ES imports
export default ChartDashboard;
