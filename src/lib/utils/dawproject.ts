import { stemTintHex } from "#lib/constants/stemTints.js";
import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
import type { StudioArrangement, StudioClip } from "#lib/val/StudioSchema.js";
import { beatsBetween } from "#lib/audio/measures.js";
import { clipNoteEvents } from "./clipNoteEvents";
import { studioGrid } from "./studioGrid";

/** An audio file the DAWproject carries for a clip's source: its path inside the archive and what it is. */
export interface DawprojectAudio {
	path: string;
	durationSeconds: number;
	sampleRate: number;
	channels: number;
}

export interface DawprojectInput {
	title: string;
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
 * writes them; held steps), and `metadata.xml` with the title. Pure: the
 * caller zips the two files with the audio (utils/zipBlobs.ts). Inserts
 * and their automation stay out (the format names a DAW's own devices).
 * Elements come in the schema's order (tests/dawproject/Project.xsd):
 * the unit tests validate the result against it.
 */
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
	out(`    <TimeSignature numerator="${a.beatsPerBar}" denominator="4" id="${timesigId}"/>`);
	out("  </Transport>");

	// Channels first, so a track's destination and sends can name them.
	const masterChannel = id("ch");
	const busChannel = new Map<string, string>();
	for (const b of a.buses ?? []) busChannel.set(b.id, id("ch"));
	const trackChannel = new Map<string, string>();
	const volumeParam = new Map<string, string>();
	const panParam = new Map<string, string>();
	for (const t of a.tracks) trackChannel.set(t.id, id("ch"));

	const channel = (o: {
		chId: string;
		role: "regular" | "effect" | "master";
		gain: number;
		pan: number;
		muted: boolean;
		solo?: boolean;
		destination?: string;
		sends?: { destination: string; level: number; pre?: boolean }[];
		ownerId: string;
	}) => {
		const dest = o.destination ? ` destination="${o.destination}"` : "";
		out(
			`      <Channel audioChannels="2" role="${o.role}" solo="${o.solo ? "true" : "false"}"${dest} id="${o.chId}">`,
		);
		const v = id("vol");
		const p = id("pan");
		volumeParam.set(o.ownerId, v);
		panParam.set(o.ownerId, p);
		// The schema's order: Mute, Pan, Sends, Volume (a strict importer refuses any other).
		out(`        <Mute value="${o.muted ? "true" : "false"}" id="${id("mute")}" name="Mute"/>`);
		out(
			`        <Pan max="1.000000" min="0.000000" unit="normalized" value="${num((o.pan + 1) / 2)}" id="${p}" name="Pan"/>`,
		);
		if (o.sends?.length) {
			out("        <Sends>");
			for (const s of o.sends) {
				out(
					`          <Send destination="${s.destination}" type="${s.pre ? "pre" : "post"}" id="${id("send")}">`,
				);
				out(
					`            <Volume max="1.000000" min="0.000000" unit="linear" value="${num(s.level)}" id="${id("sendvol")}" name="Send"/>`,
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
	for (const t of a.tracks) {
		const tid = id("track");
		trackIds.set(t.id, tid);
		const color = stemTintHex(t.colour);
		out(
			`    <Track contentType="${t.kind === "midi" ? "notes" : "audio"}" loaded="true" id="${tid}" name="${esc(t.name)}"${color ? ` color="${color}"` : ""}>`,
		);
		channel({
			chId: trackChannel.get(t.id)!,
			role: "regular",
			gain: t.gain,
			pan: t.pan,
			muted: t.muted,
			solo: t.solo,
			destination: (t.output && busChannel.get(t.output)) || masterChannel,
			sends: (t.sends ?? [])
				.filter((s) => busChannel.has(s.bus))
				.map((s) => ({ destination: busChannel.get(s.bus)!, level: s.level, pre: s.pre })),
			ownerId: t.id,
		});
		out("    </Track>");
	}
	const busTrackIds = new Map<string, string>();
	for (const b of a.buses ?? []) {
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
			destination: masterChannel,
			ownerId: b.id,
		});
		out("    </Track>");
	}
	out(`    <Track contentType="audio notes" loaded="true" id="${id("track")}" name="Master">`);
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
	const points = (ownerId: string, key: "volume" | "pan", lane: { t: number; v: number }[]) => {
		const target = (key === "volume" ? volumeParam : panParam).get(ownerId);
		if (!target || !lane.length) return;
		out(`        <Points unit="${key === "volume" ? "linear" : "normalized"}" id="${id("pts")}">`);
		out(`          <Target parameter="${target}"/>`);
		for (const p of lane)
			out(
				`          <RealPoint time="${num(p.t)}" value="${num(key === "pan" ? (p.v + 1) / 2 : p.v)}" interpolation="linear"/>`,
			);
		out("        </Points>");
	};
	const clipOf = (c: StudioClip) => {
		if (c.notes) {
			const events = clipNoteEvents({ ...c, start: 0, offset: c.offset, gain: 1 });
			out(
				`          <Clip time="${num(c.start)}" duration="${num(c.duration)}" contentTimeUnit="seconds" playStart="0.000000" name="${esc(c.name)}">`,
			);
			out(`            <Notes id="${id("notes")}">`);
			for (const e of events)
				out(
					`              <Note time="${num(e.at)}" duration="${num(e.duration)}" channel="0" key="${e.pitch}" vel="${num(e.velocity)}" rel="${num(e.velocity)}"/>`,
				);
			out("            </Notes>");
			out("          </Clip>");
			return;
		}
		const audio = c.sourceId ? input.audio.get(c.sourceId) : undefined;
		if (!audio) return;
		out(
			`          <Clip time="${num(c.start)}" duration="${num(c.duration)}" contentTimeUnit="seconds" playStart="${num(c.offset)}" fadeTimeUnit="seconds" fadeInTime="${num(c.fadeIn)}" fadeOutTime="${num(c.fadeOut)}" name="${esc(c.name)}">`,
		);
		out(
			`            <Audio algorithm="raw" channels="${audio.channels}" duration="${num(audio.durationSeconds)}" sampleRate="${audio.sampleRate}" id="${id("audio")}">`,
		);
		out(`              <File path="${esc(audio.path)}"/>`);
		out("            </Audio>");
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
		points(t.id, "volume", t.automation?.volume ?? []);
		points(t.id, "pan", t.automation?.pan ?? []);
		out("      </Lanes>");
	}
	for (const b of a.buses ?? []) {
		if (!b.automation?.volume?.length && !b.automation?.pan?.length) continue;
		out(`      <Lanes track="${busTrackIds.get(b.id)}" id="${id("lane")}">`);
		points(b.id, "volume", b.automation?.volume ?? []);
		points(b.id, "pan", b.automation?.pan ?? []);
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
	const grid = studioGrid(a);
	const beat = (seconds: number) => beatsBetween(grid, 0, seconds);
	const tempoChanges = (a.tempoChanges ?? [])
		.filter((c) => c.start > 0)
		.sort((x, y) => x.start - y.start);
	if (tempoChanges.length) {
		out(`    <TempoAutomation unit="bpm" timeUnit="beats" id="${id("tempoauto")}">`);
		out(`      <Target parameter="${tempoId}"/>`);
		out(`      <RealPoint time="0.000000" value="${num(a.bpm)}" interpolation="hold"/>`);
		for (const c of tempoChanges)
			out(
				`      <RealPoint time="${num(beat(c.start))}" value="${num(c.bpm)}" interpolation="hold"/>`,
			);
		out("    </TempoAutomation>");
	}
	const meterChanges = (a.meterChanges ?? [])
		.filter((c) => c.start > 0)
		.sort((x, y) => x.start - y.start);
	if (meterChanges.length) {
		out(`    <TimeSignatureAutomation timeUnit="beats" id="${id("sigauto")}">`);
		out(`      <Target parameter="${timesigId}"/>`);
		out(`      <TimeSignaturePoint time="0.000000" numerator="${a.beatsPerBar}" denominator="4"/>`);
		for (const c of meterChanges)
			out(
				`      <TimeSignaturePoint time="${num(beat(c.start))}" numerator="${c.beatsPerBar}" denominator="4"/>`,
			);
		out("    </TimeSignatureAutomation>");
	}
	out("  </Arrangement>");
	out("</Project>");

	const metadata = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		"<MetaData>",
		`  <Title>${esc(input.title)}</Title>`,
		"</MetaData>",
		"",
	].join("\n");
	return { project: lines.join("\n") + "\n", metadata };
}
