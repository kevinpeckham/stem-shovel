import type { StudioArrangement, StudioClip, StudioTrack } from "#lib/val/StudioSchema.js";

/**
 * What changed between two arrangements, in words (docs/dawn-daw-plan.md,
 * D7: "Compare with now" on a revision): tracks added, removed, renamed
 * or re-set (level, pan, mute, solo, input, inserts, automation), clips
 * added, removed, moved, trimmed or re-set, buses and markers come and
 * gone, the tempo, meter and master. Pure, over the documents; the
 * order is stable so a test reads it. Empty when nothing differs.
 */
export function diffArrangements(before: StudioArrangement, after: StudioArrangement): string[] {
	const out: string[] = [];
	const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	const t = (s: number) => `${s.toFixed(2)} s`;
	if (before.bpm !== after.bpm) out.push(`Tempo ${before.bpm} → ${after.bpm} bpm`);
	if (before.beatsPerBar !== after.beatsPerBar || (before.beatUnit ?? 4) !== (after.beatUnit ?? 4))
		out.push(
			`Meter ${before.beatsPerBar}/${before.beatUnit ?? 4} → ${after.beatsPerBar}/${after.beatUnit ?? 4}`,
		);
	if (
		!same(before.tempoChanges, after.tempoChanges) ||
		!same(before.meterChanges, after.meterChanges)
	)
		out.push("Tempo map changed");
	if (before.master !== after.master)
		out.push(`Master ${Math.round(before.master * 100)}% → ${Math.round(after.master * 100)}%`);
	if (!same(before.masterInserts, after.masterInserts)) out.push("Master inserts changed");
	if (!same(before.masterAutomation, after.masterAutomation)) out.push("Master automation changed");

	const name = (tr: StudioTrack) => tr.name || "a track";
	const beforeTracks = new Map(before.tracks.map((x) => [x.id, x]));
	const afterTracks = new Map(after.tracks.map((x) => [x.id, x]));
	for (const tr of after.tracks) if (!beforeTracks.has(tr.id)) out.push(`Track ${name(tr)} added`);
	for (const tr of before.tracks)
		if (!afterTracks.has(tr.id)) out.push(`Track ${name(tr)} removed`);
	for (const tr of after.tracks) {
		const was = beforeTracks.get(tr.id);
		if (!was) continue;
		const changes: string[] = [];
		if (was.name !== tr.name) changes.push(`renamed from ${was.name || "a track"}`);
		if (was.gain !== tr.gain) changes.push("level");
		if (was.pan !== tr.pan) changes.push("pan");
		if (was.muted !== tr.muted) changes.push(tr.muted ? "muted" : "unmuted");
		if (was.solo !== tr.solo) changes.push(tr.solo ? "soloed" : "unsoloed");
		if (!same(was.input, tr.input)) changes.push("input");
		if (!same(was.inserts ?? was.fx, tr.inserts ?? tr.fx)) changes.push("inserts");
		if (!same(was.automation, tr.automation)) changes.push("automation");
		if (!same(was.sends, tr.sends) || was.output !== tr.output) changes.push("routing");
		if (!same(was.sampler, tr.sampler)) changes.push("sampler");
		if ((was.swing ?? 0) !== (tr.swing ?? 0) || (was.humanize ?? 0) !== (tr.humanize ?? 0))
			changes.push("feel");
		if (changes.length) out.push(`Track ${name(tr)}: ${changes.join(", ")}`);
	}
	if (
		before.tracks.length === after.tracks.length &&
		before.tracks.every((x) => afterTracks.has(x.id)) &&
		before.tracks.some((x, i) => x.id !== after.tracks[i]?.id)
	)
		out.push("Tracks reordered");

	const clipName = (c: StudioClip) => c.name || "a clip";
	const trackOf = (c: StudioClip) =>
		afterTracks.get(c.trackId)?.name ?? beforeTracks.get(c.trackId)?.name ?? "a track";
	const beforeClips = new Map(before.clips.map((c) => [c.id, c]));
	const afterClips = new Map(after.clips.map((c) => [c.id, c]));
	let added = 0;
	let removed = 0;
	for (const c of after.clips) if (!beforeClips.has(c.id)) added++;
	for (const c of before.clips) if (!afterClips.has(c.id)) removed++;
	if (added) out.push(`${added} ${added === 1 ? "clip" : "clips"} added`);
	if (removed) out.push(`${removed} ${removed === 1 ? "clip" : "clips"} removed`);
	for (const c of after.clips) {
		const was = beforeClips.get(c.id);
		if (!was) continue;
		const changes: string[] = [];
		if (was.trackId !== c.trackId) changes.push(`moved to ${trackOf(c)}`);
		if (was.start !== c.start) changes.push(`moved ${t(was.start)} → ${t(c.start)}`);
		if (was.offset !== c.offset || was.duration !== c.duration) changes.push("trimmed");
		if (!!was.muted !== !!c.muted) changes.push(c.muted ? "switched off" : "switched on");
		if (!!was.loop !== !!c.loop) changes.push(c.loop ? "looped" : "loop off");
		else if (was.loop && c.loop && (was.loop.start !== c.loop.start || was.loop.end !== c.loop.end))
			changes.push("loop moved");
		if (was.gain !== c.gain) changes.push("gain");
		if (was.fadeIn !== c.fadeIn || was.fadeOut !== c.fadeOut || was.fadeShape !== c.fadeShape)
			changes.push("fades");
		if (was.sourceId !== c.sourceId) changes.push("another take");
		if (!same(was.notes, c.notes)) changes.push("notes");
		if (!same(was.lanes, c.lanes)) changes.push("expression");
		if (was.name !== c.name) changes.push(`renamed from ${clipName(was)}`);
		if (changes.length) out.push(`Clip ${clipName(c)}: ${changes.join(", ")}`);
	}

	const beforeBuses = new Map((before.buses ?? []).map((b) => [b.id, b]));
	const afterBuses = new Map((after.buses ?? []).map((b) => [b.id, b]));
	for (const b of after.buses ?? []) if (!beforeBuses.has(b.id)) out.push(`Bus ${b.name} added`);
	for (const b of before.buses ?? []) if (!afterBuses.has(b.id)) out.push(`Bus ${b.name} removed`);
	for (const b of after.buses ?? []) {
		const was = beforeBuses.get(b.id);
		if (was && !same(was, b)) out.push(`Bus ${b.name} changed`);
	}
	const beforeMarkers = before.markers ?? [];
	const afterMarkers = after.markers ?? [];
	if (!same(beforeMarkers, afterMarkers)) {
		const d = afterMarkers.length - beforeMarkers.length;
		out.push(
			d > 0
				? `${d} ${d === 1 ? "marker" : "markers"} added`
				: d < 0
					? `${-d} ${-d === 1 ? "marker" : "markers"} removed`
					: "Markers changed",
		);
	}
	return out;
}
