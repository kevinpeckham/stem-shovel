/**
 * One transport at a time. The home page has the stem player, the drum
 * machine and the metronome together, and a song page a player and a
 * metronome: a visitor who presses play on one and scrolls to another
 * should not hear both. A transport claims playback as it starts, which
 * stops whatever held it, and lets go as it stops. (The drums and the
 * metronome also trade places on their own, each taking the other's tempo.)
 */
interface Transport {
	stop(): void;
}
let holder: Transport | null = null;

export function claimPlayback(transport: Transport): void {
	if (holder && holder !== transport) holder.stop();
	holder = transport;
}

export function releasePlayback(transport: Transport): void {
	if (holder === transport) holder = null;
}
