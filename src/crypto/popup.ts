import type { DockPosition } from './options';

interface AnchorOptions { anchor?: HTMLElement; side: DockPosition; controls?: boolean }

/** 浮层朝按钮栏内侧展开；悬浮控制保持贴近主按钮，并限制在窗口内。 */
export function anchorPopup(node: HTMLElement, initial: AnchorOptions) {
    let options = initial;
    function place() {
        if (!options.anchor) return;
        const anchor = options.anchor.getBoundingClientRect();
        const gap = options.controls ? 4 : 8;
        const availableWidth = options.controls ? innerWidth - 12 : options.side === 'right' ? anchor.left - gap - 6
            : options.side === 'left' ? innerWidth - anchor.right - gap - 6 : innerWidth - 12;
        const availableHeight = options.controls ? innerHeight - 12 : options.side === 'top' ? innerHeight - anchor.bottom - gap - 6
            : options.side === 'bottom' ? anchor.top - gap - 6 : innerHeight - 12;
        node.style.maxWidth = `${Math.max(1, availableWidth)}px`;
        node.style.maxHeight = `${Math.max(1, availableHeight)}px`;
        const width = node.offsetWidth;
        const height = node.offsetHeight;
        let left = anchor.left;
        let top = anchor.top;
        if (options.controls) {
            left = options.side === 'right' ? anchor.right - width : anchor.left;
            top = options.side === 'bottom' ? anchor.top - height - gap : anchor.bottom + gap;
        } else if (options.side === 'right') left = anchor.left - width - gap;
        else if (options.side === 'left') left = anchor.right + gap;
        else if (options.side === 'top') top = anchor.bottom + gap;
        else top = anchor.top - height - gap;
        node.style.left = `${Math.max(6, Math.min(left, innerWidth - width - 6))}px`;
        node.style.top = `${Math.max(6, Math.min(top, innerHeight - height - 6))}px`;
    }
    const observer = new ResizeObserver(place);
    observer.observe(node);
    if (options.anchor) observer.observe(options.anchor);
    window.addEventListener('resize', place);
    place();
    return {
        update(next: AnchorOptions) {
            if (options.anchor) observer.unobserve(options.anchor);
            options = next;
            if (options.anchor) observer.observe(options.anchor);
            place();
        },
        destroy() { observer.disconnect(); window.removeEventListener('resize', place); },
    };
}
