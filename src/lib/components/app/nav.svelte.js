/* Open/closed state of the organizer sidebar on small screens (shared by top bar and shell). */


export const navState = $state({ open: false });


export function toggleNav() {

	navState.open = !navState.open;
}

export function closeNav() {

	navState.open = false;
}
