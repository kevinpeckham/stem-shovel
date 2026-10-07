/** Seconds [from, to) of a buffer as a buffer of its own (a loop pass of a take, a punch region), made in the given context. */
export function sliceBuffer(
	ctx: BaseAudioContext,
	buffer: AudioBuffer,
	from: number,
	to: number,
): AudioBuffer {
	const sr = buffer.sampleRate;
	const a = Math.max(0, Math.round(from * sr));
	const b = Math.min(buffer.length, Math.round(to * sr));
	const out = ctx.createBuffer(buffer.numberOfChannels, Math.max(1, b - a), sr);
	for (let c = 0; c < buffer.numberOfChannels; c++)
		out.getChannelData(c).set(buffer.getChannelData(c).subarray(a, b));
	return out;
}
