/**
 * What a round-trip latency means to someone playing through the amp
 * (docs/practice-amp.md, "Latency"): under 15 ms feels direct, up to 30
 * is playable, beyond that the delay is in the way. Bluetooth output is
 * named outright: it adds 150 ms or more and under-reports it.
 */
export interface LatencyVerdict {
	tone: "good" | "ok" | "bad" | "unknown";
	label: string;
	advice: string;
}

export function latencyVerdict(ms: number | null, bluetooth: boolean): LatencyVerdict {
	if (bluetooth)
		return {
			tone: "bad",
			label: "Bluetooth output",
			advice:
				"Bluetooth adds well over a hundred milliseconds. Use wired headphones or the interface's own headphone jack.",
		};
	if (ms === null)
		return {
			tone: "unknown",
			label: "Not measured",
			advice:
				"Calibrate plays three clicks through the speakers and times them with the microphone.",
		};
	if (ms < 15) return { tone: "good", label: `${ms} ms: feels direct`, advice: "" };
	if (ms <= 30) return { tone: "ok", label: `${ms} ms: playable`, advice: "" };
	return {
		tone: "bad",
		label: `${ms} ms: a noticeable delay`,
		advice:
			"Check the output: wired headphones or an audio interface get this under 20 ms; a Bluetooth speaker never does.",
	};
}

/** Whether an audio device's label reads as a Bluetooth one. */
export function looksBluetooth(label: string): boolean {
	return /bluetooth|airpods|\bbuds\b|\bbeats\b|\bwh-\d|\bwf-\d|hands-?free/i.test(label);
}
