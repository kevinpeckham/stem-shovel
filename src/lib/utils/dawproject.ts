import { stemTintHex } from "#lib/constants/stemTints.js";
import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";
import { beatsBetween } from "#lib/audio/measures.js";
import { parseLaneKey } from "./automationLanes";
import { tempoPointsGrid } from "./tempoPointsGrid";
import { tempoPointsOf } from "./tempoPointsOf";
import { clipLaneEvents } from "./clipLaneEvents";
import { clipNoteEvents } from "./clipNoteEvents";
import { studioGrid } from "./studioGrid";
import { clipSegments } from "./clipSegments";
import { warpPointsOver } from "#lib/audio/warp.js";
import { GAIN_ENVELOPE_MAX, gainEnvelopeRamps } from "./gainEnvelope";
import {
	DAWPROJECT_METADATA_FIELDS,
	type DawprojectMetadata,
} from "#lib/val/DawprojectMetadataSchema.js";

/** An audio file the DAWproject carries for a clip's source: its path inside the archive and what it is. */
export interface DawprojectAudio {
	path: string;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
}

export interface DawprojectInput {
	title: string;
	/** The rest of `metadata.xml` (val/DawprojectMetadataSchema.ts): the artist, the writers, the year, a comment… */
	metadata?: DawprojectMetadata;
	arrangement: StudioArrangement;
	/** By source id: the audio the archive holds for each audio clip (a clip whose source is missing is left out). */
	audio: Map<string, DawprojectAudio>;
	application: { name: string; version: string };
}

/**
 * A song as a DAWproject (Bitwig's open interchange format, version 1.0;
 * docs/dawn-daw-plan.md D3): `project.xml` with the transport, a track per
 * track and bus and the master (volume, pan, mute, solo, the output and
 * the sends on each channel), the arrangement's clips in seconds (an audio
 * clip over its file, a MIDI clip's notes), the volume and pan lanes as
 * automation points, the markers, the tempo and meter changes as the
 * arrangement's tempo and time-signature automation (in beats, as Bitwig
 * writes them; held steps), an audio clip's gain envelope as Points on
 * the clip's gain expression, and `metadata.xml` with the title. Pure: the
 * caller zips the two files with the audio (utils/zipBlobs.ts). Inserts
 * and their automation stay out (the format names a DAW's own devices).
 * Elements come in the schema's order (tests/dawproject/Project.xsd):
 * the unit tests validate the result against it.
 */
/** A metadata field's element name: the field capitalized (`originalArtist` is `OriginalArtist`). */
const metaTag = (field: string) => field[0]!.toUpperCase() + field.slice(1);

export function dawproject(input: DawprojectInput): { project: string; metadata: string } {
	const a = input.arrangement;
	let n = 0;
	const id = (prefix: string) => `${prefix}${++n}`;
	const esc = (s: string) =>
		s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
	const num = (v: number) => (Number.isFinite(v) ? v.toFixed(6) : "0");
	const lines: string[] = [];
	const out = (s: string) => lines.push(s);

	out('<?xml version="1.0" encoding="UTF-8"?>');
	out('<Project version="1.0">');
	out(
		`  <Application name="${esc(input.application.name)}" version="${esc(input.application.version)}"/>`,
	);
	out("  <Transport>");
	const tempoId = id("tempo");
	const timesigId = id("timesig");
	out(`    <Tempo unit="bpm" value="${num(a.bpm)}" id="${tempoId}" name="Tempo"/>`);
	out(
		`    <TimeSignature numerator="${a.beatsPerBar}" denominator="${a.beatUnit ?? 4}" id="${timesigId}"/>`,
	);
	out("  </Transport>");

	// Channels first, so a track's destination and sends can name them.
	const masterChannel = id("ch");
	const busChannel = new Map<string, string>();
	for (const b of a.buses ?? []) busChannel.set(b.id, id("ch"));
	const trackChannel = new Map<string, string>();
	const volumeParam = new Map<string, string>();
	const panParam = new Map<string, string>();
	const muteParam = new Map<string, string>();
	/** A send's volume parameter by `<ownerId>:<busId>`, for its lane. */
	const sendParam = new Map<string, string>();
	for (const t of a.tracks) trackChannel.set(t.id, id("ch"));

	const channel = (o: {
		chId: string;
		role: "regular" | "effect" | "master";
		/** One for a mono track (docs/multitrack-recorder.md "Mono tracks"); two otherwise. */
		channels?: number;
		gain: number;
		pan: number;
		muted: boolean;
		solo?: boolean;
		destination?: string;
		sends?: { destination: string; bus: string; level: number; pre?: boolean }[];
		ownerId: string;
	}) => {
		const dest = o.destination ? ` destination="${o.destination}"` : "";
		out(
			`      <Channel audioChannels="${o.channels ?? 2}" role="${o.role}" solo="${o.solo ? "true" : "false"}"${dest} id="${o.chId}">`,
		);
		const v = id("vol");
		const p = id("pan");
		const m = id("mute");
		volumeParam.set(o.ownerId, v);
		panParam.set(o.ownerId, p);
		muteParam.set(o.ownerId, m);
		// The schema's order: Mute, Pan, Sends, Volume (a strict importer refuses any other).
		out(`        <Mute value="${o.muted ? "true" : "false"}" id="${m}" name="Mute"/>`);
		out(
			`        <Pan max="1.000000" min="0.000000" unit="normalized" value="${num((o.pan + 1) / 2)}" id="${p}" name="Pan"/>`,
		);
		if (o.sends?.length) {
			out("        <Sends>");
			for (const s of o.sends) {
				out(
					`          <Send destination="${s.destination}" type="${s.pre ? "pre" : "post"}" id="${id("send")}">`,
				);
				const sv = id("sendvol");
				sendParam.set(`${o.ownerId}:${s.bus}`, sv);
				out(
					`            <Volume max="1.000000" min="0.000000" unit="linear" value="${num(s.level)}" id="${sv}" name="Send"/>`,
				);
				out("          </Send>");
			}
			out("        </Sends>");
		}
		out(
			`        <Volume max="${num(STUDIO_FADER_MAX)}" min="0.000000" unit="linear" value="${num(o.gain)}" id="${v}" name="Volume"/>`,
		);
		out("      </Channel>");
	};

	out("  <Structure>");
	const trackIds = new Map<string, string>();
	const busIds = new Set((a.buses ?? []).map((b) => b.id));
	const trackEl = (t: (typeof a.tracks)[number]) => {
		const tid = id("track");
		trackIds.set(t.id, tid);
		const color = stemTintHex(t.colour);
		out(
			`    <Track contentType="${t.kind === "midi" ? "notes" : "audio"}" loaded="true" id="${tid}" name="${esc(t.name)}"${color ? ` color="${color}"` : ""}>`,
		);
		channel({
			chId: trackChannel.get(t.id)!,
			role: "regular",
			channels: t.mono ? 1 : 2,
			gain: t.gain,
			pan: t.pan,
			muted: t.muted,
			solo: t.solo,
			destination: (t.output && busChannel.get(t.output)) || masterChannel,
			sends: (t.sends ?? [])
				.filter((s) => busChannel.has(s.bus))
				.map((s) => ({
					destination: busChannel.get(s.bus)!,
					bus: s.bus,
					level: s.level,
					pre: s.pre,
				})),
			ownerId: t.id,
		});
		out("    </Track>");
	};
	// A bus as a track with the tracks routed to it inside it, and the buses routed to it inside it too (a folder;
	// docs/multitrack-recorder.md "Folder tracks"): the format's own nesting, which readers take as a group.
	const busTrackIds = new Map<string, string>();
	const placed = new Set<string>();
	const busEl = (b: NonNullable<typeof a.buses>[number]) => {
		if (placed.has(b.id)) return;
		placed.add(b.id);
		const tid = id("track");
		busTrackIds.set(b.id, tid);
		const color = stemTintHex(b.colour);
		out(
			`    <Track contentType="audio" loaded="true" id="${tid}" name="${esc(b.name)}"${color ? ` color="${color}"` : ""}>`,
		);
		channel({
			chId: busChannel.get(b.id)!,
			role: "effect",
			gain: b.gain,
			pan: b.pan,
			muted: b.muted,
			destination: (b.output && busChannel.get(b.output)) || masterChannel,
			ownerId: b.id,
		});
		for (const t of a.tracks) if (t.output === b.id) trackEl(t);
		for (const sub of a.buses ?? []) if (sub.output === b.id) busEl(sub);
		out("    </Track>");
	};
	for (const t of a.tracks) if (!t.output || !busIds.has(t.output)) trackEl(t);
	for (const b of a.buses ?? []) if (!b.output || !busIds.has(b.output)) busEl(b);
	for (const b of a.buses ?? []) busEl(b); // a bus in a circle of outputs comes out at the top
	const masterTrackId = id("track");
	out(`    <Track contentType="audio notes" loaded="true" id="${masterTrackId}" name="Master">`);
	channel({
		chId: masterChannel,
		role: "master",
		gain: a.master,
		pan: 0,
		muted: false,
		ownerId: "master",
	});
	out("    </Track>");
	out("  </Structure>");

	out(`  <Arrangement id="${id("arr")}">`);
	out(`    <Lanes timeUnit="seconds" id="${id("lanes")}">`);
	/** The parameter a lane names, when the format has it: the volume, the pan, the mute (a bool), a send's volume; an insert's parameter has no device here. */
	const targetOf = (ownerId: string, key: string): string | undefined => {
		if (key === "volume") return volumeParam.get(ownerId);
		if (key === "pan") return panParam.get(ownerId);
		if (key === "mute") return muteParam.get(ownerId);
		const send = parseLaneKey(key);
		return send?.kind === "send" ? sendParam.get(`${ownerId}:${send.bus}`) : undefined;
	};
	const points = (ownerId: string, key: string, lane: { t: number; v: number }[]) => {
		const target = targetOf(ownerId, key);
		if (!target || !lane.length) return;
		if (key === "mute") {
			// A switch: bool points, held to the next (the mute lane's 1 is muted, the parameter's true).
			out(`        <Points id="${id("pts")}">`);
			out(`          <Target parameter="${target}"/>`);
			for (const p of lane)
				out(`          <BoolPoint time="${num(p.t)}" value="${p.v >= 0.5 ? "true" : "false"}"/>`);
			out("        </Points>");
			return;
		}
		out(`        <Points unit="${key === "pan" ? "normalized" : "linear"}" id="${id("pts")}">`);
		out(`          <Target parameter="${target}"/>`);
		for (const p of lane)
			out(
				`          <RealPoint time="${num(p.t)}" value="${num(key === "pan" ? (p.v + 1) / 2 : p.v)}" interpolation="linear"/>`,
			);
		out("        </Points>");
	};
	/** Whether a strip has a lane the format can carry. */
	const carries = (
		ownerId: string,
		automation: Record<string, { t: number; v: number }[]> | undefined,
	) => Object.entries(automation ?? {}).some(([k, lane]) => lane.length && targetOf(ownerId, k));
	const lanesOf = (
		ownerId: string,
		automation: Record<string, { t: number; v: number }[]> | undefined,
	) => {
		for (const [key, lane] of Object.entries(automation ?? {})) points(ownerId, key, lane);
	};
	const clipOf = (c: StudioClip) => {
		if (c.notes) {
			const events = clipNoteEvents({ ...c, start: 0, offset: c.offset, gain: 1 });
			out(
				`          <Clip time="${num(c.start)}" duration="${num(c.duration)}" contentTimeUnit="seconds" playStart="0.000000"${c.muted ? ' enable="false"' : ""} name="${esc(c.name)}">`,
			);
			out(`            <Notes id="${id("notes")}">`);
			for (const e of events)
				out(
					`              <Note time="${num(e.at)}" duration="${num(e.duration)}" channel="0" key="${e.pitch}" vel="${num(e.velocity)}" rel="${num(e.velocity)}"/>`,
				);
			out("            </Notes>");
			// The expression lanes as the format's own: Points on an expression target, held to the next (Bitwig's CC lanes), from the clip's start.
			const byLane = new Map<
				string,
				{ expression: string; controller?: number; points: { t: number; v: number }[] }
			>();
			for (const e of clipLaneEvents({ ...c, start: 0 })) {
				const key = e.kind === "cc" ? `cc:${e.controller}` : e.kind;
				const lane =
					byLane.get(key) ??
					byLane
						.set(key, {
							expression:
								e.kind === "cc"
									? "channelController"
									: e.kind === "bend"
										? "pitchBend"
										: "channelPressure",
							controller: e.controller,
							points: [],
						})
						.get(key)!;
				if (e.at < c.duration) lane.points.push({ t: e.at, v: e.value });
			}
			for (const lane of byLane.values()) {
				out(`            <Points unit="normalized" id="${id("pts")}">`);
				out(
					`              <Target expression="${lane.expression}" channel="0"${lane.controller !== undefined ? ` controller="${lane.controller}"` : ""}/>`,
				);
				for (const p of lane.points)
					out(
						`              <RealPoint time="${num(p.t)}" value="${num(p.v)}" interpolation="hold"/>`,
					);
				out("            </Points>");
			}
			out("          </Clip>");
			return;
		}
		const audio = c.sourceId ? input.audio.get(c.sourceId) : undefined;
		if (!audio) return;
		// A looped clip says so in the format's own words (loopStart/loopEnd in content seconds); its notes are unrolled above.
		const loop = c.loop ? ` loopStart="${num(c.loop.start)}" loopEnd="${num(c.loop.end)}"` : "";
		// The clip's content: its Audio, inside Warps when warped (docs/multitrack-recorder.md "Warping a clip"), a Warp per
		// point mapping the clip's content seconds to the file's, from zero to the end of what the clip plays.
		const content = (file: DawprojectAudio, warp: StudioClip["warp"], indent: string) => {
			const pad = (warp ? "  " : "") + indent;
			if (warp) out(`${indent}            <Warps contentTimeUnit="seconds" id="${id("warps")}">`);
			out(
				`${pad}            <Audio algorithm="${warp ? "stretch" : "raw"}" channels="${file.channels}" duration="${num(file.durationSeconds)}" sampleRate="${file.sampleRate}" id="${id("audio")}">`,
			);
			out(`${pad}              <File path="${esc(file.path)}"/>`);
			out(`${pad}            </Audio>`);
			if (warp) {
				const end = clipSegments(c).reduce((m, s) => Math.max(m, s.offset + s.duration), 0);
				for (const p of warpPointsOver(warp, end))
					out(`${indent}              <Warp time="${num(p.at)}" contentTime="${num(p.source)}"/>`);
				out(`${indent}            </Warps>`);
			}
		};
		// The gain envelope (docs/multitrack-recorder.md "Clip gain envelopes") as Points on the clip's gain expression beside
		// its content, the way Bitwig keeps a notes clip's controller lanes beside its Notes (FINDINGS.md): a linear factor
		// (1 is unity, 0..2), linear between points. The Points are part of the clip's content timeline, whose time is the
		// clip's content seconds (playStart is the offset, a Warp's `time` is the same seconds), so a point's time is its `t`
		// as it stands, and over the span the clip plays (every pass's), a point at each end so the held ends come through.
		// A looped clip keeps its loop: loopStart/loopEnd loop the content timeline, Points and all, so the line replays each
		// pass as Dawn's does (Reaper's take envelope runs once down the item, so rpp.ts unrolls instead).
		const gainPoints = (indent: string) => {
			const segments = clipSegments(c);
			const from = Math.min(...segments.map((s) => s.offset));
			const to = Math.max(...segments.map((s) => s.offset + s.duration));
			const ramps = gainEnvelopeRamps(c.gainEnvelope, from, to);
			if (!ramps.length) return;
			out(`${indent}            <Points unit="linear" id="${id("pts")}">`);
			out(`${indent}              <Target expression="gain"/>`);
			for (const p of ramps)
				out(
					`${indent}              <RealPoint time="${num(p.t)}" value="${num(Math.max(0, Math.min(GAIN_ENVELOPE_MAX, p.v)))}" interpolation="linear"/>`,
				);
			out(`${indent}            </Points>`);
		};
		// The clip's other takes (docs/multitrack-recorder.md "Takes in the files"): the clip holds Lanes, one per take
		// with the take as a clip over its file at the clip's offset, the chosen take first; a reader without the idea
		// sees lanes of clips inside a clip, which the format allows.
		const takes = (c.alternates ?? []).filter((altId) => input.audio.has(altId));
		// A switched-off clip is the format's enable="false".
		out(
			`          <Clip time="${num(c.start)}" duration="${num(c.duration)}" contentTimeUnit="seconds" playStart="${num(takes.length ? 0 : c.offset)}"${loop}${c.muted ? ' enable="false"' : ""} fadeTimeUnit="seconds" fadeInTime="${num(c.fadeIn)}" fadeOutTime="${num(c.fadeOut)}" name="${esc(c.name)}">`,
		);
		if (takes.length) {
			out(`            <Lanes timeUnit="seconds" id="${id("lanes")}">`);
			// The gain line rides the chosen take, as in Reaper; the alternates play without it.
			const take = (
				file: DawprojectAudio,
				name: string,
				warp: StudioClip["warp"],
				chosen = false,
			) => {
				out(`              <Lanes id="${id("lane")}">`);
				out(`                <Clips id="${id("clips")}">`);
				out(
					`                  <Clip time="0.000000" duration="${num(c.duration)}" contentTimeUnit="seconds" playStart="${num(c.offset)}" name="${esc(name)}">`,
				);
				content(file, warp, "        ");
				if (chosen) gainPoints("        ");
				out("                  </Clip>");
				out("                </Clips>");
				out("              </Lanes>");
			};
			take(audio, c.name, c.warp, true);
			takes.forEach((altId, i) =>
				take(input.audio.get(altId)!, `${c.name} (take ${i + 2})`, undefined),
			);
			out("            </Lanes>");
		} else {
			content(audio, c.warp, "");
			gainPoints("");
		}
		out("          </Clip>");
	};
	for (const t of a.tracks) {
		out(`      <Lanes track="${trackIds.get(t.id)}" id="${id("lane")}">`);
		const clips = a.clips.filter((c) => c.trackId === t.id);
		if (clips.length) {
			out(`        <Clips id="${id("clips")}">`);
			for (const c of clips) clipOf(c);
			out("        </Clips>");
		}
		lanesOf(t.id, t.automation);
		out("      </Lanes>");
	}
	for (const b of a.buses ?? []) {
		if (!carries(b.id, b.automation)) continue;
		out(`      <Lanes track="${busTrackIds.get(b.id)}" id="${id("lane")}">`);
		lanesOf(b.id, b.automation);
		out("      </Lanes>");
	}
	// The master's own lanes (its volume and mute; it has no pan here).
	if (carries("master", a.masterAutomation)) {
		out(`      <Lanes track="${masterTrackId}" id="${id("lane")}">`);
		lanesOf("master", a.masterAutomation);
		out("      </Lanes>");
	}
	out("    </Lanes>");
	// After the lanes, in the schema's order: the markers (seconds), then the tempo and meter
	// changes as held points in beats, the way Bitwig writes its own and Dawn's reader takes them.
	const markers = [...(a.markers ?? [])].sort((x, y) => x.t - y.t);
	if (markers.length) {
		out(`    <Markers timeUnit="seconds" id="${id("markers")}">`);
		for (const m of markers) out(`      <Marker time="${num(m.t)}" name="${esc(m.name)}"/>`);
		out("    </Markers>");
	}
	const tempoChanges = (a.tempoChanges ?? [])
		.filter((c) => c.start > 0)
		.sort((x, y) => x.start - y.start);
	// A point's interpolation runs from it to the next: "linear" before a ramp. A ramp that is linear in seconds
	// (Reaper's kind) is laid down as a point per bar line, each linear to the next, which follows it closely; the
	// beats below go through the grid those points make, so they land where the DAW will put them.
	const tempoPoints = tempoPointsOf(studioGrid(a), a.bpm, tempoChanges);
	const grid = tempoPointsGrid(tempoPoints, "beats", a);
	const beat = (seconds: number) => beatsBetween(grid, 0, seconds);
	if (tempoChanges.length) {
		out(`    <TempoAutomation unit="bpm" timeUnit="beats" id="${id("tempoauto")}">`);
		out(`      <Target parameter="${tempoId}"/>`);
		for (const p of tempoPoints)
			out(
				`      <RealPoint time="${num(beat(p.start))}" value="${num(p.bpm)}" interpolation="${p.linear ? "linear" : "hold"}"/>`,
			);
		out("    </TempoAutomation>");
	}
	const meterChanges = (a.meterChanges ?? [])
		.filter((c) => c.start > 0)
		.sort((x, y) => x.start - y.start);
	if (meterChanges.length) {
		out(`    <TimeSignatureAutomation timeUnit="beats" id="${id("sigauto")}">`);
		out(`      <Target parameter="${timesigId}"/>`);
		out(
			`      <TimeSignaturePoint time="0.000000" numerator="${a.beatsPerBar}" denominator="${a.beatUnit ?? 4}"/>`,
		);
		for (const c of meterChanges)
			out(
				`      <TimeSignaturePoint time="${num(beat(c.start))}" numerator="${c.beatsPerBar}" denominator="${c.beatUnit ?? 4}"/>`,
			);
		out("    </TimeSignatureAutomation>");
	}
	out("  </Arrangement>");
	out("</Project>");

	// The metadata in the schema's order (tests/dawproject/MetaData.xsd); an empty field is left out.
	const metadata = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		"<MetaData>",
		`  <Title>${esc(input.title)}</Title>`,
		...DAWPROJECT_METADATA_FIELDS.filter((f) => input.metadata?.[f]?.trim()).map(
			(f) => `  <${metaTag(f)}>${esc(input.metadata![f]!.trim())}</${metaTag(f)}>`,
		),
		"</MetaData>",
		"",
	].join("\n");
	return { project: lines.join("\n") + "\n", metadata };
}
