import { BEAT_UNITS } from "#lib/constants/studio.js";
import { busDescendants } from "./busDescendants";
import { colourOfHex } from "./colourOfHex";
import {
	DAWPROJECT_METADATA_FIELDS,
	type DawprojectMetadata,
} from "#lib/val/DawprojectMetadataSchema.js";
import { MAX_AUTOMATION_POINTS } from "#lib/constants/studioAutomation.js";
import { MAX_SENDS, MAX_STUDIO_BUSES, sendLaneKey } from "#lib/constants/studioInserts.js";
import { lanesFromEvents, type LaneEvent } from "./lanesFromEvents";
import { studioGrid } from "./studioGrid";
import { warpFromPoints } from "#lib/audio/warp.js";
import { tempoPointsToSeconds } from "./tempoPointsToSeconds";
import { secondsAfterBeats } from "#lib/audio/measures.js";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_SECONDS,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
	STUDIO_SAMPLE_RATES,
} from "#lib/constants/studio.js";
import { MIN_CLIP_LOOP_SECONDS } from "#lib/val/StudioSchema.js";
import type {
	StudioWarp,
	StudioArrangement,
	StudioAutomation,
	StudioBus,
	StudioClip,
	StudioMarker,
	StudioTrack,
} from "#lib/val/StudioSchema.js";
import { nanoid } from "nanoid";

/** An audio file the project wants: the source id minted for it, its path inside the archive, and a label for the queue. */
export interface DawprojectFile {
	sourceId: string;
	path: string;
	label: string;
	/** The rate the project says the file has (its `Audio` element), when it says one. */
	sampleRate?: number;
}

export interface DawprojectRead {
	title: string;
	/** The metadata's fields (the artist, the writers, the comment…) as lines for the song's notes, with where the file came from. */
	notes: string;
	/** The metadata besides the title, as the file had it (DAWproject archives; the other readers have none). */
	metadata?: DawprojectMetadata;
	arrangement: StudioArrangement;
	files: DawprojectFile[];
	/** What did not come across, in words for the import report. */
	dropped: string[];
	/** What came across changed: another writer's ways read into Dawn's (float-noise tempos, beats, decibels, alpha colors…), in words for the report. */
	fixed: string[];
}

/** The metadata fields' labels in the notes ("Original artist: …"); the comment goes in as itself. */
const META_LABELS: Record<(typeof DAWPROJECT_METADATA_FIELDS)[number], string> = {
	artist: "Artist",
	album: "Album",
	originalArtist: "Original artist",
	composer: "Composer",
	songwriter: "Songwriter",
	producer: "Producer",
	arranger: "Arranger",
	year: "Year",
	genre: "Genre",
	copyright: "Copyright",
	website: "Website",
	comment: "Comment",
};

type TimeUnit = "beats" | "seconds";

/**
 * A DAWproject's `project.xml` (Bitwig's open interchange format 1.0,
 * docs/dawproject-plan.md phase 1) read into Dawn's shape: the transport
 * and its tempo and time-signature automation, a track per regular track
 * (audio, or MIDI for a notes track), a bus per group or effect track, the
 * master's volume, each channel's volume, pan, mute, solo, output and
 * sends, the clips in seconds (beats converted through the tempo map), an
 * audio clip over its file (one source per distinct file), a notes clip's
 * notes, the volume and pan automation, and the markers. The caller
 * unzips the archive and hands this the XML; it gets back what to decode
 * (`files`) and what was dropped (devices, stretch, nested lanes, scenes,
 * anything over Dawn's limits), named for the user. Needs a `DOMParser`
 * (the browser, or jsdom in tests).
 */
export function readDawproject(
	projectXml: string,
	metadataXml?: string | null,
	/** The title when the metadata names none (Bitwig writes an empty one): the archive's own name, say. */
	fallbackTitle = "Imported project",
): DawprojectRead {
	const doc = new DOMParser().parseFromString(projectXml, "application/xml");
	if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "Project")
		throw new Error("Not a DAWproject: project.xml did not parse");
	const root = doc.documentElement;
	const dropped: string[] = [];
	const fixed: string[] = [];
	const fix = (what: string) => {
		if (!fixed.includes(what)) fixed.push(what);
	};
	const drop = (what: string) => {
		if (!dropped.includes(what)) dropped.push(what);
	};

	// ── Helpers over the DOM ─────────────────────────────────────────────
	// Element names compared without case: a converter wrote `<markers>` for `<Markers>`, and the schema's names are distinct either way.
	const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
	const kids = (el: Element | null | undefined, tag: string): Element[] =>
		el ? Array.from(el.children).filter((c) => same(c.localName, tag)) : [];
	const kid = (el: Element | null | undefined, tag: string): Element | null =>
		kids(el, tag)[0] ?? null;
	const attr = (el: Element | null | undefined, name: string): string | null =>
		el?.getAttribute(name) ?? null;
	const num = (el: Element | null | undefined, name: string, fallback: number): number => {
		const raw = attr(el, name);
		if (raw === null || raw.trim() === "") return fallback;
		const v = Number(raw);
		return Number.isFinite(v) ? v : fallback;
	};
	const bool = (el: Element | null | undefined, name: string): boolean => attr(el, name) === "true";
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const round4 = (v: number) => Math.round(v * 10000) / 10000;
	const seconds = (v: number) => clamp(round4(v), 0, MAX_STUDIO_SECONDS * 4);

	// ── Transport, and the tempo map that turns beats into seconds ───────
	const transport = kid(root, "Transport");
	const tempoEl = kid(transport, "Tempo");
	const tempoParamId = attr(tempoEl, "id");
	/** Tempo automation written as Points on the Tempo parameter inside the lanes (ProjectConverter's way), in seconds or beats. */
	const laneTempo: { start: number; bpm: number }[] = [];
	// Bitwig writes its tempo with float noise ("100.000167"): two decimals is what a tempo means.
	const round2 = (v: number) => Math.round(v * 100) / 100;
	const rawBpm = num(tempoEl, "value", 120);
	const bpm = clamp(round2(rawBpm), 30, 300);
	if (!tempoEl) fix("No tempo: 120 bpm assumed");
	else if (bpm !== rawBpm) fix(`Tempo ${rawBpm} read as ${bpm}`);
	const sigEl = kid(transport, "TimeSignature");
	/** A time signature as Dawn's meter: 2 to 7 beats of a half, quarter, eighth or sixteenth (docs/multitrack-recorder.md "Time-signature denominators"). */
	const meterOf = (el: Element | null, fallbackBeats: number) => {
		const numerator = num(el, "numerator", fallbackBeats);
		const denominator = num(el, "denominator", 4);
		const beatsPerBar = clamp(Math.round(numerator), 2, 7);
		const beatUnit = (BEAT_UNITS as readonly number[]).includes(denominator) ? denominator : 4;
		if (numerator !== beatsPerBar || denominator !== beatUnit)
			fix(`Time signature ${numerator}/${denominator} read as ${beatsPerBar}/${beatUnit}`);
		return { beatsPerBar, beatUnit };
	};
	const meter = meterOf(sigEl, 4);
	const beatsPerBar = meter.beatsPerBar;
	if (!sigEl) fix("No time signature: 4/4 assumed");
	const arrangementEl = kid(root, "Arrangement");
	/**
	 * The tempo automation's points by beat, the song's own tempo first; a point interpolated "linear" ramps
	 * to the next (Dawn keeps the ramp, linear over the beats). Two points on one beat are a jump: the later counts.
	 */
	const tempoPoints: { beat: number; bpm: number; ramp?: boolean }[] = [{ beat: 0, bpm }];
	for (const p of kids(kid(arrangementEl, "TempoAutomation"), "RealPoint")) {
		const beat = Math.max(0, num(p, "time", 0));
		const value = clamp(round2(num(p, "value", bpm)), 30, 300);
		tempoPoints.push({ beat, bpm: value, ramp: attr(p, "interpolation") === "linear" });
	}
	const tempoMap = tempoPointsToSeconds(tempoPoints);
	const tempoSteps = tempoMap;
	if (tempoMap.some((c) => c.ramp)) fix("Tempo ramps kept, linear over the beats");
	const tempoGrid = studioGrid({
		bpm: tempoMap[0]!.bpm,
		beatsPerBar: 4,
		tempoChanges: tempoMap.slice(1),
	});
	const beatsToSeconds = (beats: number): number => secondsAfterBeats(tempoGrid, 0, beats);
	let beatsUsed = false;
	const toSeconds = (v: number, unit: TimeUnit) => {
		if (unit !== "beats") return v;
		if (v !== 0) beatsUsed = true;
		return beatsToSeconds(v);
	};
	/** The time unit an element names in `name` ("timeUnit", "contentTimeUnit", "fadeTimeUnit"), else the one inherited. */
	const unitOf = (
		el: Element | null | undefined,
		inherited: TimeUnit,
		name = "timeUnit",
	): TimeUnit => {
		const u = attr(el, name);
		return u === "beats" || u === "seconds" ? u : inherited;
	};

	// ── Structure: tracks, buses, the master, and the parameters automation may name ──
	type Owner = { kind: "track" | "bus" | "master"; id: string; name: string };
	const channelOwner = new Map<string, Owner>();
	/** The parameters a lane may name, by id: a strip's volume, pan or mute, or a send's volume (`send:<busId>`). */
	const paramOwner = new Map<string, { owner: Owner; key: string }>();
	const trackOwner = new Map<string, Owner>();
	const tracks: StudioTrack[] = [];
	const buses: StudioBus[] = [];
	let master = 1;
	const pending: { owner: Owner; channel: Element | null }[] = [];
	// Cubase writes colors with an alpha byte ("#a2eabfff"); the color is the first six digits. One of Dawn's own
	// palette comes back as its tint, any other is kept as it is (docs/multitrack-recorder.md "Track colors").
	const tint = (hex: string | null) => {
		const six = hex?.match(/^#?([0-9a-f]{6})/i)?.[1];
		if (!six) return undefined;
		if (hex!.replace(/^#/, "").length > 6) fix("Colors with an alpha byte, read as six digits");
		return colourOfHex(six);
	};
	const volumeOf = (el: Element | null): number => {
		if (!el) return 1;
		const value = num(el, "value", 1);
		const unit = attr(el, "unit");
		if (unit === "decibel") {
			fix("Levels in decibels, converted to linear");
			return clamp(round4(Math.pow(10, value / 20)), 0, STUDIO_FADER_MAX);
		}
		if (unit === "normalized") return clamp(round4(value * num(el, "max", 1)), 0, STUDIO_FADER_MAX);
		return clamp(value, 0, STUDIO_FADER_MAX);
	};
	const panOf = (el: Element | null): number => {
		if (!el) return 0;
		const value = num(el, "value", 0.5);
		const min = num(el, "min", 0);
		const max = num(el, "max", 1);
		// Normalized 0..1 (the format's usual), or a signed range; both to -1..1.
		return clamp(
			round4(min < 0 ? value / Math.max(Math.abs(min), Math.abs(max), 1) : value * 2 - 1),
			-1,
			1,
		);
	};
	const registerParams = (channel: Element | null, owner: Owner) => {
		const v = attr(kid(channel, "Volume"), "id");
		const p = attr(kid(channel, "Pan"), "id");
		const m = attr(kid(channel, "Mute"), "id");
		if (v) paramOwner.set(v, { owner, key: "volume" });
		if (p) paramOwner.set(p, { owner, key: "pan" });
		if (m) paramOwner.set(m, { owner, key: "mute" });
		const ch = attr(channel, "id");
		if (ch) channelOwner.set(ch, owner);
		for (const d of Array.from(kid(channel, "Devices")?.children ?? []))
			drop(`${attr(d, "deviceName") || attr(d, "name") || d.localName} on ${owner.name}`);
	};
	const walkTrack = (el: Element) => {
		const channel = kid(el, "Channel");
		const name = (attr(el, "name") ?? "").trim().slice(0, 60) || "Track";
		const role = attr(channel, "role");
		const children = kids(el, "Track");
		const trackId = attr(el, "id");
		// A folder with nothing in it and no channel (Cubase's "Input/Output" track, contentType "tracks") is not a track.
		if (!channel && children.length === 0) {
			fix(`${name}: an empty folder, skipped`);
			return;
		}
		if (role === "master") {
			master = clamp(volumeOf(kid(channel, "Volume")), 0, 1);
			const owner: Owner = { kind: "master", id: "master", name };
			registerParams(channel, owner);
			if (trackId) trackOwner.set(trackId, owner);
		} else if (role === "effect" || children.length) {
			// A group (its children route to it) or an effect track: a bus in Dawn.
			if (buses.length >= MAX_STUDIO_BUSES)
				drop(`${name} (over the ${MAX_STUDIO_BUSES}-bus limit)`);
			else {
				const bus: StudioBus = {
					id: nanoid(),
					name,
					colour: tint(attr(el, "color")),
					gain: volumeOf(kid(channel, "Volume")),
					pan: panOf(kid(channel, "Pan")),
					muted: bool(kid(channel, "Mute"), "value"),
					// A track with tracks inside it is a group (docs/multitrack-recorder.md "Folder tracks").
					...(children.length ? { folder: true } : {}),
				};
				buses.push(bus);
				const owner: Owner = { kind: "bus", id: bus.id, name };
				registerParams(channel, owner);
				if (trackId) trackOwner.set(trackId, owner);
				pending.push({ owner, channel });
			}
		} else {
			if (tracks.length >= MAX_STUDIO_TRACKS) {
				drop(`${name} (over the ${MAX_STUDIO_TRACKS}-track limit)`);
				return;
			}
			const content = attr(el, "contentType") ?? "audio";
			const kind = content.includes("notes") && !content.includes("audio") ? "midi" : "audio";
			const track: StudioTrack = {
				id: nanoid(),
				kind,
				name,
				colour: tint(attr(el, "color")),
				gain: volumeOf(kid(channel, "Volume")),
				pan: panOf(kid(channel, "Pan")),
				muted: bool(kid(channel, "Mute"), "value"),
				solo: bool(channel, "solo"),
				armed: false,
				input: kind === "midi" ? { source: "piano", channel: "stereo" } : null,
				// A one-channel audio track is mono in Dawn (docs/multitrack-recorder.md "Mono tracks").
				...(kind === "audio" && attr(channel, "audioChannels") === "1" ? { mono: true } : {}),
			};
			tracks.push(track);
			const owner: Owner = { kind: "track", id: track.id, name };
			registerParams(channel, owner);
			if (trackId) trackOwner.set(trackId, owner);
			pending.push({ owner, channel });
		}
		for (const c of children) walkTrack(c);
	};
	for (const t of kids(kid(root, "Structure"), "Track")) walkTrack(t);
	// Routing and sends, once every channel is known.
	const busById = new Map(buses.map((b) => [b.id, b]));
	for (const { owner, channel } of pending) {
		const dest = attr(channel, "destination");
		const to = dest ? channelOwner.get(dest) : undefined;
		const output = to?.kind === "bus" && to.id !== owner.id ? to.id : undefined;
		const sends = kids(kid(channel, "Sends"), "Send")
			.map((s) => {
				// A send switched off (Bitwig's <Enable value="false"/>) is no send.
				if (attr(kid(s, "Enable"), "value") === "false") return null;
				const target = attr(s, "destination");
				const bus = target ? channelOwner.get(target) : undefined;
				if (bus?.kind !== "bus" || !busById.has(bus.id)) return null;
				// The send's volume parameter, so a lane on it lands on the track as its send lane.
				const sendVolume = attr(kid(s, "Volume"), "id");
				if (sendVolume) paramOwner.set(sendVolume, { owner, key: sendLaneKey(bus.id) });
				return {
					bus: bus.id,
					level: clamp(num(kid(s, "Volume"), "value", 1), 0, 1),
					...(attr(s, "type") === "pre" ? { pre: true } : {}),
				};
			})
			.filter((s): s is NonNullable<typeof s> => s !== null)
			.slice(0, MAX_SENDS);
		if (owner.kind === "track") {
			const track = tracks.find((t) => t.id === owner.id)!;
			if (output) track.output = output;
			if (sends.length) track.sends = sends;
		} else if (owner.kind === "bus" && output) {
			// A bus into another (a group in a group, an effect track into a group), never into one that feeds it.
			const bus = busById.get(owner.id)!;
			if (!busDescendants(buses, owner.id).has(output)) bus.output = output;
		}
	}

	// ── The arrangement: clips, automation, markers ──────────────────────
	const clips: StudioClip[] = [];
	const files: DawprojectFile[] = [];
	const sourceByPath = new Map<string, string>();
	const markers: StudioMarker[] = [];
	const automation = new Map<string, StudioAutomation>();
	/** What a clip played, by the clip's id and its content's id, so an alias clip (`reference`) can play the same. */
	type ClipContent = { sourceId: string; offset: number } | { notes: StudioClip["notes"] };
	const contentById = new Map<string, ClipContent>();
	const remember = (el: Element, content: Element | null, played: ClipContent) => {
		for (const id of [attr(el, "id"), attr(content, "id")]) if (id) contentById.set(id, played);
	};
	const sourceFor = (path: string, label: string, sampleRate: number) => {
		let id = sourceByPath.get(path);
		if (!id) {
			id = nanoid();
			sourceByPath.set(path, id);
			files.push({ sourceId: id, path, label, ...(sampleRate > 0 ? { sampleRate } : {}) });
		}
		return id;
	};
	const readClip = (el: Element, owner: Owner | null, unit: TimeUnit, baseSeconds: number) => {
		const name = (attr(el, "name") ?? "").trim().slice(0, 60);
		if (!owner || owner.kind !== "track") {
			drop(`${name || "A clip"} outside a track`);
			return;
		}
		// A switched-off clip (enable="false") comes across as one: kept, playing nothing.
		const off = attr(el, "enable") === "false" ? { muted: true as const } : {};
		const contentUnit = unitOf(el, unit, "contentTimeUnit");
		const fadeUnit = unitOf(el, unit, "fadeTimeUnit");
		const start = seconds(baseSeconds + toSeconds(num(el, "time", 0), unit));
		const durationRaw = attr(el, "duration");
		let duration = durationRaw === null ? 0 : toSeconds(num(el, "duration", 0), unit);
		const playStart = num(el, "playStart", 0);
		// A loop over the content (loopStart/loopEnd, content time): kept as Dawn's own loop when it has length.
		const loopStartRaw = attr(el, "loopStart");
		const loopEndRaw = attr(el, "loopEnd");
		// Kept only when the loop comes round within the clip (Bitwig writes one on every clip, the clip's own length).
		const loopOf = (toContent: (v: number) => number, offset: number, length: number) => {
			if (loopStartRaw === null || loopEndRaw === null) return undefined;
			const start = round4(Math.max(0, toContent(Number(loopStartRaw))));
			const end = round4(toContent(Number(loopEndRaw)));
			if (!(end > start) || length <= end - Math.min(offset, end) + 0.001) return undefined;
			if (end - start < MIN_CLIP_LOOP_SECONDS) {
				fix(`${name || "A clip"}: a loop shorter than a tenth of a second, played once`);
				return undefined;
			}
			return { start, end };
		};
		const fadeIn = clamp(round4(toSeconds(num(el, "fadeInTime", 0), fadeUnit)), 0, 60);
		const fadeOut = clamp(round4(toSeconds(num(el, "fadeOutTime", 0), fadeUnit)), 0, 60);
		// An alias clip plays another clip's content (the reference writer's "Alias Clip"): the same source or notes, placed here.
		const reference = attr(el, "reference");
		if (reference) {
			const played = contentById.get(reference);
			if (!played) {
				drop(`${name || "An alias clip"}: its original is not in the file`);
				return;
			}
			if (clips.length >= MAX_STUDIO_CLIPS) {
				drop(`${name || "A clip"} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
				return;
			}
			fix(`${name || "An alias clip"}: an alias, written as a copy`);
			clips.push({
				id: nanoid(),
				trackId: owner.id,
				...("notes" in played ? { notes: played.notes } : { sourceId: played.sourceId }),
				start,
				offset: "offset" in played ? played.offset : 0,
				duration: clamp(seconds(duration) || 0.001, 0.001, MAX_STUDIO_SECONDS),
				gain: 1,
				fadeIn,
				fadeOut,
				name: name || "Alias",
				...off,
			});
			return;
		}
		// Nested clips: a clip holding clips (launcher content written into the arrangement) flattens one level.
		const nested = kid(el, "Clips");
		if (nested) {
			for (const c of kids(nested, "Clip")) readClip(c, owner, contentUnit, start);
			return;
		}
		if (kid(el, "Lanes")) drop(`${name || "A clip"}: nested lanes`);
		// Automation inside the clip: an expression target (Bitwig keeps a notes clip's controller lanes here) becomes a lane of the clip; anything else is read as the track's, mostly a report.
		const laneEvents: LaneEvent[] = [];
		for (const pts of kids(el, "Points")) {
			const expression = attr(kid(pts, "Target"), "expression");
			if (!expression) {
				readPoints(pts, contentUnit);
				continue;
			}
			const kind =
				expression === "channelController"
					? "cc"
					: expression === "pitchBend"
						? "bend"
						: expression === "channelPressure"
							? "pressure"
							: null;
			if (!kind) {
				drop(`${name || "A clip"}: ${expression} expression`);
				continue;
			}
			const controller = kind === "cc" ? num(kid(pts, "Target"), "controller", 0) : undefined;
			for (const p of kids(pts, "RealPoint"))
				laneEvents.push({
					at: toSeconds(num(p, "time", 0), contentUnit),
					kind,
					...(kind === "cc" ? { controller } : {}),
					value: clamp(num(p, "value", 0), 0, 1),
				});
		}
		const warps = kid(el, "Warps");
		const audio = kid(el, "Audio") ?? kid(warps, "Audio");
		const notesEl = kid(el, "Notes");
		if (clips.length >= MAX_STUDIO_CLIPS) {
			drop(`${name || "A clip"} (over the ${MAX_STUDIO_CLIPS}-clip limit)`);
			return;
		}
		if (audio) {
			const path = attr(kid(audio, "File"), "path") ?? "";
			if (!path) {
				drop(`${name || "An audio clip"}: no file`);
				return;
			}
			const label =
				name ||
				path
					.replace(/^.*\//, "")
					.replace(/\.[a-z0-9]+$/i, "")
					.slice(0, 60);
			const sourceId = sourceFor(path, label, num(audio, "sampleRate", 0));
			const fileSeconds = num(audio, "duration", 0);
			// The offset into the file, and the warp (docs/multitrack-recorder.md "Warping a clip"): the Warps' points map the
			// clip's content time to the file's; kept as Dawn's warp when they stretch, else folded into the offset.
			let offset = toSeconds(playStart, contentUnit);
			let warp: StudioWarp | undefined;
			if (warps) {
				const contentUnitOfWarps = unitOf(warps, "seconds", "contentTimeUnit");
				const points = kids(warps, "Warp").map((w) => ({
					at: toSeconds(num(w, "time", 0), contentUnit),
					source: toSeconds(num(w, "contentTime", 0), contentUnitOfWarps),
				}));
				const kept = warpFromPoints(points);
				if (kept) {
					warp = kept;
					fix("Warped audio kept, stretched by Dawn's own algorithm");
				} else if (points.length) {
					// The file at its own speed from the first point: the offset shifts by what the points say.
					const first = [...points].sort((a, b) => a.at - b.at)[0]!;
					offset = Math.max(0, first.source + (offset - first.at));
				}
			}
			if (!(duration > 0)) duration = Math.max(0.001, fileSeconds - offset);
			remember(el, audio, { sourceId, offset: seconds(Math.max(0, offset)) });
			const loop = loopOf((v) => toSeconds(v, contentUnit), Math.max(0, offset), duration);
			clips.push({
				id: nanoid(),
				trackId: owner.id,
				sourceId,
				start,
				offset: seconds(Math.max(0, offset)),
				duration: clamp(seconds(duration) || 0.001, 0.001, MAX_STUDIO_SECONDS),
				gain: 1,
				fadeIn,
				fadeOut,
				name: label,
				...off,
				...(loop ? { loop } : {}),
				...(warp ? { warp } : {}),
			});
			return;
		}
		if (notesEl) {
			const notes = kids(notesEl, "Note")
				.map((n) => ({
					t: seconds(toSeconds(num(n, "time", 0), contentUnit)),
					d: clamp(
						toSeconds(num(n, "duration", 0), contentUnit) || 0.001,
						0.001,
						MAX_STUDIO_SECONDS,
					),
					p: clamp(Math.round(num(n, "key", 60)), 0, 127),
					v: clamp(num(n, "vel", 0.8), 0, 1),
				}))
				.sort((a, b) => a.t - b.t);
			if (notes.length > MAX_STUDIO_NOTES_PER_CLIP)
				drop(
					`${name || "A notes clip"}: ${notes.length - MAX_STUDIO_NOTES_PER_CLIP} notes over the limit`,
				);
			const kept = notes.slice(0, MAX_STUDIO_NOTES_PER_CLIP);
			const track = tracks.find((t) => t.id === owner.id)!;
			if (track.kind !== "midi") {
				drop(`${name || "A notes clip"} on ${owner.name} (an audio track)`);
				return;
			}
			const end = kept.reduce((m, n) => Math.max(m, n.t + n.d), 0);
			if (!(duration > 0)) duration = Math.max(0.001, end - toSeconds(playStart, contentUnit));
			remember(el, notesEl, { notes: kept });
			const loop = loopOf(
				(v) => toSeconds(v, contentUnit),
				toSeconds(playStart, contentUnit),
				duration,
			);
			const lanes = lanesFromEvents(
				laneEvents,
				0,
				Math.max(end, duration + toSeconds(playStart, contentUnit), 0.001),
			);
			clips.push({
				id: nanoid(),
				trackId: owner.id,
				notes: kept,
				anchor: "beats",
				start,
				offset: seconds(toSeconds(playStart, contentUnit)),
				duration: clamp(seconds(duration) || 0.001, 0.001, MAX_STUDIO_SECONDS),
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: name || "Notes",
				...off,
				...(loop ? { loop } : {}),
				...(lanes.length ? { lanes } : {}),
			});
			return;
		}
		drop(`${name || "A clip"}: nothing Dawn plays`);
	};
	const readPoints = (el: Element, unit: TimeUnit) => {
		const targetEl = kid(el, "Target");
		const target = attr(targetEl, "parameter");
		const hit = target ? paramOwner.get(target) : undefined;
		const pts = kids(el, "RealPoint");
		if (target && tempoParamId && target === tempoParamId) {
			for (const p of pts)
				laneTempo.push({
					start: seconds(toSeconds(num(p, "time", 0), unit)),
					bpm: clamp(round2(num(p, "value", bpm)), 30, 300),
				});
			return;
		}
		const bools = kids(el, "BoolPoint");
		if (!hit || (hit.owner.kind === "master" && hit.key === "pan")) {
			if (!pts.length && !bools.length) return;
			// A MIDI expression (a controller, pitch bend, pressure) inside a notes clip: Bitwig's way of keeping CC lanes.
			const expression = attr(targetEl, "expression");
			if (expression)
				drop(`MIDI ${expression === "channelController" ? "controller" : expression} automation`);
			else if (hit) drop("the master's pan automation");
			else drop(`automation of ${target ?? "a parameter"}`);
			return;
		}
		const unitAttr = attr(el, "unit");
		// The mute as bool points (a switch, held to the next); every other lane as real points in its units.
		const lane = (
			hit.key === "mute"
				? bools.map((p) => ({
						t: seconds(toSeconds(num(p, "time", 0), unit)),
						v: attr(p, "value") === "true" ? 1 : 0,
					}))
				: pts.map((p) => {
						const raw = num(p, "value", 0);
						const top = hit.key.startsWith("send:") ? 1 : STUDIO_FADER_MAX;
						const v =
							hit.key === "pan"
								? clamp(round4(raw * 2 - 1), -1, 1)
								: unitAttr === "decibel"
									? clamp(round4(Math.pow(10, raw / 20)), 0, top)
									: clamp(raw, 0, top);
						return { t: seconds(toSeconds(num(p, "time", 0), unit)), v };
					})
		)
			.sort((a, b) => a.t - b.t)
			.slice(0, MAX_AUTOMATION_POINTS);
		if (!lane.length) return;
		const existing = automation.get(hit.owner.id) ?? {};
		existing[hit.key] = lane;
		automation.set(hit.owner.id, existing);
	};
	const readMarkers = (el: Element | null, unit: TimeUnit) => {
		for (const m of kids(el, "Marker")) {
			if (markers.length >= MAX_STUDIO_MARKERS) break;
			markers.push({
				id: nanoid(),
				t: seconds(toSeconds(num(m, "time", 0), unitOf(el, unit))),
				name: (attr(m, "name") ?? "").trim().slice(0, 40) || "Marker",
			});
		}
	};
	const readLanes = (el: Element, owner: Owner | null, unit: TimeUnit) => {
		const here = unitOf(el, unit);
		// Any timeline may name its track (the reference writer puts `track` on Clips, Bitwig on Lanes).
		const ownerOf = (node: Element, fallback: Owner | null) => {
			const track = attr(node, "track");
			return track ? (trackOwner.get(track) ?? null) : fallback;
		};
		const own = ownerOf(el, owner);
		for (const child of Array.from(el.children)) {
			switch (child.localName.toLowerCase()) {
				case "lanes":
					readLanes(child, own, here);
					break;
				case "clips": {
					const clipOwner = ownerOf(child, own);
					for (const c of kids(child, "Clip")) readClip(c, clipOwner, unitOf(child, here), 0);
					break;
				}
				case "points":
					readPoints(child, unitOf(child, here));
					break;
				case "markers":
					readMarkers(child, here);
					break;
				default:
					break;
			}
		}
	};
	const rootLanes = kid(arrangementEl, "Lanes");
	if (rootLanes) readLanes(rootLanes, null, unitOf(rootLanes, "beats"));
	readMarkers(kid(arrangementEl, "Markers"), "beats");
	if (beatsUsed) fix("Times in beats, converted to seconds through the tempo map");
	if (kid(root, "Scenes")) drop("clip launcher scenes");
	let masterAutomation: StudioAutomation | undefined;
	for (const [ownerId, lanes] of automation) {
		const t = tracks.find((x) => x.id === ownerId);
		const b = buses.find((x) => x.id === ownerId);
		if (t) t.automation = lanes;
		else if (b) b.automation = lanes;
		else if (ownerId === "master") masterAutomation = lanes;
	}

	// ── Tempo and meter changes on the ruler ─────────────────────────────
	// The tempo map's changes and ramps, and any tempo points the lanes carried (a point at zero is the song's own tempo).
	const atZero = laneTempo.find((c) => c.start === 0);
	if (atZero && tempoSteps.length === 1) tempoSteps[0] = { start: 0, bpm: atZero.bpm };
	const tempoChanges = [
		...tempoSteps.slice(1).map((s) => ({ ...s, start: seconds(s.start) })),
		...laneTempo,
	]
		.sort((a, b) => a.start - b.start)
		.filter((c, i, all) => c.start > 0 && (i === 0 || c.start !== all[i - 1]!.start))
		.slice(0, 64);
	const meterChanges = kids(kid(arrangementEl, "TimeSignatureAutomation"), "TimeSignaturePoint")
		.map((p) => ({ beat: num(p, "time", 0), ...meterOf(p, beatsPerBar) }))
		.filter((p) => p.beat > 0)
		.sort((a, b) => a.beat - b.beat)
		.map((p) => ({
			start: seconds(beatsToSeconds(p.beat)),
			beatsPerBar: p.beatsPerBar,
			...(p.beatUnit !== 4 ? { beatUnit: p.beatUnit as 2 | 8 | 16 } : {}),
		}))
		.filter((c, i, all) => i === 0 || c.start !== all[i - 1]!.start)
		.slice(0, 64);

	// ── Metadata: every field the file has, each a line of the notes, the comment as itself ──
	let title = "";
	const noteLines: string[] = [];
	const metadata: DawprojectMetadata = {};
	if (metadataXml) {
		const meta = new DOMParser().parseFromString(metadataXml, "application/xml");
		if (!meta.getElementsByTagName("parsererror").length) {
			const text = (tag: string) => meta.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
			title = text("Title");
			for (const field of DAWPROJECT_METADATA_FIELDS) {
				const value = text(field[0]!.toUpperCase() + field.slice(1));
				if (!value) continue;
				metadata[field] = value;
				noteLines.push(field === "comment" ? value : `${META_LABELS[field]}: ${value}`);
			}
		}
	}
	const app = kid(root, "Application");
	if (app)
		noteLines.push(
			`Imported from ${attr(app, "name") ?? "a DAW"}${attr(app, "version") ? ` ${attr(app, "version")}` : ""}.`,
		);

	// The song's rate: the one most of the files have, when it is one a song may render at (the odd file is resampled on load).
	const counts = new Map<number, number>();
	for (const f of files)
		if (f.sampleRate) counts.set(f.sampleRate, (counts.get(f.sampleRate) ?? 0) + 1);
	const common = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0];
	const sampleRate = (STUDIO_SAMPLE_RATES as readonly number[]).includes(common ?? 0)
		? (common as StudioArrangement["sampleRate"])
		: undefined;
	const arrangement: StudioArrangement = {
		version: 1,
		bpm: tempoSteps[0]!.bpm,
		beatsPerBar,
		...(meter.beatUnit !== 4 ? { beatUnit: meter.beatUnit as 2 | 8 | 16 } : {}),
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master,
		...(masterAutomation ? { masterAutomation } : {}),
		tracks,
		clips,
		...(sampleRate ? { sampleRate } : {}),
		...(buses.length ? { buses } : {}),
		...(markers.length ? { markers } : {}),
		...(tempoChanges.length ? { tempoChanges } : {}),
		...(meterChanges.length ? { meterChanges } : {}),
	};
	return {
		title: title.slice(0, 120) || fallbackTitle.slice(0, 120) || "Imported project",
		notes: noteLines.join("\n"),
		...(Object.keys(metadata).length ? { metadata } : {}),
		arrangement,
		files,
		dropped,
		fixed,
	};
}
