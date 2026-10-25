/**
 * How long one ffmpeg run may take before it is killed (Node's execFile
 * `timeout`: SIGTERM, and the call rejects). The jobs function's
 * `maxDuration` is 300 s (src/routes/api/jobs/+server.ts), so a stuck
 * child is stopped with time left to mark its row failed; the TensorFlow
 * child in src/lib/server/notes.ts has the same bound.
 */
export const FFMPEG_TIMEOUT_MS = 240_000;
