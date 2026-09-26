/**
 * The scheduling loop the metronome and the drum machine share: every
 * TICK_MS, hand the callback the audio-clock time up to which events should
 * be queued (LOOKAHEAD_S ahead), so a busy page never makes the beat
 * stumble; Web Audio plays what was queued whether or not the timer fires
 * on time. Returns the function that stops the loop.
 */
const LOOKAHEAD_S = 0.1;
const TICK_MS = 25;

export function startLookahead(ctx: AudioContext, queueUntil: (until: number) => void): () => void {
	const tick = () => queueUntil(ctx.currentTime + LOOKAHEAD_S);
	tick();
	const timer = setInterval(tick, TICK_MS);
	return () => clearInterval(timer);
}
