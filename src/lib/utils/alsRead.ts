import { LIVE_COLORS } from "#lib/constants/liveColors.js";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
} from "#lib/constants/studio.js";
import { MAX_AUTOMATION_POINTS } from "#lib/constants/studioAutomation.js";
import { MAX_SENDS, MAX_STUDIO_BUSES, sendLaneKey } from "#lib/constants/studioInserts.js";
import type {
	StudioAutomationPoint,
	StudioBus,
	StudioClip,
	StudioMarker,
	StudioNote,
	StudioSend,
	StudioTrack,
} from "#lib/val/StudioSchema.js";
import { MIN_CLIP_LOOP_SECONDS } from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";
import type { DawprojectFile, DawprojectRead } from "./dawprojectRead";
import { readReport } from "./readReport";
import { studioGrid } from "./studioGrid";
import { tempoPointsToSeconds } from "./tempoPointsToSeconds";
import { warpFromPoints } from "#lib/audio/warp.js";
import {
	secondsAfterBeats,
	tempoAt as gridTempoAt,
	tempoSteadyAcross,
} from "#lib/audio/measures.js";
import { BEAT_UNITS } from "#lib/constants/studio.js";
import { colourOfHex } from "./colourOfHex";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round4 = (v: number) => Math.round(v * 10000) / 10000;
const round2 = (v: number) => Math.round(v * 100) / 100;
const seconds = (v: number) => Math.round(v * 1_000_000) / 1_000_000;

/**
 * An Ableton Live set (`.als`, the XML inside the gzip; Live 9 to 12)
 * read into Dawn's shape, the same result the DAWproject reader gives
 * (dawprojectRead.ts), one way (docs/dawproject-plan.md, roadmap step 4):
 * the tempo and its automation (steps), the time signature and its
 * changes, the locators as markers, the master's volume; a track per
 * audio and MIDI track with its volume, pan, activity (mute), color (the
 * nearest of Dawn's tints to Live's palette) and volume and pan
 * envelopes; a group track as a bus its tracks route to and a return
 * track as a bus the sends feed; the arrangement's clips in seconds
 * through the tempo map, an audio clip over its file (an unwarped clip
 * from its start in seconds; a warped one from the seconds its warp
 * markers give, reported as stretched when Live plays it at another
 * speed), a looped clip unrolled over its length, a MIDI clip's notes
 * unrolled the same way; the clip's gain, fades and disabled state. What
 * has no place in Dawn is reported (`dropped`: devices, session clips,
 * pitch shifts, nested groups); what was read into Dawn's ways is too
 * (`fixed`). The samples are not in the file: `files` names them by the
 * project-relative and absolute paths the set holds, and the caller
 * finds them (utils/unpackProject.ts). Needs a `DOMParser`.
 */
export function readAls(xml: string, fallbackTitle = "Live set"): DawprojectRead {
	const doc = new DOMParser().parseFromString(xml, "application/xml");
	if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "Ableton")
		throw new Error("Not a Live set: the XML did not parse as one");
	const liveSet = kid(doc.documentElement, "LiveSet");
	if (!liveSet) throw new Error("Not a Live set: no LiveSet in the file");
	const { dropped, fixed, drop, fix } = readReport();

	// ── The master: tempo, its automation, the time signature, the volume ──
	const master = kid(liveSet, "MasterTrack") ?? kid(liveSet, "MainTrack");
	const masterMixer = path(master, "DeviceChain", "Mixer");
	const rawBpm = num(path(masterMixer, "Tempo", "Manual"), 120);
	let bpm = clamp(round2(rawBpm), 30, 300);
	if (bpm !== rawBpm) fix(`Tempo ${rawBpm} read as ${bpm}`);
	const tempoTarget = attr(path(masterMixer, "Tempo", "AutomationTarget"), "Id");
	const sigTarget = attr(path(masterMixer, "TimeSignature", "AutomationTarget"), "Id");
	const envelopesOf = (track: Element | null) =>
		kids(path(track, "AutomationEnvelopes", "Envelopes"), "AutomationEnvelope").map((e) => ({
			pointee: value(path(e, "EnvelopeTarget", "PointeeId")),
			events: kids(path(e, "Automation", "Events"), null).map((x) => ({
				kind: x.localName,
				time: Number(x.getAttribute("Time")),
				value: x.getAttribute("Value") ?? "",
			})),
		}));
	const masterEnvelopes = envelopesOf(master);
	// An event at −63072000 (two years before the song) is the value before any point: read as beat 0.
	/**
	 * The tempo map by beat: the song's own first, then the tempo automation's points. Live draws its tempo lane
	 * as straight lines between the points, so each pair with different tempos is a ramp (kept, linear over the
	 * beats); two points on one beat are a jump.
	 */
	const tempoPoints: { beat: number; bpm: number; ramp?: boolean }[] = [{ beat: 0, bpm }];
	const tempoEnv = masterEnvelopes.find((e) => e.pointee === tempoTarget);
	if (tempoEnv) {
		for (const e of tempoEnv.events)
			if (e.kind === "FloatEvent" && Number.isFinite(e.time))
				tempoPoints.push({
					beat: Math.max(0, e.time),
					bpm: clamp(round2(Number(e.value)), 30, 300),
					ramp: true,
				});
		// The song's own tempo is the lane's first value, not the Tempo's Manual.
		if (tempoEnv.events.length) tempoPoints.shift();
	}
	const tempoMap = tempoPointsToSeconds(tempoPoints);
	bpm = tempoMap[0]!.bpm;
	if (tempoMap.some((c) => c.ramp)) fix("Tempo ramps kept, linear over the beats");
	const tempoGrid = studioGrid({ bpm, beatsPerBar: 4, tempoChanges: tempoMap.slice(1) });
	const beatsToSeconds = (beats: number): number => secondsAfterBeats(tempoGrid, 0, beats);
	const tempoAt = (beat: number): number => gridTempoAt(tempoGrid, beatsToSeconds(beat));
	/** Whether one tempo holds from one beat to another: no change between them, no ramp across. */
	const steadyAcross = (from: number, to: number): boolean =>
		tempoSteadyAcross(tempoGrid, beatsToSeconds(from), beatsToSeconds(to));
	// The time signature is an enum: numerator = value mod 99 + 1, denominator = 2 to the power of value div 99.
	const sigOf = (v: number) => ({ numerator: (v % 99) + 1, denominator: 2 ** Math.floor(v / 99) });
	/** A time signature as Dawn's meter: 2 to 7 beats of a half, quarter, eighth or sixteenth (Live's tempo is quarter notes a minute, as Dawn's). */
	type Meter = { beatsPerBar: number; beatUnit: number };
	let meter: Meter = { beatsPerBar: 4, beatUnit: 4 };
	const meterPoints: ({ beat: number } & Meter)[] = [];
	const sigEnv = masterEnvelopes.find((e) => e.pointee === sigTarget);
	const meterOf = (v: number, where: string): Meter => {
		const { numerator, denominator } = sigOf(v);
		const n = clamp(Math.round(numerator), 2, 7);
		const unit = (BEAT_UNITS as readonly number[]).includes(denominator) ? denominator : 4;
		if (n !== numerator || denominator !== unit)
			fix(`Time signature ${numerator}/${denominator} ${where} read as ${n}/${unit}`);
		return { beatsPerBar: n, beatUnit: unit };
	};
	if (sigEnv) {
		for (const e of sigEnv.events.filter((x) => x.kind === "EnumEvent")) {
			const v = Number(e.value);
			if (!Number.isFinite(v)) continue;
			if (e.time <= 0) meter = meterOf(v, "at the start");
			else meterPoints.push({ beat: e.time, ...meterOf(v, `at beat ${e.time}`) });
		}
	} else fix("No time signature: 4/4 assumed");
	const beatsPerBar = meter.beatsPerBar;
	const tempoChanges = tempoMap
		.slice(1)
		.map((s) => ({ ...s, start: seconds(s.start) }))
		.filter((c, i, all) => c.start > 0 && (i === 0 || c.start !== all[i - 1]!.start))
		.slice(0, 64);
	const meterChanges = meterPoints
		.sort((a, b) => a.beat - b.beat)
		.map((p) => ({
			start: seconds(beatsToSeconds(p.beat)),
			beatsPerBar: p.beatsPerBar,
			...(p.beatUnit !== 4 ? { beatUnit: p.beatUnit as 2 | 8 | 16 } : {}),
		}))
		.filter((c, i, all) => i === 0 || c.start !== all[i - 1]!.start)
		.slice(0, 64);
	const masterVolume = clamp(round4(num(path(masterMixer, "Volume", "Manual"), 1)), 0, 1);

	// ── Locators as markers ──
	const markers: StudioMarker[] = [];
	for (const l of kids(path(liveSet, "Locators", "Locators"), "Locator")) {
		const name = (value(kid(l, "Name")) ?? "").trim().slice(0, 40);
		if (markers.length >= MAX_STUDIO_MARKERS) {
			drop(`${name || "A locator"} (over the ${MAX_STUDIO_MARKERS}-marker limit)`);
			continue;
		}
		markers.push({
			id: nanoid(),
			t: seconds(beatsToSeconds(Math.max(0, num(kid(l, "Time"), 0)))),
			name: name || "Locator",
		});
	}

	// ── Tracks: audio and MIDI tracks, groups and returns as buses ──
	const trackEls = kids(kid(liveSet, "Tracks"), null).filter((t) =>
		["AudioTrack", "MidiTrack", "GroupTrack", "ReturnTrack"].includes(t.localName),
	);
	const tracks: StudioTrack[] = [];
	const buses: StudioBus[] = [];
	const idOf = new Map<string, string>();
	const returnIds: string[] = [];
	// A track's color from Live's palette by index, kept as it is (docs/multitrack-recorder.md "Track colors").
	const colourOf = (el: Element | null) =>
		colourOfHex(LIVE_COLORS[num(kid(el, "Color") ?? kid(el, "ColorIndex"), -1)]);
	/** An envelope's events as a lane by the parameter's kind: the pan signed, a send within 0..1, the speaker (Live's track on/off, bool events) as the mute lane inverted. */
	const laneOf = (
		envelopes: ReturnType<typeof envelopesOf>,
		target: string | null,
		kind: "volume" | "pan" | "send" | "mute",
	): StudioAutomationPoint[] | undefined => {
		if (!target) return undefined;
		const env = envelopes.find((e) => e.pointee === target);
		if (!env) return undefined;
		const pts = env.events
			.filter(
				(e) => e.kind === (kind === "mute" ? "BoolEvent" : "FloatEvent") && Number.isFinite(e.time),
			)
			.map((e) => ({
				t: seconds(beatsToSeconds(Math.max(0, e.time))),
				v:
					kind === "pan"
						? clamp(round4(Number(e.value)), -1, 1)
						: kind === "mute"
							? e.value === "true"
								? 0
								: 1
							: clamp(round4(Number(e.value)), 0, kind === "send" ? 1 : STUDIO_FADER_MAX),
			}))
			.sort((a, b) => a.t - b.t)
			.filter((p, i, all) => i === 0 || p.t !== all[i - 1]!.t || p.v !== all[i - 1]!.v)
			.slice(0, MAX_AUTOMATION_POINTS);
		return pts.length ? pts : undefined;
	};
	// The master's own lanes: its volume (within Dawn's 0..1) and its on/off switch as the mute.
	const masterVolumeLane = laneOf(
		masterEnvelopes,
		attr(path(masterMixer, "Volume", "AutomationTarget"), "Id"),
		"volume",
	)?.map((p) => ({ ...p, v: Math.min(1, p.v) }));
	const masterMuteLane = laneOf(
		masterEnvelopes,
		attr(path(masterMixer, "Speaker", "AutomationTarget"), "Id"),
		"mute",
	);
	const masterAutomation =
		masterVolumeLane || masterMuteLane
			? {
					...(masterVolumeLane ? { volume: masterVolumeLane } : {}),
					...(masterMuteLane ? { mute: masterMuteLane } : {}),
				}
			: undefined;
	type Strip = {
		el: Element;
		kind: "audio" | "midi" | "group" | "return";
		id: string;
		name: string;
		groupId: string | null;
	};
	const strips: Strip[] = trackEls.map((el) => ({
		el,
		kind:
			el.localName === "AudioTrack"
				? "audio"
				: el.localName === "MidiTrack"
					? "midi"
					: el.localName === "GroupTrack"
						? "group"
						: "return",
		id: el.getAttribute("Id") ?? nanoid(),
		name: (value(path(el, "Name", "EffectiveName")) ?? "").trim().slice(0, 60) || "Track",
		groupId: value(kid(el, "TrackGroupId")) ?? null,
	}));
	for (const s of strips) {
		const mixer = path(s.el, "DeviceChain", "Mixer");
		const envelopes = envelopesOf(s.el);
		const volume = laneOf(
			envelopes,
			attr(path(mixer, "Volume", "AutomationTarget"), "Id"),
			"volume",
		);
		const pan = laneOf(envelopes, attr(path(mixer, "Pan", "AutomationTarget"), "Id"), "pan");
		const mute = laneOf(envelopes, attr(path(mixer, "Speaker", "AutomationTarget"), "Id"), "mute");
		const colour = colourOf(s.el);
		const rawGain = round4(num(path(mixer, "Volume", "Manual"), 1));
		if (rawGain > STUDIO_FADER_MAX)
			fix(
				`${s.name} at ${round2(20 * Math.log10(rawGain))} dB: Dawn's fader stops at ${round2(20 * Math.log10(STUDIO_FADER_MAX))} dB`,
			);
		const common = {
			name: s.name,
			...(colour ? { colour } : {}),
			gain: clamp(rawGain, 0, STUDIO_FADER_MAX),
			pan: clamp(round4(num(path(mixer, "Pan", "Manual"), 0)), -1, 1),
			muted: value(path(mixer, "Speaker", "Manual")) === "false",
			...(volume || pan || mute
				? {
						automation: {
							...(volume ? { volume } : {}),
							...(pan ? { pan } : {}),
							...(mute ? { mute } : {}),
						},
					}
				: {}),
		};
		for (const d of kids(path(s.el, "DeviceChain", "DeviceChain", "Devices"), null))
			drop(`${deviceName(d)} on ${s.name}`);
		if (s.kind === "group" || s.kind === "return") {
			if (buses.length >= MAX_STUDIO_BUSES) {
				drop(`${s.name} (over the ${MAX_STUDIO_BUSES}-bus limit)`);
				continue;
			}
			const id = nanoid();
			idOf.set(s.id, id);
			buses.push({ id, ...common });
			if (s.kind === "return") returnIds.push(id);
			if (s.kind === "group" && s.groupId && s.groupId !== "-1") {
				const parent = strips.find((x) => x.id === s.groupId);
				drop(`${s.name} inside the group ${parent?.name ?? s.groupId}: goes to the master here`);
			}
			continue;
		}
		if (tracks.length >= MAX_STUDIO_TRACKS) {
			drop(`${s.name} (over the ${MAX_STUDIO_TRACKS}-track limit)`);
			continue;
		}
		const id = nanoid();
		idOf.set(s.id, id);
		tracks.push({
			id,
			...common,
			...(s.kind === "midi" ? { kind: "midi" as const } : {}),
			solo: false,
			armed: false,
			input: s.kind === "midi" ? { source: "piano", channel: "stereo" } : null,
		});
	}
	// Routing: a grouped track goes to its group; a send holder's level goes to the return of the same index.
	for (const s of strips) {
		const track = tracks.find((t) => t.id === idOf.get(s.id));
		if (!track) continue;
		if (s.groupId && s.groupId !== "-1") {
			const busId = idOf.get(s.groupId);
			if (busId && buses.some((b) => b.id === busId)) track.output = busId;
		}
		const sends: StudioSend[] = [];
		const trackEnvelopes = envelopesOf(s.el);
		kids(path(s.el, "DeviceChain", "Mixer", "Sends"), "TrackSendHolder").forEach((h, i) => {
			const level = clamp(round4(num(path(h, "Send", "Manual"), 0)), 0, 1);
			const bus = returnIds[i];
			// The send's envelope rides as its lane; a send with one is carried even when its knob sits off.
			const lane = bus
				? laneOf(trackEnvelopes, attr(path(h, "Send", "AutomationTarget"), "Id"), "send")
				: undefined;
			// Live's "off" send sits at -70 dB (0.000316): nothing to carry.
			if (!bus || (level < 0.001 && !lane) || sends.length >= MAX_SENDS) return;
			sends.push({ bus, level });
			if (lane) track.automation = { ...track.automation, [sendLaneKey(bus)]: lane };
		});
		if (sends.length) track.sends = sends;
	}

	// ── Clips: the arrangement's, in seconds through the tempo map ──
	const clips: StudioClip[] = [];
	const files: DawprojectFile[] = [];
	const sourceByPath = new Map<string, string>();
	let sessionClips = 0;
	for (const s of strips) {
		const track = tracks.find((t) => t.id === idOf.get(s.id));
		if (!track) {
			if (
				kids(path(s.el, "DeviceChain", "MainSequencer"), null).length &&
				descendants(s.el, "AudioClip").length + descendants(s.el, "MidiClip").length
			)
				drop(`Clips on ${s.name} (a group or return)`);
			continue;
		}
		const sequencer = path(s.el, "DeviceChain", "MainSequencer");
		const timeable = kid(sequencer, "ClipTimeable") ?? kid(sequencer, "Sample");
		const events = path(timeable, "ArrangerAutomation", "Events");
		sessionClips +=
			descendants(kid(sequencer, "ClipSlotList"), "AudioClip").length +
			descendants(kid(sequencer, "ClipSlotList"), "MidiClip").length;
		for (const clip of kids(events, null)) {
			if (clip.localName !== "AudioClip" && clip.localName !== "MidiClip") continue;
			const name =
				(value(kid(clip, "Name")) ?? "").trim().slice(0, 60) ||
				(clip.localName === "MidiClip" ? "MIDI clip" : "Clip");
			// A deactivated clip comes across switched off: kept, playing nothing.
			const muted = value(kid(clip, "Disabled")) === "true";
			const startBeat = Math.max(
				0,
				num(kid(clip, "CurrentStart"), Number(clip.getAttribute("Time")) || 0),
			);
			const endBeat = num(kid(clip, "CurrentEnd"), startBeat);
			const lengthBeats = endBeat - startBeat;
			if (lengthBeats <= 0) {
				drop(`${name} on ${s.name}: no length`);
				continue;
			}
			const loop = kid(clip, "Loop");
			const loopOn = value(kid(loop, "LoopOn")) === "true";
			const loopStart = num(kid(loop, "LoopStart"), 0);
			const loopEnd = num(kid(loop, "LoopEnd"), loopStart + lengthBeats);
			const startRelative = num(kid(loop, "StartRelative"), 0);
			const playStart = loopStart + (loopOn ? startRelative : 0);
			const clipStart = seconds(beatsToSeconds(startBeat));
			const clipEnd = seconds(beatsToSeconds(endBeat));
			const fades = kid(clip, "Fades");
			const fadeBeats = (tag: string) => Math.max(0, num(kid(fades, tag), 0));
			const base = {
				trackId: track.id,
				gain: clamp(round4(num(kid(clip, "SampleVolume"), 1)), 0, 2),
				fadeIn: clamp(
					seconds(beatsToSeconds(startBeat + fadeBeats("FadeInLength")) - clipStart),
					0,
					60,
				),
				fadeOut: clamp(
					seconds(clipEnd - beatsToSeconds(endBeat - fadeBeats("FadeOutLength"))),
					0,
					60,
				),
				name,
				...(muted ? { muted: true as const } : {}),
			};
			if (clip.localName === "MidiClip") {
				if (track.kind !== "midi") {
					drop(`${name} on ${s.name}: MIDI on an audio track`);
					continue;
				}
				// The clip's envelopes (MIDI controllers, pitch bend, device parameters): the targets are numbered per set, so they are reported, not read.
				const envelopes = kids(path(clip, "Envelopes", "Envelopes"), "ClipEnvelope").length;
				if (envelopes)
					drop(
						`${name} on ${s.name}: ${envelopes} clip ${envelopes === 1 ? "envelope" : "envelopes"}`,
					);
				// The notes in content beats, unrolled over the clip: the first pass from the play start, then the loop again.
				const notes: StudioNote[] = [];
				const source: { time: number; duration: number; pitch: number; velocity: number }[] = [];
				for (const kt of kids(path(clip, "Notes", "KeyTracks"), "KeyTrack")) {
					const pitch = clamp(Math.round(num(kid(kt, "MidiKey"), 60)), 0, 127);
					for (const n of kids(kid(kt, "Notes"), "MidiNoteEvent")) {
						if (n.getAttribute("IsEnabled") === "false") continue;
						const time = Number(n.getAttribute("Time"));
						const duration = Number(n.getAttribute("Duration"));
						if (!Number.isFinite(time) || !(duration > 0)) continue;
						source.push({
							time,
							duration,
							pitch,
							velocity: clamp(round4(Number(n.getAttribute("Velocity") ?? 100) / 127), 0, 1),
						});
					}
				}
				const loopLength = loopOn ? loopEnd - loopStart : Infinity;
				// A loop that comes round within the clip, at one tempo throughout: kept as Dawn's own loop, the notes in content seconds at that tempo.
				if (
					keepsLoop(
						loopOn,
						loopLength,
						loopEnd - playStart,
						lengthBeats,
						steadyAcross(startBeat, endBeat),
					)
				) {
					const spb = 60 / tempoAt(startBeat);
					const from = Math.min(playStart, loopStart);
					for (const n of source) {
						if (n.time < from || n.time >= loopEnd) continue;
						notes.push({
							t: seconds(n.time * spb),
							d: Math.max(0.001, seconds(n.duration * spb)),
							p: n.pitch,
							v: n.velocity,
						});
					}
					if (!notes.length) {
						drop(`${name} on ${s.name}: no notes`);
						continue;
					}
					if (notes.length > MAX_STUDIO_NOTES_PER_CLIP) {
						drop(`${name} on ${s.name}: over the ${MAX_STUDIO_NOTES_PER_CLIP}-note limit`);
						continue;
					}
					if (clips.length >= MAX_STUDIO_CLIPS) {
						drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
						continue;
					}
					clips.push({
						id: nanoid(),
						...base,
						fadeIn: 0,
						fadeOut: 0,
						notes: notes.sort((a, b) => a.t - b.t),
						start: clipStart,
						offset: seconds(playStart * spb),
						duration: seconds(clipEnd - clipStart),
						loop: { start: seconds(loopStart * spb), end: seconds(loopEnd * spb) },
					});
					continue;
				}
				let passStart = playStart;
				let consumed = 0;
				let passes = 0;
				while (consumed < lengthBeats && passes < 512) {
					const passEnd = loopOn ? loopEnd : Infinity;
					const passLength = Math.min(passEnd - passStart, lengthBeats - consumed);
					for (const n of source) {
						if (n.time < passStart || n.time >= passStart + passLength) continue;
						// A note that runs past the loop's end stops there, as Live stops it when the loop comes round.
						const onBeat = startBeat + consumed + (n.time - passStart);
						const offBeat = Math.min(
							endBeat,
							startBeat + consumed + passLength,
							onBeat + n.duration,
						);
						const t = seconds(beatsToSeconds(onBeat) - clipStart);
						const d = seconds(beatsToSeconds(offBeat) - beatsToSeconds(onBeat));
						if (d > 0) notes.push({ t, d: Math.max(0.001, d), p: n.pitch, v: n.velocity });
					}
					consumed += passLength;
					passes++;
					if (!loopOn || !(loopLength > 0)) break;
					passStart = loopStart;
				}
				if (passes > 1)
					fix(
						`${name} on ${s.name}: a looped clip over a tempo change, its loop repeated to fill it`,
					);
				if (!notes.length) {
					drop(`${name} on ${s.name}: no notes`);
					continue;
				}
				if (notes.length > MAX_STUDIO_NOTES_PER_CLIP) {
					drop(`${name} on ${s.name}: over the ${MAX_STUDIO_NOTES_PER_CLIP}-note limit`);
					continue;
				}
				if (clips.length >= MAX_STUDIO_CLIPS) {
					drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
					continue;
				}
				notes.sort((a, b) => a.t - b.t || a.p - b.p);
				clips.push({
					id: nanoid(),
					...base,
					start: clipStart,
					offset: 0,
					duration: seconds(clipEnd - clipStart),
					notes,
				});
				continue;
			}
			if (track.kind === "midi") {
				drop(`${name} on ${s.name}: audio on a MIDI track`);
				continue;
			}
			// The sample: by the project-relative path when the set has one, else the absolute one; Live 9 lists the path's parts.
			const fileRef = path(clip, "SampleRef", "FileRef");
			const relative =
				value(kid(fileRef, "RelativePath")) ||
				[
					...kids(kid(fileRef, "RelativePath"), "RelativePathElement").map(
						(e) => e.getAttribute("Dir") ?? "",
					),
					value(kid(fileRef, "Name")) ?? "",
				]
					.filter(Boolean)
					.join("/");
			const absolute = value(kid(fileRef, "Path")) || "";
			const filePath = relative && !relative.startsWith("../") ? relative : absolute || relative;
			if (!filePath) {
				drop(`${name} on ${s.name}: no file`);
				continue;
			}
			const sampleRate = num(path(clip, "SampleRef", "DefaultSampleRate"), 0);
			const warped = value(kid(clip, "IsWarped")) !== "false";
			const warpMarkers = kids(kid(clip, "WarpMarkers"), "WarpMarker")
				.map((w) => ({
					sec: Number(w.getAttribute("SecTime")),
					beat: Number(w.getAttribute("BeatTime")),
				}))
				.filter((w) => Number.isFinite(w.sec) && Number.isFinite(w.beat))
				.sort((a, b) => a.beat - b.beat);
			/** Content beats to the sample's seconds through the warp markers (the last two carry on past the end). */
			const secAtBeat = (beat: number): number => {
				if (warpMarkers.length < 2)
					return warpMarkers[0]
						? warpMarkers[0].sec + (beat - warpMarkers[0].beat) * (60 / bpm)
						: (beat * 60) / bpm;
				let i = 0;
				while (i < warpMarkers.length - 2 && warpMarkers[i + 1]!.beat <= beat) i++;
				const a = warpMarkers[i]!;
				const b = warpMarkers[i + 1]!;
				return b.beat === a.beat
					? a.sec
					: a.sec + ((beat - a.beat) * (b.sec - a.sec)) / (b.beat - a.beat);
			};
			// A warped clip (docs/multitrack-recorder.md "Warping a clip"): Live's markers pin the sample's seconds to beats, and the
			// beats play at the song's tempo, so each marker is a warp point at its beat's seconds; kept when they stretch the sample.
			const bpmHere = tempoAt(startBeat);
			const warp =
				warped && warpMarkers.length >= 2
					? warpFromPoints(warpMarkers.map((w) => ({ at: (w.beat * 60) / bpmHere, source: w.sec })))
					: null;
			if (warp)
				fix(
					`Warped clips kept, stretched by Dawn's own algorithm (Live's warp markers as warp points)`,
				);
			if (num(kid(clip, "PitchCoarse"), 0) !== 0 || num(kid(clip, "PitchFine"), 0) !== 0)
				drop(`${name} on ${s.name}: transposed (plays at the file's own pitch here)`);
			let sourceId = sourceByPath.get(filePath);
			if (!sourceId) {
				sourceId = nanoid();
				sourceByPath.set(filePath, sourceId);
				files.push({
					sourceId,
					path: filePath,
					label: `${s.name} - ${name}`,
					...(sampleRate ? { sampleRate } : {}),
				});
			}
			// An unwarped clip's loop values are seconds of the sample; a warped one's are beats: of the warped content (at the
			// song's tempo) when the warp is kept, else of the sample through the markers.
			const contentSec = (v: number) =>
				seconds(Math.max(0, warp ? (v * 60) / bpmHere : warped ? secAtBeat(v) : v));
			const toBeats = (contentSpan: number) =>
				warped ? contentSpan : (contentSpan * tempoAt(startBeat)) / 60;
			// A loop that comes round within the clip, at one tempo throughout: kept as Dawn's own loop over the sample.
			if (
				keepsLoop(
					loopOn,
					toBeats(loopEnd - loopStart),
					toBeats(loopEnd - playStart),
					lengthBeats,
					steadyAcross(startBeat, endBeat),
				) &&
				contentSec(loopEnd) - contentSec(loopStart) >= MIN_CLIP_LOOP_SECONDS
			) {
				if (clips.length >= MAX_STUDIO_CLIPS) {
					drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
					continue;
				}
				// A clip of whole passes stays whole passes: the loop's ends are rounded to the sample, and a hair past the last
				// pass would be a pass of its own.
				const loop = { start: contentSec(loopStart), end: contentSec(loopEnd) };
				const span = seconds(clipEnd - clipStart);
				const passesOf = (span - (loop.end - contentSec(playStart))) / (loop.end - loop.start) + 1;
				const whole = Math.round(passesOf);
				const duration =
					Math.abs(passesOf - whole) * (loop.end - loop.start) < 0.001
						? seconds(loop.end - contentSec(playStart) + (whole - 1) * (loop.end - loop.start))
						: span;
				clips.push({
					id: nanoid(),
					...base,
					sourceId,
					start: clipStart,
					offset: contentSec(playStart),
					duration,
					loop,
					...(warp ? { warp } : {}),
				});
				continue;
			}
			// Else unrolled over the clip, a pass per repeat.
			let passStart = playStart;
			let consumed = 0;
			let passes = 0;
			const beatsOf = (contentSpan: number) =>
				warped ? contentSpan : (contentSpan * tempoAt(startBeat + consumed)) / 60;
			while (consumed < lengthBeats && passes < 512) {
				const passLength = Math.min(
					loopOn ? beatsOf(loopEnd - passStart) : Infinity,
					lengthBeats - consumed,
				);
				if (!(passLength > 0)) break;
				if (clips.length >= MAX_STUDIO_CLIPS) {
					drop(`${name} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
					break;
				}
				const from = seconds(beatsToSeconds(startBeat + consumed));
				const to = seconds(beatsToSeconds(startBeat + consumed + passLength));
				clips.push({
					id: nanoid(),
					...base,
					sourceId,
					start: from,
					offset: contentSec(passStart),
					duration: seconds(to - from),
					...(warp ? { warp } : {}),
					...(passes > 0 ? { fadeIn: 0 } : {}),
					...(consumed + passLength < lengthBeats ? { fadeOut: 0 } : {}),
				});
				consumed += passLength;
				passes++;
				if (!loopOn) break;
				passStart = loopStart;
			}
			if (passes > 1)
				fix(
					`${name} on ${s.name}: a looped clip over a tempo change, its loop repeated to fill it`,
				);
		}
	}
	if (sessionClips)
		drop(
			`${sessionClips} session-view ${sessionClips === 1 ? "clip" : "clips"} (the arrangement is what comes across)`,
		);
	for (const d of kids(path(master, "DeviceChain", "DeviceChain", "Devices"), null))
		drop(`${deviceName(d)} on the master`);

	return {
		title: fallbackTitle,
		notes: (value(kid(liveSet, "Annotation")) ?? "").trim(),
		arrangement: {
			version: 1,
			bpm,
			beatsPerBar,
			...(meter.beatUnit !== 4 ? { beatUnit: meter.beatUnit as 2 | 8 | 16 } : {}),
			gridOn: true,
			countIn: false,
			click: false,
			loop: null,
			master: masterVolume,
			...(masterAutomation ? { masterAutomation } : {}),
			tracks,
			clips,
			...(buses.length ? { buses } : {}),
			...(markers.length ? { markers } : {}),
			...(tempoChanges.length ? { tempoChanges } : {}),
			...(meterChanges.length ? { meterChanges } : {}),
		},
		files,
		dropped,
		fixed,
	};
}

/** A device's name: what the user called it, a plug-in's own name, else Live's tag for it ("Compressor2" is the Compressor). */
/**
 * Whether a Live clip's loop comes across as Dawn's own: the loop is on and
 * has length, the clip runs past the loop's end from where it starts playing
 * (so the loop comes round at least once), and the tempo holds across the
 * clip (content seconds at one tempo match the song).
 */
function keepsLoop(
	loopOn: boolean,
	loopBeats: number,
	firstPassBeats: number,
	lengthBeats: number,
	steady: boolean,
): boolean {
	return (
		loopOn &&
		Number.isFinite(loopBeats) &&
		loopBeats > 0 &&
		lengthBeats > firstPassBeats + 1e-6 &&
		steady
	);
}

function deviceName(d: Element): string {
	const plugin =
		value(path(d, "PluginDesc", "VstPluginInfo", "PlugName")) ||
		value(path(d, "PluginDesc", "Vst3PluginInfo", "Name")) ||
		value(path(d, "PluginDesc", "AuPluginInfo", "Name"));
	const own = (value(kid(d, "UserName")) ?? "").trim();
	if (own) return own;
	if (plugin) return plugin;
	if (d.localName === "PluginDevice" || d.localName === "AuPluginDevice") return "A plug-in";
	if (d.localName === "ProxyInstrumentDevice" || d.localName === "ProxyAudioEffectDevice")
		return "A missing device";
	return d.localName.replace(/\d+$/, "").replace(/([a-z])([A-Z])/g, "$1 $2");
}

// ── Small helpers over the set's "<Tag Value='…'/>" idiom ──
function kid(el: Element | null | undefined, tag: string): Element | null {
	if (!el) return null;
	for (const c of el.children) if (c.localName === tag) return c;
	return null;
}
function kids(el: Element | null | undefined, tag: string | null): Element[] {
	if (!el) return [];
	return Array.from(el.children).filter((c) => tag === null || c.localName === tag);
}
function path(el: Element | null | undefined, ...tags: string[]): Element | null {
	let at: Element | null = el ?? null;
	for (const t of tags) at = kid(at, t);
	return at;
}
function descendants(el: Element | null | undefined, tag: string): Element[] {
	return el ? Array.from(el.getElementsByTagName(tag)) : [];
}
const value = (el: Element | null): string | null => el?.getAttribute("Value") ?? null;
const attr = (el: Element | null, name: string): string | null => el?.getAttribute(name) ?? null;
function num(el: Element | null, fallback: number): number {
	const v = Number(value(el));
	return value(el) !== null && Number.isFinite(v) ? v : fallback;
}
