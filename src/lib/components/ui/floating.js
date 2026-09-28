/*
	Shared behavior for popovers (select, combobox, date/time pickers, menus):
	close on outside pointer or Escape, and open upward when there is no room
	below.
*/


const POPOVER_GAP_PX = 8;


// Svelte action: calls onDismiss(reason) on outside pointerdown or Escape.
export function dismissable(node, onDismiss) {

	let handler = onDismiss;

	function handlePointerDown(event) {

		if (!node.contains(event.target)) {
			handler("outside");
		}
	}

	function handleKeydown(event) {

		if (event.key === "Escape") {
			event.stopPropagation();
			handler("escape");
		}
	}

	document.addEventListener("pointerdown", handlePointerDown, true);
	node.addEventListener("keydown", handleKeydown);
	return {
		update(next) {

			handler = next;
		},
		destroy() {

			document.removeEventListener("pointerdown", handlePointerDown, true);
			node.removeEventListener("keydown", handleKeydown);
		}
	};
}

// Svelte action on the popover: flips it above the trigger if it would overflow the viewport.
export function placePopover(node) {

	const rect = node.getBoundingClientRect();
	const anchor = node.parentElement.getBoundingClientRect();
	const spaceBelow = window.innerHeight - anchor.bottom;
	const spaceAbove = anchor.top;
	if (rect.height + POPOVER_GAP_PX > spaceBelow && spaceAbove > spaceBelow) {
		node.classList.add("popover--up");
	}
	if (rect.right > window.innerWidth - POPOVER_GAP_PX) {
		node.classList.add("popover--right");
	}
}
