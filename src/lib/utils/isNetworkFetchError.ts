/** Chrome's, Safari's and Firefox's words for a fetch that got no response at all. */
const NETWORK_FAILED =
	/^(Failed to fetch|Load failed|NetworkError when attempting to fetch resource\.?)$/;

/** Whether an error is the browser getting no response to a fetch, not the server answering badly. */
export function isNetworkFetchError(error: unknown): boolean {
	return error instanceof TypeError && NETWORK_FAILED.test(error.message);
}
