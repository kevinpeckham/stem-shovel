/**
 * How long one ffmpeg run may take before it is killed: `JobTuning`'s
 * default `ffmpegTimeout` for the jobs on Effect (`Effect.timeout`
 * interrupts the run and the interrupt kills the child), and the `timeout`
 * option of Node's execFile where ffmpeg still runs directly. The jobs
 * function's `maxDuration` is 800 s (src/routes/api/jobs/+server.ts), so a
 * stuck child is stopped with time left to mark its row failed; the
 * TensorFlow child in src/lib/server/notes.ts has the same bound. Ten
 * minutes covers a three-hour show's encode at a function's speed
 * (2026-10-28: a 650 MB FLAC, about 170 minutes, encodes in 90 s on a
 * 16-core VM; the function is slower).
 */
export const FFMPEG_TIMEOUT_MS = 600_000;
