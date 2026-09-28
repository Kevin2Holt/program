/* Route matcher: only these program actions exist. */


const PUBLISH_ACTIONS = ["publish", "unpublish", "rollback"];


export function match(param) {

	return PUBLISH_ACTIONS.includes(param);
}
