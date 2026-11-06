/** Chrome's, Firefox's and Safari's words for a dynamic import that could not load. */
const CHUNK_LOAD_FAILED =
	/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/;

/** Whether an error is the browser failing to load a build's chunk, not the chunk's code failing. */
export function isChunkLoadError(error: unknown): boolean {
	return error instanceof Error && CHUNK_LOAD_FAILED.test(error.message);
}
