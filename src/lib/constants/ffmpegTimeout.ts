/**
 * How long one ffmpeg run may take before it is killed: `JobTuning`'s
 * default `ffmpegTimeout` for the jobs on Effect (`Effect.timeout`
 * interrupts the run and the interrupt kills the child), and the `timeout`
 * option of Node's execFile where ffmpeg still runs directly. The jobs
 * function's `maxDuration` is 300 s (src/routes/api/jobs/+server.ts), so a
 * stuck child is stopped with time left to mark its row failed; the
 * TensorFlow child in src/lib/server/notes.ts has the same bound.
 */
export const FFMPEG_TIMEOUT_MS = 240_000;
