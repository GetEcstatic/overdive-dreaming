/**
 * Move an element to `document.body`. For sheets opened from inside cards:
 * an ancestor with `transform`, `filter` or `backdrop-filter` turns
 * `position: fixed` into "fixed to that ancestor", and `overflow: hidden`
 * then clips it.
 */
export function portal(node: HTMLElement): { destroy: () => void } {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
