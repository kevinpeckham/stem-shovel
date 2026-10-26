/**
 * The stereo fill before a recording destination (static/worklets/stereo-fill.js,
 * docs/uploads-and-blob.md "The session recorder"): a mono input reaches
 * both channels of the stereo file a `MediaRecorder` writes, a stereo
 * input passes. The module is added to a context once.
 */
const loaded = new WeakMap<BaseAudioContext, Promise<void>>();

export async function stereoFill(ctx: BaseAudioContext): Promise<AudioWorkletNode> {
	let loading = loaded.get(ctx);
	if (!loading) {
		loading = ctx.audioWorklet.addModule("/worklets/stereo-fill.js");
		loaded.set(ctx, loading);
	}
	await loading;
	return new AudioWorkletNode(ctx, "stereo-fill", {
		numberOfInputs: 1,
		numberOfOutputs: 1,
		outputChannelCount: [2],
		channelCount: 2,
		channelCountMode: "max",
	});
}
