import { STEM_TINTS } from "#lib/constants/stemTints.js";
import { MAX_AUTOMATION_POINTS } from "#lib/constants/studioAutomation.js";
import { MAX_SENDS, MAX_STUDIO_BUSES } from "#lib/constants/studioInserts.js";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_SECONDS,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
} from "#lib/constants/studio.js";
import type {
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
}

export interface DawprojectRead {
	title: string;
	/** The metadata's artist and comment, as lines for the song's notes. */
	notes: string;
	arrangement: StudioArrangement;
	files: DawprojectFile[];
	/** What did not come across, in words for the import report. */
	dropped: string[];
}

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
export function readDawproject(projectXml: string, metadataXml?: string | null): DawprojectRead {
	const doc = new DOMParser().parseFromString(projectXml, "application/xml");
	if (doc.getElementsByTagName("parsererror").length || doc.documentElement.localName !== "Project")
		throw new Error("Not a DAWproject: project.xml did not parse");
	const root = doc.documentElement;
	const dropped: string[] = [];
	const drop = (what: string) => {
		if (!dropped.includes(what)) dropped.push(what);
	};

	// ── Helpers over the DOM ─────────────────────────────────────────────
	const kids = (el: Element | null | undefined, tag: string): Element[] =>
		el ? Array.from(el.children).filter((c) => c.localName === tag) : [];
	const kid = (el: Element | null | undefined, tag: string): Element | null =>
		kids(el, tag)[0] ?? null;
	const attr = (el: Element | null | undefined, name: string): string | null =>
		el?.getAttribute(name) ?? null;
	const num = (el: Element | null | undefined, name: string, fallback: number): number => {
		const v = Number(attr(el, name));
		return Number.isFinite(v) ? v : fallback;
	};
	const bool = (el: Element | null | undefined, name: string): boolean => attr(el, name) === "true";
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const round4 = (v: number) => Math.round(v * 10000) / 10000;
	const seconds = (v: number) => clamp(round4(v), 0, MAX_STUDIO_SECONDS * 4);

	// ── Transport, and the tempo map that turns beats into seconds ───────
	const transport = kid(root, "Transport");
	const tempoEl = kid(transport, "Tempo");
	const bpm = clamp(num(tempoEl, "value", 120), 30, 300);
	const sigEl = kid(transport, "TimeSignature");
	const beatsPerBar = clamp(Math.round(num(sigEl, "numerator", 4)), 2, 7);
	const arrangementEl = kid(root, "Arrangement");
	/** Tempo steps by beat, the song's own first; a tempo automation's points become steps (Dawn's map is steps). */
	const tempoSteps: { beat: number; bpm: number }[] = [{ beat: 0, bpm }];
	for (const p of kids(kid(arrangementEl, "TempoAutomation"), "RealPoint")) {
		const beat = num(p, "time", 0);
		const value = clamp(num(p, "value", bpm), 30, 300);
		if (beat <= 0) tempoSteps[0] = { beat: 0, bpm: value };
		else tempoSteps.push({ beat, bpm: value });
	}
	tempoSteps.sort((a, b) => a.beat - b.beat);
	const beatsToSeconds = (beats: number): number => {
		let s = 0;
		for (let i = 0; i < tempoSteps.length; i++) {
			const step = tempoSteps[i]!;
			const next = tempoSteps[i + 1];
			const end = next && next.beat < beats ? next.beat : beats;
			if (end > step.beat) s += ((end - step.beat) * 60) / step.bpm;
			if (!next || next.beat >= beats) break;
		}
		return s;
	};
	const toSeconds = (v: number, unit: TimeUnit) => (unit === "beats" ? beatsToSeconds(v) : v);
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
	const paramOwner = new Map<string, { owner: Owner; key: "volume" | "pan" }>();
	const trackOwner = new Map<string, Owner>();
	const tracks: StudioTrack[] = [];
	const buses: StudioBus[] = [];
	let master = 1;
	const pending: { owner: Owner; channel: Element | null }[] = [];
	const tint = (hex: string | null) =>
		hex ? STEM_TINTS.find((t) => t.hex.toLowerCase() === hex.toLowerCase())?.id : undefined;
	const volumeOf = (el: Element | null): number => {
		if (!el) return 1;
		const value = num(el, "value", 1);
		const unit = attr(el, "unit");
		if (unit === "decibel") return clamp(round4(Math.pow(10, value / 20)), 0, STUDIO_FADER_MAX);
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
		if (v) paramOwner.set(v, { owner, key: "volume" });
		if (p) paramOwner.set(p, { owner, key: "pan" });
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
				const target = attr(s, "destination");
				const bus = target ? channelOwner.get(target) : undefined;
				if (bus?.kind !== "bus" || !busById.has(bus.id)) return null;
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
		}
	}

	// ── The arrangement: clips, automation, markers ──────────────────────
	const clips: StudioClip[] = [];
	const files: DawprojectFile[] = [];
	const sourceByPath = new Map<string, string>();
	const markers: StudioMarker[] = [];
	const automation = new Map<string, StudioAutomation>();
	const sourceFor = (path: string, label: string) => {
		let id = sourceByPath.get(path);
		if (!id) {
			id = nanoid();
			sourceByPath.set(path, id);
			files.push({ sourceId: id, path, label });
		}
		return id;
	};
	const readClip = (el: Element, owner: Owner | null, unit: TimeUnit, baseSeconds: number) => {
		const name = (attr(el, "name") ?? "").trim().slice(0, 60);
		if (!owner || owner.kind !== "track") {
			drop(`${name || "A clip"} outside a track`);
			return;
		}
		const contentUnit = unitOf(el, unit, "contentTimeUnit");
		const fadeUnit = unitOf(el, unit, "fadeTimeUnit");
		const start = seconds(baseSeconds + toSeconds(num(el, "time", 0), unit));
		const durationRaw = attr(el, "duration");
		let duration = durationRaw === null ? 0 : toSeconds(num(el, "duration", 0), unit);
		const playStart = num(el, "playStart", 0);
		const fadeIn = clamp(toSeconds(num(el, "fadeInTime", 0), fadeUnit), 0, 60);
		const fadeOut = clamp(toSeconds(num(el, "fadeOutTime", 0), fadeUnit), 0, 60);
		// Nested clips: a clip holding clips (launcher content written into the arrangement) flattens one level.
		const nested = kid(el, "Clips");
		if (nested) {
			for (const c of kids(nested, "Clip")) readClip(c, owner, contentUnit, start);
			return;
		}
		if (kid(el, "Lanes")) drop(`${name || "A clip"}: nested lanes`);
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
			const sourceId = sourceFor(path, label);
			const fileSeconds = num(audio, "duration", 0);
			// The offset into the file: through the warps when there are any (content time in the warps' unit).
			let offset = toSeconds(playStart, contentUnit);
			if (warps) {
				const points = kids(warps, "Warp")
					.map((w) => ({ time: num(w, "time", 0), content: num(w, "contentTime", 0) }))
					.sort((a, b) => a.time - b.time);
				const contentUnitOfWarps = unitOf(warps, "seconds", "contentTimeUnit");
				if (points.length) {
					const at = (t: number) => {
						const after = points.findIndex((p) => p.time > t);
						const a = points[after === -1 ? points.length - 1 : Math.max(0, after - 1)]!;
						const b = points[after === -1 ? points.length - 1 : after]!;
						const content =
							b.time === a.time
								? a.content
								: a.content + ((t - a.time) * (b.content - a.content)) / (b.time - a.time);
						return toSeconds(content, contentUnitOfWarps);
					};
					offset = at(playStart);
					const last = points[points.length - 1]!;
					const first = points[0]!;
					if (points.length > 1 && last.time > first.time) {
						const clipSpan = toSeconds(last.time, contentUnit) - toSeconds(first.time, contentUnit);
						const fileSpan = at(last.time) - at(first.time);
						if (clipSpan > 0 && Math.abs(fileSpan / clipSpan - 1) > 0.02)
							drop(`${label}: stretched (plays at the file's own speed here)`);
					}
				}
			}
			if (!(duration > 0)) duration = Math.max(0.001, fileSeconds - offset);
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
			clips.push({
				id: nanoid(),
				trackId: owner.id,
				notes: kept,
				start,
				offset: seconds(toSeconds(playStart, contentUnit)),
				duration: clamp(seconds(duration) || 0.001, 0.001, MAX_STUDIO_SECONDS),
				gain: 1,
				fadeIn: 0,
				fadeOut: 0,
				name: name || "Notes",
			});
			return;
		}
		drop(`${name || "A clip"}: nothing Dawn plays`);
	};
	const readPoints = (el: Element, unit: TimeUnit) => {
		const target = attr(kid(el, "Target"), "parameter");
		const hit = target ? paramOwner.get(target) : undefined;
		const pts = kids(el, "RealPoint");
		if (!hit || hit.owner.kind === "master") {
			if (pts.length)
				drop(
					`automation of ${attr(kid(el, "Target"), "parameter") ?? "a parameter"}${hit ? ` on ${hit.owner.name}` : ""}`,
				);
			return;
		}
		const unitAttr = attr(el, "unit");
		const lane = pts
			.map((p) => {
				const raw = num(p, "value", 0);
				const v =
					hit.key === "pan"
						? clamp(round4(raw * 2 - 1), -1, 1)
						: unitAttr === "decibel"
							? clamp(round4(Math.pow(10, raw / 20)), 0, STUDIO_FADER_MAX)
							: clamp(raw, 0, STUDIO_FADER_MAX);
				return { t: seconds(toSeconds(num(p, "time", 0), unit)), v };
			})
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
		const track = attr(el, "track");
		const own = track ? (trackOwner.get(track) ?? null) : owner;
		for (const child of Array.from(el.children)) {
			switch (child.localName) {
				case "Lanes":
					readLanes(child, own, here);
					break;
				case "Clips":
					for (const c of kids(child, "Clip")) readClip(c, own, unitOf(child, here), 0);
					break;
				case "Points":
					readPoints(child, unitOf(child, here));
					break;
				case "Markers":
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
	if (kid(root, "Scenes")) drop("clip launcher scenes");
	for (const [ownerId, lanes] of automation) {
		const t = tracks.find((x) => x.id === ownerId);
		const b = buses.find((x) => x.id === ownerId);
		if (t) t.automation = lanes;
		else if (b) b.automation = lanes;
	}

	// ── Tempo and meter changes on the ruler ─────────────────────────────
	const tempoChanges = tempoSteps
		.slice(1)
		.map((s) => ({ start: seconds(beatsToSeconds(s.beat)), bpm: s.bpm }))
		.slice(0, 64);
	const meterChanges = kids(kid(arrangementEl, "TimeSignatureAutomation"), "TimeSignaturePoint")
		.map((p) => ({
			beat: num(p, "time", 0),
			beatsPerBar: clamp(Math.round(num(p, "numerator", beatsPerBar)), 2, 7),
		}))
		.filter((p) => p.beat > 0)
		.sort((a, b) => a.beat - b.beat)
		.map((p) => ({ start: seconds(beatsToSeconds(p.beat)), beatsPerBar: p.beatsPerBar }))
		.slice(0, 64);

	// ── Metadata ─────────────────────────────────────────────────────────
	let title = "";
	const noteLines: string[] = [];
	if (metadataXml) {
		const meta = new DOMParser().parseFromString(metadataXml, "application/xml");
		if (!meta.getElementsByTagName("parsererror").length) {
			const text = (tag: string) => meta.getElementsByTagName(tag)[0]?.textContent?.trim() ?? "";
			title = text("Title");
			const artist = text("Artist");
			const comment = text("Comment");
			if (artist) noteLines.push(`Artist: ${artist}`);
			if (comment) noteLines.push(comment);
		}
	}
	const app = kid(root, "Application");
	if (app)
		noteLines.push(
			`Imported from ${attr(app, "name") ?? "a DAW"}${attr(app, "version") ? ` ${attr(app, "version")}` : ""}.`,
		);

	const arrangement: StudioArrangement = {
		version: 1,
		bpm: tempoSteps[0]!.bpm,
		beatsPerBar,
		gridOn: true,
		countIn: false,
		click: false,
		loop: null,
		master,
		tracks,
		clips,
		...(buses.length ? { buses } : {}),
		...(markers.length ? { markers } : {}),
		...(tempoChanges.length ? { tempoChanges } : {}),
		...(meterChanges.length ? { meterChanges } : {}),
	};
	return {
		title: title.slice(0, 120) || "Imported project",
		notes: noteLines.join("\n"),
		arrangement,
		files,
		dropped,
	};
}
