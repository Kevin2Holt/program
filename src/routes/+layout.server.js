/* Data every page needs: who is signed in, the CSRF token for forms and fetches, and the theme. */


export function load({ locals }) {

	return {
		user: locals.user,
		csrfToken: locals.csrfToken,
		theme: locals.theme
	};
}
