/* HTTP status codes used by routes (reference key: RFC 9110 §15). */


export const HTTP = {
	ok: 200,
	created: 201,
	noContent: 204,
	movedPermanently: 301,
	seeOther: 303,
	permanentRedirect: 308,
	badRequest: 400,
	forbidden: 403,
	notFound: 404,
	conflict: 409,
	unprocessable: 422,
	tooManyRequests: 429
};

// Maps service result codes (see $lib/result.js) to HTTP statuses.
export const HTTP_BY_RESULT_CODE = {
	invalid: HTTP.badRequest,
	not_found: HTTP.notFound,
	forbidden: HTTP.forbidden,
	conflict: HTTP.conflict,
	rate_limited: HTTP.tooManyRequests
};
