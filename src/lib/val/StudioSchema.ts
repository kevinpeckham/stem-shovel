import * as v from "valibot";
import {
	BEAT_UNITS,
	CLIP_ANCHORS,
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_MARKERS,
	MAX_STUDIO_NOTES_PER_CLIP,
	MAX_STUDIO_SECONDS,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
	STUDIO_SAMPLE_RATES,
	MAX_STUDIO_WARP_POINTS,
} from "../constants/studio";
import { MAX_AUTOMATION_POINTS } from "../constants/studioAutomation";
import {
	MAX_STUDIO_LANE_POINTS,
	MAX_STUDIO_LANES,
	STUDIO_LANE_KINDS,
} from "../constants/studioLanes";
import { INSERT_KINDS, MAX_INSERTS, MAX_SENDS, MAX_STUDIO_BUSES } from "../constants/studioInserts";
import { MAX_TAKE_BYTES } from "../constants/takeLimits";
import type { IdeaInstruments } from "./IdeaSchema";
import { NameSchema } from "./NameSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * The Studio (docs/multitrack-recorder.md): a song is an idea of kind
 * "song"; its arrangement is tracks of clips cut from sources (the
 * `studio_source` table), kept as JSON on `studio_revision` rows. Times are
 * seconds. Ids inside the arrangement are the browser's own nanoids.
 */

/** An id the browser minted for a track or a clip (nanoid, 21 chars). */
const LocalIdSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(32));
const SecondsSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS * 4));

/** The shared inputs, the instruments hosted in the Studio's context (phase 2: the piano, the chord player and the drum machine), and the Practice Amp (docs/practice-amp.md), hosted too. */
export const STUDIO_INPUT_SOURCES = [
	"mic",
	"line",
	"computer",
	"piano",
	"chords",
	"drums",
	"sampler",
	"amp",
] as const;
export const StudioInputSourceSchema = v.picklist(STUDIO_INPUT_SOURCES);
export type StudioInputSource = v.InferOutput<typeof StudioInputSourceSchema>;

export const STUDIO_CHANNELS = ["stereo", "left", "right"] as const;
export const StudioChannelSchema = v.picklist(STUDIO_CHANNELS);
export type StudioChannel = v.InferOutput<typeof StudioChannelSchema>;

/** A track's input: which of the shared inputs feeds it, and which of its channels. */
export const StudioInputSchema = v.object({
	source: StudioInputSourceSchema,
	channel: StudioChannelSchema,
});
export type StudioInput = v.InferOutput<typeof StudioInputSchema>;

/** A sampler track's sound (D6): one of the song's recordings played across the keys from its root note, with an envelope, looping if asked. */
export const StudioSamplerSchema = v.object({
	sourceId: NanoIdSchema,
	/** The MIDI note the recording sounds at as it is. */
	root: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
	attack: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
	release: v.pipe(v.number(), v.minValue(0), v.maxValue(5)),
	loop: v.boolean(),
});
export type StudioSampler = v.InferOutput<typeof StudioSamplerSchema>;

/** A track's effects (docs/multitrack-recorder.md, phase 2b): the piano chain's compressor, tone and reverb, each off at its zero. */
export const StudioTrackFxSchema = v.object({
	compressor: v.object({
		/** 0 (off, the signal goes round the node) to 1: the threshold from 0 down to -40 dB. */
		amount: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
		ratio: v.pipe(v.number(), v.minValue(1), v.maxValue(20)),
		attack: v.pipe(v.number(), v.minValue(0.001), v.maxValue(1)),
		release: v.pipe(v.number(), v.minValue(0.01), v.maxValue(2)),
		/** Make-up gain in dB. */
		makeup: v.pipe(v.number(), v.minValue(0), v.maxValue(24)),
	}),
	tone: v.object({
		tilt: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
		air: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
		bottom: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	}),
	reverb: v.object({
		level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
		size: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	}),
});
export type StudioTrackFx = v.InferOutput<typeof StudioTrackFxSchema>;

/** An audio track records and plays files; a MIDI track (phase 3) records and plays notes through the instrument its input names. Absent means audio. */
export const STUDIO_TRACK_KINDS = ["audio", "midi"] as const;
/** How a clip's fades (and a crossfade between overlapping clips) curve: a straight line, or equal power (a quarter sine), which keeps the level steady through a crossfade. */
export const STUDIO_FADE_SHAPES = ["linear", "power"] as const;
export type StudioFadeShape = (typeof STUDIO_FADE_SHAPES)[number];
export const StudioTrackKindSchema = v.picklist(STUDIO_TRACK_KINDS);
export type StudioTrackKind = v.InferOutput<typeof StudioTrackKindSchema>;

/** A breakpoint of an automation lane (docs/dawn-daw-plan.md, D1): seconds on the timeline, the value in the parameter's units. */
export const StudioAutomationPointSchema = v.object({
	t: SecondsSchema,
	v: v.pipe(v.number(), v.minValue(-1), v.maxValue(STUDIO_FADER_MAX)),
});
export type StudioAutomationPoint = v.InferOutput<typeof StudioAutomationPointSchema>;
const LaneSchema = v.pipe(
	v.array(StudioAutomationPointSchema),
	v.maxLength(MAX_AUTOMATION_POINTS),
	v.check((pts) => pts.every((p, i) => i === 0 || p.t >= pts[i - 1]!.t), "A lane is in time order"),
);
/**
 * A strip's lanes by key (docs/dawn-daw-plan.md, D1 and D2): `volume`,
 * `pan`, `mute` (a switch: 1 muted, 0 on, held to the next point),
 * `send:<busId>` and `insert:<insertId>:<param>`
 * (utils/automationLanes.ts); absent means none.
 */
export const StudioAutomationSchema = v.record(
	v.pipe(v.string(), v.regex(/^(volume|pan|mute|send:[\w-]+|insert:[\w-]+:[A-Za-z]+)$/)),
	LaneSchema,
);
export type StudioAutomation = v.InferOutput<typeof StudioAutomationSchema>;

/** An insert (constants/studioInserts.ts): a kind, its settings (numbers, and the delay's `analog`), a local id a lane can name, and an optional bypass. */
export const StudioInsertSchema = v.object({
	id: LocalIdSchema,
	kind: v.picklist(INSERT_KINDS),
	bypass: v.optional(v.boolean()),
	settings: v.record(v.string(), v.union([v.number(), v.boolean()])),
});
export type StudioInsert = v.InferOutput<typeof StudioInsertSchema>;
const InsertListSchema = v.pipe(v.array(StudioInsertSchema), v.maxLength(MAX_INSERTS));

/** A send from a track to a bus: post-fader unless `pre`. */
export const StudioSendSchema = v.object({
	bus: LocalIdSchema,
	level: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	pre: v.optional(v.boolean()),
});
export type StudioSend = v.InferOutput<typeof StudioSendSchema>;

/**
 * A bus (docs/dawn-daw-plan.md, D2): tracks route to it or send to it; it
 * has its own inserts, level and pan, and goes to the master, or to
 * another bus (`output`). A `folder` bus is a group (docs/multitrack-recorder.md
 * "Folder tracks"): the tracks and buses routed to it sit under it in the
 * timeline, which collapses them to one row.
 */
export const StudioBusSchema = v.object({
	id: LocalIdSchema,
	name: v.pipe(v.string(), v.trim(), v.maxLength(60)),
	colour: v.optional(v.pipe(v.string(), v.maxLength(24))),
	gain: v.pipe(v.number(), v.minValue(0), v.maxValue(STUDIO_FADER_MAX)),
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	muted: v.boolean(),
	inserts: v.optional(InsertListSchema),
	automation: v.optional(StudioAutomationSchema),
	/** Where the bus goes: another bus's id, or the master when absent. */
	output: v.optional(LocalIdSchema),
	/** A group: shown as a row in the timeline with what routes to it under it. */
	folder: v.optional(v.boolean()),
});
export type StudioBus = v.InferOutput<typeof StudioBusSchema>;

export const StudioTrackSchema = v.object({
	id: LocalIdSchema,
	kind: v.optional(StudioTrackKindSchema),
	name: v.pipe(v.string(), v.trim(), v.maxLength(60)),
	/** A tint id (constants/stemTints.ts) or any `#rrggbb` color the lane draws in; the default when missing. */
	colour: v.optional(v.pipe(v.string(), v.maxLength(24))),
	gain: v.pipe(v.number(), v.minValue(0), v.maxValue(STUDIO_FADER_MAX)),
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	muted: v.boolean(),
	solo: v.boolean(),
	armed: v.boolean(),
	input: v.nullable(StudioInputSchema),
	/** Automation lanes (docs/dawn-daw-plan.md, D1); absent means the knobs alone. */
	automation: v.optional(StudioAutomationSchema),
	/** The track's inserts (D2); absent means its old `fx` (utils/insertsFromFx.ts). */
	inserts: v.optional(InsertListSchema),
	/** Where the track goes: a bus's id, or the master when absent. */
	output: v.optional(LocalIdSchema),
	/** Sends to buses, one per bus at most. */
	sends: v.optional(v.pipe(v.array(StudioSendSchema), v.maxLength(MAX_SENDS))),
	/** A mono track (docs/multitrack-recorder.md "Mono tracks"): summed to one channel, panned as a point source; absent means stereo. */
	mono: v.optional(v.boolean()),
	/** The track's effects before D2; absent means every effect off. */
	fx: v.optional(StudioTrackFxSchema),
	/** A MIDI track's feel (D5): swing of the off-beat eighths (0 straight, 1 a triplet feel) and humanize (a little scatter in time and touch), applied as the notes play. */
	swing: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	humanize: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	/** A sampler track's sound (D6); absent until a recording is chosen. */
	sampler: v.optional(StudioSamplerSchema),
	/** Frozen (D8): the clips and inserts put away while one rendering stands in for them; unfreeze restores. */
	frozen: v.optional(v.lazy(() => StudioFrozenSchema)),
});
export type StudioTrack = v.InferOutput<typeof StudioTrackSchema>;

/**
 * One note of a MIDI clip (docs/multitrack-recorder.md, phase 3): `t`
 * seconds from the clip's content origin (where `offset` 0 is), `d` seconds
 * long, pitch 0..127 (60 is middle C; a drum voice's General MIDI note on a
 * drums track), velocity 0..1. Seconds, not beats: a MIDI clip sits on the
 * timeline as an audio clip does and keeps its place when the tempo changes.
 */
export const StudioNoteSchema = v.object({
	t: SecondsSchema,
	d: v.pipe(v.number(), v.minValue(0.001), v.maxValue(MAX_STUDIO_SECONDS)),
	p: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127)),
	v: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});
export type StudioNote = v.InferOutput<typeof StudioNoteSchema>;

/** A breakpoint of a clip's gain envelope: content seconds like a note's `t`, a gain factor from silence to double. */
export const StudioGainPointSchema = v.object({
	t: SecondsSchema,
	v: v.pipe(v.number(), v.minValue(0), v.maxValue(2)),
});
export type StudioGainPoint = v.InferOutput<typeof StudioGainPointSchema>;
/** The most points a clip's gain envelope holds. */
export const MAX_STUDIO_GAIN_POINTS = 256;
/** A breakpoint of an expression lane: content seconds like a note's `t`, a normalized value held until the next point. */
export const StudioLanePointSchema = v.object({
	t: SecondsSchema,
	v: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
});
export type StudioLanePoint = v.InferOutput<typeof StudioLanePointSchema>;
/**
 * An expression lane of a notes clip (constants/studioLanes.ts): a
 * controller (`cc` with its number), the pitch bend (0.5 at center) or
 * the channel pressure, as points over the clip's content.
 */
export const StudioClipLaneSchema = v.pipe(
	v.object({
		kind: v.picklist(STUDIO_LANE_KINDS),
		controller: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(127))),
		points: v.pipe(v.array(StudioLanePointSchema), v.maxLength(MAX_STUDIO_LANE_POINTS)),
	}),
	v.check(
		(l) => l.kind !== "cc" || l.controller !== undefined,
		"A controller lane names its controller",
	),
);
export type StudioClipLane = v.InferOutput<typeof StudioClipLaneSchema>;

/** The shortest loop a clip can have, so a song's loops never queue more than a few thousand passes. */
export const MIN_CLIP_LOOP_SECONDS = 0.1;

/** A warp point (docs/multitrack-recorder.md "Warping a clip"): the clip's content second `at` plays the file's second `source`. */
export const StudioWarpPointSchema = v.object({ at: SecondsSchema, source: SecondsSchema });
export type StudioWarpPoint = v.InferOutput<typeof StudioWarpPointSchema>;
/**
 * A clip's warp: at least two points, `at` strictly rising and `source`
 * never falling, the map running straight between them and on past the
 * ends at the last segment's rate (audio/warp.ts). The clip's `offset`,
 * `duration` and `loop` are seconds of the warped content, not the file.
 */
export const StudioWarpSchema = v.pipe(
	v.array(StudioWarpPointSchema),
	v.minLength(2),
	v.maxLength(MAX_STUDIO_WARP_POINTS),
	v.check(
		(w) => w.every((p, i) => i === 0 || (p.at > w[i - 1]!.at && p.source >= w[i - 1]!.source)),
		"Warp points run forward in both the clip and the file",
	),
);
export type StudioWarp = v.InferOutput<typeof StudioWarpSchema>;

/**
 * A clip: `duration` seconds of its source from `offset`, placed at `start`
 * on the timeline. An audio clip names its source; a MIDI clip carries its
 * notes instead (one or the other, never both nor neither).
 */
export const StudioClipSchema = v.pipe(
	v.object({
		id: LocalIdSchema,
		trackId: LocalIdSchema,
		sourceId: v.optional(NanoIdSchema),
		/** A MIDI clip's notes; the clip is a MIDI clip when present. */
		notes: v.optional(v.pipe(v.array(StudioNoteSchema), v.maxLength(MAX_STUDIO_NOTES_PER_CLIP))),
		start: SecondsSchema,
		offset: SecondsSchema,
		duration: v.pipe(v.number(), v.minValue(0.001), v.maxValue(MAX_STUDIO_SECONDS)),
		gain: v.pipe(v.number(), v.minValue(0), v.maxValue(2)),
		fadeIn: v.pipe(v.number(), v.minValue(0), v.maxValue(60)),
		fadeOut: v.pipe(v.number(), v.minValue(0), v.maxValue(60)),
		name: v.pipe(v.string(), v.trim(), v.maxLength(60)),
		/** Other takes recorded for this spot (take lanes): sources the clip can swap to; the one in `sourceId` is the chosen take. */
		alternates: v.optional(v.pipe(v.array(NanoIdSchema), v.maxLength(32))),
		/** The shape of the clip's own fades (D4): linear, or equal-power (`power`) as a crossfade needs. Absent means linear. */
		fadeShape: v.optional(v.picklist(STUDIO_FADE_SHAPES)),
		/**
		 * A gain envelope over the clip's content (docs/multitrack-recorder.md "Clip gain envelopes"): points in content seconds,
		 * each a factor on the clip's gain, a line between them, held flat beyond the ends (utils/gainEnvelope.ts). Absent means one.
		 */
		gainEnvelope: v.optional(
			v.pipe(v.array(StudioGainPointSchema), v.maxLength(MAX_STUDIO_GAIN_POINTS)),
		),
		/**
		 * A loop over the content (docs/multitrack-recorder.md, "Looping a clip"): content seconds, like `offset`. The clip plays from
		 * `offset` to `end`, then `start` to `end` again and again for its `duration` (utils/clipSegments.ts). Absent means it plays once.
		 */
		/** A notes clip's expression lanes (constants/studioLanes.ts): one per controller, bend or pressure, played with the notes. */
		lanes: v.optional(v.pipe(v.array(StudioClipLaneSchema), v.maxLength(MAX_STUDIO_LANES))),
		/** Switched off (docs/multitrack-recorder.md, "Switched-off clips"): kept on the timeline, dimmed, playing nothing. Absent means on. */
		muted: v.optional(v.boolean()),
		/** The clip's audio stretched, pitch kept (docs/multitrack-recorder.md "Warping a clip"); absent means the file's own speed. */
		warp: v.optional(StudioWarpSchema),
		/**
		 * What the clip holds to when the tempo map changes (docs/multitrack-recorder.md "Beats-anchored clips"): `beats` keeps
		 * its place and length in beats (a MIDI clip's notes with it; an audio clip stretched to fit), `seconds` (and absent) its seconds.
		 */
		anchor: v.optional(v.picklist(CLIP_ANCHORS)),
		loop: v.optional(
			v.pipe(
				v.object({ start: SecondsSchema, end: SecondsSchema }),
				v.check(
					(l) => l.end - l.start >= MIN_CLIP_LOOP_SECONDS,
					"A loop is at least a tenth of a second",
				),
			),
		),
	}),
	v.check(
		(c) => (c.sourceId !== undefined) !== (c.notes !== undefined),
		"A clip has a source or notes, not both",
	),
);
export type StudioClip = v.InferOutput<typeof StudioClipSchema>;

/**
 * How a tempo ramp runs (docs/multitrack-recorder.md "Tempo ramps"): "time"
 * moves the tempo linearly with the seconds (Reaper's way), "beats" linearly
 * with the beats (a DAWproject's and Live's: each beat a little longer than
 * the last, the classical ritardando).
 */
export const TEMPO_CURVES = ["time", "beats"] as const;
export type TempoCurve = (typeof TEMPO_CURVES)[number];
/**
 * A tempo change (D5): from `start` seconds on, this many beats a minute. With
 * `ramp`, the tempo moves from the one before it to `bpm`, arriving at
 * `start`, along that curve.
 */
export const StudioTempoChangeSchema = v.object({
	start: v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS)),
	bpm: v.pipe(v.number(), v.minValue(30), v.maxValue(300)),
	ramp: v.optional(v.picklist(TEMPO_CURVES)),
});
export type StudioTempoChange = v.InferOutput<typeof StudioTempoChangeSchema>;
/** The note a beat of the bar is (constants/studio.ts BEAT_UNITS); absent means a quarter. */
export const BeatUnitSchema = v.picklist(BEAT_UNITS);
export type BeatUnit = v.InferOutput<typeof BeatUnitSchema>;
/** A meter change (D5): from `start` seconds on, this many beats a bar, of this note (a quarter when absent). */
export const StudioMeterChangeSchema = v.object({
	start: v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS)),
	beatsPerBar: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(7)),
	beatUnit: v.optional(BeatUnitSchema),
});
export type StudioMeterChange = v.InferOutput<typeof StudioMeterChangeSchema>;
/** A key change (Kevin, 2026-10-20): from `start` seconds on, this key, as written ("F#m", "A♭ major"). */
const KeySchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(20));
export const StudioKeyChangeSchema = v.object({
	start: v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS)),
	key: KeySchema,
});
export type StudioKeyChange = v.InferOutput<typeof StudioKeyChangeSchema>;

/** A marker on the ruler (D4): a named moment to jump to. */
export const StudioMarkerSchema = v.object({
	id: LocalIdSchema,
	t: SecondsSchema,
	name: v.pipe(v.string(), v.trim(), v.maxLength(40)),
});
export type StudioMarker = v.InferOutput<typeof StudioMarkerSchema>;

/** What a frozen track keeps (D8): its clips as they were, and the inserts (or the old fx) the rendering baked in. */
export const StudioFrozenSchema = v.object({
	clips: v.array(StudioClipSchema),
	inserts: v.optional(InsertListSchema),
	fx: v.optional(StudioTrackFxSchema),
});
export type StudioFrozen = v.InferOutput<typeof StudioFrozenSchema>;

export const StudioLoopSchema = v.object({
	on: v.boolean(),
	start: SecondsSchema,
	end: SecondsSchema,
});

/** The whole arrangement, as the browser edits it and a revision stores it. */
export const StudioArrangementSchema = v.object({
	version: v.literal(1),
	bpm: v.pipe(v.number(), v.minValue(30), v.maxValue(300)),
	beatsPerBar: v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(7)),
	/** The note a beat of the bar is, from zero (the time signature's bottom number); a quarter when absent. */
	beatUnit: v.optional(BeatUnitSchema),
	/** Bars on the ruler and snapping; off is free time. */
	gridOn: v.boolean(),
	countIn: v.boolean(),
	click: v.boolean(),
	loop: v.nullable(StudioLoopSchema),
	/** Punch: a take is cut to the loop region (recording runs through, the clip keeps the region alone). */
	punch: v.optional(v.boolean()),
	master: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	/** The song's sample rate in Hz: the renders, stems and project files come out at it (STUDIO_SAMPLE_RATE_DEFAULT when absent). */
	sampleRate: v.optional(v.picklist(STUDIO_SAMPLE_RATES)),
	/** The master's inserts (D2), before its fader. */
	masterInserts: v.optional(InsertListSchema),
	/** The master's own lanes (docs/multitrack-recorder.md, "Wider automation"): `volume`, `mute` and its inserts' parameters. */
	masterAutomation: v.optional(StudioAutomationSchema),
	/** Buses (D2): tracks route or send to them; they go to the master. */
	buses: v.optional(v.pipe(v.array(StudioBusSchema), v.maxLength(MAX_STUDIO_BUSES))),
	tracks: v.pipe(v.array(StudioTrackSchema), v.maxLength(MAX_STUDIO_TRACKS)),
	clips: v.pipe(v.array(StudioClipSchema), v.maxLength(MAX_STUDIO_CLIPS)),
	/** Markers on the ruler (D4), in no particular order. */
	markers: v.optional(v.pipe(v.array(StudioMarkerSchema), v.maxLength(MAX_STUDIO_MARKERS))),
	/** The tempo map (D5): changes after the song's own tempo and meter, each at a second (utils/studioGrid.ts). */
	tempoChanges: v.optional(v.pipe(v.array(StudioTempoChangeSchema), v.maxLength(64))),
	meterChanges: v.optional(v.pipe(v.array(StudioMeterChangeSchema), v.maxLength(64))),
	/** The song's key from zero, as written, and the changes after it (the stem player's key changes, both ways). */
	key: v.optional(KeySchema),
	keyChanges: v.optional(v.pipe(v.array(StudioKeyChangeSchema), v.maxLength(64))),
});
export type StudioArrangement = v.InferOutput<typeof StudioArrangementSchema>;

/** Argument of autosaveArrangement: the song's current state, written as an unnamed revision when it changed. */
export const StudioAutosaveSchema = v.object({
	ideaId: NanoIdSchema,
	data: StudioArrangementSchema,
	/** The newest revision's number the browser knows (D7): a newer one from someone else means the save is refused and the browser reloads. */
	base: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0))),
});

/** Argument of saveStudioRevision: the current state kept under a name. */
export const StudioRevisionSaveSchema = v.object({
	ideaId: NanoIdSchema,
	name: NameSchema,
	data: StudioArrangementSchema,
});

export const StudioRevisionRenameSchema = v.object({ id: NanoIdSchema, name: NameSchema });

export const STUDIO_SOURCE_KINDS = ["take", "import", "bounce"] as const;
export const StudioSourceKindSchema = v.picklist(STUDIO_SOURCE_KINDS);
export type StudioSourceKind = v.InferOutput<typeof StudioSourceKindSchema>;

/** Body of POST /api/studio/sources: a file about to upload. */
export const StudioSourceReserveSchema = v.object({
	/** The id the browser already uses for this source in the arrangement (a nanoid it minted), so clips need no renaming once it is saved; the server mints one when absent. */
	id: v.optional(NanoIdSchema),
	ideaId: NanoIdSchema,
	kind: StudioSourceKindSchema,
	/** The track it was recorded on ("Guitar"), or the file's name for an import. */
	trackLabel: v.pipe(v.string(), v.trim(), v.maxLength(60)),
	/** The recording pass it came from (several sources share one), 0 for an import. */
	takeNumber: v.pipe(v.number(), v.integer(), v.minValue(0)),
	filename: v.pipe(v.string(), v.nonEmpty(), v.maxLength(255)),
	sizeBytes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_TAKE_BYTES)),
	/** "pcm" for the WAV the Studio writes; null for an import until decoded. */
	codec: v.nullable(v.picklist(["pcm", "flac", "alac", "aac", "opus"])),
	sampleRate: v.pipe(v.number(), v.integer(), v.minValue(8000), v.maxValue(192_000)),
	channels: v.picklist([1, 2]),
	durationSeconds: v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS)),
});
export type StudioSourceReserve = v.InferOutput<typeof StudioSourceReserveSchema>;

/** Body of POST /api/studio/sources/[id]/ready. */
export const StudioSourceReadySchema = v.object({
	url: v.pipe(v.string(), v.url()),
	peaks: v.pipe(v.array(v.pipe(v.number(), v.minValue(0), v.maxValue(1))), v.maxLength(4096)),
	durationSeconds: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS))),
});
export type StudioSourceReady = v.InferOutput<typeof StudioSourceReadySchema>;

/** A source as the page and the engine hold it. */
export interface StudioSourceView {
	id: string;
	kind: StudioSourceKind;
	takeNumber: number;
	trackLabel: string;
	url: string;
	filename: string;
	codec: string | null;
	sampleRate: number;
	channels: number;
	durationSeconds: number;
	sizeBytes: number;
	peaks: number[];
	createdAt: Date;
}

/** A revision as the page lists it (its data travels only for the current one, or on restore). */
export interface StudioRevisionView {
	id: string;
	number: number;
	name: string | null;
	createdAt: Date;
}

/** A song as the Studio page loads it. */
export interface StudioSongView {
	id: string;
	title: string;
	/** Shared with the band (D7): every editor of the account works on it; `own` says the viewer made it. */
	shared: boolean;
	own: boolean;
	notes: string;
	createdAt: Date;
	/** The instruments' settings as they were with the song (the idea's `instruments` JSON); null until an instrument track recorded. */
	instruments: IdeaInstruments | null;
	/** The newest revision's arrangement, named or not; null for a song never saved. */
	current: StudioArrangement | null;
	revisions: StudioRevisionView[];
	sources: StudioSourceView[];
}

/** A comment on a Dawn song (D7): the text and, when pinned, the moment in the song. */
export const StudioCommentCreateSchema = v.object({
	ideaId: NanoIdSchema,
	body: v.pipe(
		v.string(),
		v.trim(),
		v.minLength(1, "Write something."),
		v.maxLength(2000, "Keep the comment under 2000 characters."),
	),
	at: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(MAX_STUDIO_SECONDS * 4))),
});
export type StudioCommentCreate = v.InferOutput<typeof StudioCommentCreateSchema>;
export interface StudioCommentView {
	id: string;
	userId: string;
	userName: string;
	body: string;
	at: number | null;
	createdAt: Date;
}
/** Argument of setStudioShared: the song and whether the band may work on it. */
export const StudioShareSchema = v.object({ ideaId: NanoIdSchema, shared: v.boolean() });
