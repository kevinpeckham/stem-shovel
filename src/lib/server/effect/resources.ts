import * as Effect from "effect/Effect";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * A fresh directory under the system temp dir (`<prefix>XXXXXX`), removed
 * with everything in it when the scope closes: on success, failure and
 * interruption alike.
 */
export function tempDir(prefix: string) {
	return Effect.acquireRelease(
		Effect.promise(() => mkdtemp(join(tmpBase(), prefix))),
		(dir) => Effect.promise(() => rm(dir, { recursive: true, force: true })),
	);
}

/**
 * The system temp dir, behind a function of its own: the Vercel adapter's
 * file tracer evaluates `join(tmpdir(), prefix)` with a dynamic prefix as a
 * glob over all of /tmp and fails the build on a socket there.
 */
function tmpBase() {
	return tmpdir();
}
