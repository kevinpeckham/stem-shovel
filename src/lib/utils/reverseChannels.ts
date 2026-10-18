/** The samples of every channel back to front: a clip played in reverse (docs/dawn-daw-plan.md, D4). New arrays. */
export function reverseChannels(channels: Float32Array[]): Float32Array[] {
	return channels.map((ch) => {
		const out = new Float32Array(ch.length);
		for (let i = 0, j = ch.length - 1; i < ch.length; i++, j--) out[i] = ch[j]!;
		return out;
	});
}
