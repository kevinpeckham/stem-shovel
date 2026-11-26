import {
	type ChromaPart,
	chromaFeatures,
	type OnsetPart,
	onsetFeatures,
} from "@barmark/listen/features";

/**
 * One part of a recording's features off the page (@barmark/listen's
 * features, which import neither barmark nor sync): the chromagram and
 * where the sound starts and ends (`chroma`), or the onset envelope
 * (`onset`). Two of these run at once on the same mix
 * (audio/alignmentWorkers.ts), the page joining the parts
 * (`joinFeatures`). A request carries the part, the recording mixed to
 * mono (transferred) and its rate; the reply carries the part (its array's
 * buffer transferred), or the reason there is none (the package's refusal,
 * in its words).
 */
export interface RecordingFeaturesRequest {
	id: number;
	part: "chroma" | "onset";
	recording: Float32Array;
	sampleRate: number;
}
export type RecordingFeaturesReply =
	| { id: number; chroma: ChromaPart }
	| { id: number; onset: OnsetPart }
	| { id: number; error: string };

/** The part asked for, or why there is none. */
function partOf({ id, part, recording, sampleRate }: RecordingFeaturesRequest) {
	if (part === "chroma") {
		const r = chromaFeatures(recording, sampleRate);
		if (!r.ok) return { reply: { id, error: r.refusals[0]!.message }, transfer: [] };
		return { reply: { id, chroma: r.value }, transfer: [r.value.chroma.buffer] };
	}
	const r = onsetFeatures(recording, sampleRate);
	if (!r.ok) return { reply: { id, error: r.refusals[0]!.message }, transfer: [] };
	return { reply: { id, onset: r.value }, transfer: [r.value.onset.buffer] };
}

self.onmessage = (e: MessageEvent<RecordingFeaturesRequest>) => {
	let answer: { reply: RecordingFeaturesReply; transfer: Transferable[] };
	try {
		answer = partOf(e.data);
	} catch (err) {
		const error = err instanceof Error ? err.message : String(err);
		answer = { reply: { id: e.data.id, error }, transfer: [] };
	}
	(self as unknown as Worker).postMessage(answer.reply, answer.transfer);
};
