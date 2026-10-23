import type { StudioArrangement } from "#lib/val/StudioSchema.js";

/**
 * The song's markers and its tempo, meter and key changes as an Audacity
 * label track (File > Import > Labels: one label a line, start and end in
 * seconds then the text, tab-separated). Audacity has no tempo map, key
 * or marker of its own, so the labels are where a Dawn song's structure
 * lands there (docs/daw-interop-plan.md). Sorted by time; the song's own
 * tempo, meter and key come first as labels at zero.
 */
export function audacityLabels(a: StudioArrangement): string {
	const lines: { t: number; text: string }[] = [
		{ t: 0, text: `Tempo ${trim(a.bpm)}` },
		{ t: 0, text: `Meter ${a.beatsPerBar}/${a.beatUnit ?? 4}` },
	];
	if (a.key) lines.push({ t: 0, text: `Key ${a.key}` });
	for (const c of a.tempoChanges ?? [])
		if (c.start > 0)
			lines.push({ t: c.start, text: `Tempo ${trim(c.bpm)}${c.ramp ? " (ramp)" : ""}` });
	for (const c of a.meterChanges ?? [])
		if (c.start > 0) lines.push({ t: c.start, text: `Meter ${c.beatsPerBar}/${c.beatUnit ?? 4}` });
	for (const c of a.keyChanges ?? [])
		if (c.start > 0) lines.push({ t: c.start, text: `Key ${c.key}` });
	for (const m of a.markers ?? []) lines.push({ t: m.t, text: m.name });
	return lines
		.sort((x, y) => x.t - y.t)
		.map((l) => `${l.t.toFixed(6)}\t${l.t.toFixed(6)}\t${l.text.replace(/[\t\r\n]+/g, " ")}`)
		.join("\n")
		.concat("\n");
}

const trim = (n: number) => String(Math.round(n * 100) / 100);
