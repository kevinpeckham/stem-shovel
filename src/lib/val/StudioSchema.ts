import * as v from "valibot";
import {
	MAX_STUDIO_CLIPS,
	MAX_STUDIO_SECONDS,
	MAX_STUDIO_TRACKS,
	STUDIO_FADER_MAX,
} from "../constants/studio";
import { MAX_TAKE_BYTES } from "../constants/takeLimits";
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

export const STUDIO_INPUT_SOURCES = ["mic", "line", "computer"] as const;
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

export const StudioTrackSchema = v.object({
	id: LocalIdSchema,
	name: v.pipe(v.string(), v.trim(), v.maxLength(60)),
	/** A theme colour name the lane draws in (`studio-lane-<colour>` shortcuts); the default when missing. */
	colour: v.optional(v.pipe(v.string(), v.maxLength(24))),
	gain: v.pipe(v.number(), v.minValue(0), v.maxValue(STUDIO_FADER_MAX)),
	pan: v.pipe(v.number(), v.minValue(-1), v.maxValue(1)),
	muted: v.boolean(),
	solo: v.boolean(),
	armed: v.boolean(),
	input: v.nullable(StudioInputSchema),
});
export type StudioTrack = v.InferOutput<typeof StudioTrackSchema>;

/** A clip: `duration` seconds of its source from `offset`, placed at `start` on the timeline. */
export const StudioClipSchema = v.object({
	id: LocalIdSchema,
	trackId: LocalIdSchema,
	sourceId: NanoIdSchema,
	start: SecondsSchema,
	offset: SecondsSchema,
	duration: v.pipe(v.number(), v.minValue(0.001), v.maxValue(MAX_STUDIO_SECONDS)),
	gain: v.pipe(v.number(), v.minValue(0), v.maxValue(2)),
	fadeIn: v.pipe(v.number(), v.minValue(0), v.maxValue(60)),
	fadeOut: v.pipe(v.number(), v.minValue(0), v.maxValue(60)),
	name: v.pipe(v.string(), v.trim(), v.maxLength(60)),
});
export type StudioClip = v.InferOutput<typeof StudioClipSchema>;

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
	/** Bars on the ruler and snapping; off is free time. */
	gridOn: v.boolean(),
	countIn: v.boolean(),
	click: v.boolean(),
	loop: v.nullable(StudioLoopSchema),
	master: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	tracks: v.pipe(v.array(StudioTrackSchema), v.maxLength(MAX_STUDIO_TRACKS)),
	clips: v.pipe(v.array(StudioClipSchema), v.maxLength(MAX_STUDIO_CLIPS)),
});
export type StudioArrangement = v.InferOutput<typeof StudioArrangementSchema>;

/** Argument of autosaveArrangement: the song's current state, written as an unnamed revision when it changed. */
export const StudioAutosaveSchema = v.object({
	ideaId: NanoIdSchema,
	data: StudioArrangementSchema,
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
	notes: string;
	createdAt: Date;
	/** The newest revision's arrangement, named or not; null for a song never saved. */
	current: StudioArrangement | null;
	revisions: StudioRevisionView[];
	sources: StudioSourceView[];
}
