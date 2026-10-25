/**
 * Dawn's features beside the DAWproject spec and other DAWs, for the
 * /multitrack-recorder/features grid. The columns are data: a new DAW is
 * one more entry in `DAWN_FEATURE_COLUMNS` and one more key in every
 * feature's `support` (the test checks every feature has every column).
 *
 * Sources, checked 2026-10-25: **Dawn** from docs/dawn-daw-plan.md (D1 to
 * D8), docs/multitrack-recorder.md and the user guide
 * scripts/user-docs/studio.md; **DAWproject** from the format's schema
 * (tests/dawproject/Project.xsd, MetaData.xsd), judged as "can the file
 * carry it" (an editing gesture, a recording aid or a collaboration
 * feature is "no" for a file format); **Reaper** from its well-known
 * feature set; **Sandyne** from version 2.5's user manual and interface
 * strings inside the application, docs/daw-interop-plan.md "Sandyne" and
 * utils/sandProject.ts. "unknown" where nothing seen settles it.
 */

export type DawnFeatureSupport = "yes" | "partial" | "no" | "unknown";

export const DAWN_FEATURE_SUPPORT_VALUES: readonly DawnFeatureSupport[] = [
	"yes",
	"partial",
	"no",
	"unknown",
];

export const DAWN_FEATURE_COLUMNS = [
	{ key: "dawn", label: "Dawn" },
	{ key: "dawproject", label: "DAWproject spec" },
	{ key: "reaper", label: "Reaper" },
	{ key: "sandyne", label: "Sandyne" },
] as const;

export type DawnFeatureColumnKey = (typeof DAWN_FEATURE_COLUMNS)[number]["key"];

export interface DawnFeature {
	name: string;
	/** Shown under the name: what Dawn does, or what the row means. */
	note?: string;
	support: Record<DawnFeatureColumnKey, DawnFeatureSupport>;
	/** Why one column's cell is partial (or what a yes is limited to): shown in that cell. */
	cellNotes?: Partial<Record<DawnFeatureColumnKey, string>>;
}

export interface DawnFeatureGroup {
	title: string;
	features: DawnFeature[];
}

/** A DAWproject names a device or plugin and its state; the sound itself stays in the DAW. */
const DEVICE_REFERENCE = "Names the device or plugin; the sound stays in the DAW";

export const DAWN_FEATURE_GROUPS: DawnFeatureGroup[] = [
	{
		title: "Tracks and routing",
		features: [
			{
				name: "Audio tracks",
				note: "Up to 64 tracks a song",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "MIDI and instrument tracks",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Buses",
				note: "Up to 32 buses and groups",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Groups and folder tracks, nested",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Sends",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Pre-fader and post-fader sends",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Master channel with its own effects",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Mono tracks",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Track colors",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Freeze a track",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Sidechain inputs",
				support: { dawn: "no", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "VCA faders",
				support: { dawn: "no", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
		],
	},
	{
		title: "Recording",
		features: [
			{
				name: "Audio recording",
				note: "Microphone, a line in, or the computer's own audio; kept lossless",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Several tracks at once",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "MIDI recording from a keyboard",
				support: { dawn: "partial", dawproject: "no", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawn: "Chrome, Edge and Firefox; not Safari" },
			},
			{
				name: "Takes",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
				cellNotes: { dawproject: "Lanes inside a clip" },
			},
			{
				name: "Comping takes",
				note: "Swipe across a take's lane to use it there",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "unknown" },
				cellNotes: { dawproject: "Carries the takes and the result, not the comp itself" },
			},
			{
				name: "Punch in and out",
				note: "To the loop region",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Loop recording",
				note: "Every pass a take",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Count-in and click",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Input monitoring",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Recording latency compensation",
				note: "A latency setting per input, with Calibrate",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
		],
	},
	{
		title: "Editing",
		features: [
			{
				name: "Clips over recordings, non-destructive",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Trim, split, move and duplicate",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Looped clips",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Fades with shapes",
				note: "Linear or equal power",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: "Fade lengths, no curve shape" },
			},
			{
				name: "Crossfades on overlaps",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: "As the overlapping clips' fades" },
			},
			{
				name: "Clip gain",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: "A gain expression on the clip" },
			},
			{
				name: "Clip gain envelopes",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Switch a clip off",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Linked (alias) clips",
				note: "A DAWproject's alias clips open in Dawn as copies",
				support: { dawn: "no", dawproject: "yes", reaper: "partial", sandyne: "yes" },
				cellNotes: { reaper: "Pooled MIDI items" },
			},
			{
				name: "Multi-selection and grouped moves",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Ripple delete",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Range edits across tracks",
				note: "Clear, cut out, or insert time",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Time-stretch and fit to tempo",
				note: "Pitch kept",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Warp markers",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Pitch-shift audio",
				support: { dawn: "yes", dawproject: "unknown", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Pitch correction",
				support: { dawn: "no", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Reverse",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Normalize",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Consolidate (bounce in place)",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Markers",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Sections (regions)",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Undo and redo",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Sample library with drag to the timeline",
				support: { dawn: "partial", dawproject: "no", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawn: "The song's own recordings; no loop library yet" },
			},
		],
	},
	{
		title: "Timing",
		features: [
			{
				name: "Tempo and time signature",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Tempo changes mid-song",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
				cellNotes: { sandyne: "A Tempo lane; Dawn's .sand export writes one tempo" },
			},
			{
				name: "Tempo ramps",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Meter changes mid-song",
				note: "Any beat note: 6/8, 2/2",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Grid and snap",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Clips that follow the tempo",
				note: "Placed in beats, stretched to fit",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Swing",
				note: "On MIDI tracks, as they play",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Humanize",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Tap tempo",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Tempo detection from a recording",
				support: { dawn: "yes", dawproject: "no", reaper: "unknown", sandyne: "unknown" },
			},
			{
				name: "Song key and key changes",
				support: { dawn: "yes", dawproject: "no", reaper: "partial", sandyne: "partial" },
				cellNotes: {
					reaper: "Key snap in the MIDI editor; no key track",
					sandyne: "One project scale",
				},
			},
			{
				name: "Sample rate per song",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: "Each audio file's rate; no project rate" },
			},
		],
	},
	{
		title: "Mixing",
		features: [
			{
				name: "Faders, pan, mute and solo",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Insert effects",
				note: "EQ, compressor, tone, delay (tempo-synced), reverb, limiter",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: {
					dawproject: "EQ, compressor, limiter and gate built in; the rest by reference",
				},
			},
			{
				name: "Third-party plugins",
				support: { dawn: "no", dawproject: "yes", reaper: "yes", sandyne: "partial" },
				cellNotes: {
					dawn: "Dawn's own effects only",
					dawproject: "VST2, VST3, CLAP and AU by reference",
					sandyne: "VST3",
				},
			},
			{
				name: "Mixer console",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Stage view: pan across, level up",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Automation lanes",
				note: "Volume, pan, mute, sends and insert parameters, on tracks, buses and the master",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Writing automation by moving a control",
				note: "A knob writes a point at the playhead while its lane is open",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Loudness meter (LUFS)",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
		],
	},
	{
		title: "Instruments and MIDI",
		features: [
			{
				name: "Built-in instruments",
				note: "Piano, chord player, drum machine, synth presets; the practice amp as an input",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: DEVICE_REFERENCE },
			},
			{
				name: "Sampler",
				note: "Any recording in the song across the keys",
				support: { dawn: "yes", dawproject: "partial", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: DEVICE_REFERENCE },
			},
			{
				name: "Multisample instruments (SFZ, soundfonts)",
				support: { dawn: "no", dawproject: "partial", reaper: "no", sandyne: "yes" },
				cellNotes: { dawproject: DEVICE_REFERENCE },
			},
			{
				name: "Drum patterns",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Piano roll",
				note: "Add, move and resize notes; velocity",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawproject: "The notes" },
			},
			{
				name: "Quantize and transpose",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Expression lanes",
				note: "Controllers, pitch bend and channel pressure",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "MIDI file import and export",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "MIDI out to hardware",
				support: { dawn: "no", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
		],
	},
	{
		title: "Files and interchange",
		features: [
			{
				name: "DAWproject export",
				note: "For Bitwig, Cubase and Studio One",
				support: { dawn: "yes", dawproject: "yes", reaper: "no", sandyne: "yes" },
			},
			{
				name: "DAWproject import",
				support: { dawn: "yes", dawproject: "yes", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Reaper project export (.rpp)",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Reaper project import (.rpp)",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Sandyne project export (.sand)",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Sandyne project import (.sand)",
				support: { dawn: "no", dawproject: "no", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Ableton Live set import (.als)",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "unknown" },
			},
			{
				name: "Timestamped Broadcast WAV clips",
				note: "In the session bundle, with a MIDI file of the tempo map",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Stems per track and per bus",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "Mix to WAV",
				note: "16 or 24-bit",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "MP3 export",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "yes" },
			},
			{
				name: "FLAC export",
				support: { dawn: "partial", dawproject: "no", reaper: "yes", sandyne: "yes" },
				cellNotes: { dawn: "Inside a DAWproject saved to a song; mixes are WAV or MP3" },
			},
			{
				name: "Loudness normalization on export",
				note: "−14 LUFS, peaks under −1 dBTP",
				support: { dawn: "yes", dawproject: "no", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Song metadata in the files",
				note: "Artist, album, songwriter, year and the rest",
				support: { dawn: "yes", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Notation PDF",
				note: "Not in Dawn itself",
				support: { dawn: "no", dawproject: "no", reaper: "unknown", sandyne: "unknown" },
			},
			{
				name: "Video track",
				support: { dawn: "no", dawproject: "yes", reaper: "yes", sandyne: "unknown" },
			},
			{
				name: "Clip launcher scenes",
				support: { dawn: "no", dawproject: "yes", reaper: "no", sandyne: "unknown" },
			},
		],
	},
	{
		title: "Collaboration and storage",
		features: [
			{
				name: "Works in the browser",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "no" },
			},
			{
				name: "Works on a phone",
				support: { dawn: "partial", dawproject: "no", reaper: "no", sandyne: "no" },
				cellNotes: { dawn: "Record and play back; fine editing wants a larger screen" },
			},
			{
				name: "Free to use",
				support: { dawn: "yes", dawproject: "yes", reaper: "partial", sandyne: "yes" },
				cellNotes: { reaper: "An inexpensive license after a full evaluation" },
			},
			{
				name: "Cloud saving with autosave",
				note: "Signed out, a song is kept in this browser",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "unknown" },
			},
			{
				name: "Named revisions with Compare",
				support: { dawn: "yes", dawproject: "no", reaper: "partial", sandyne: "unknown" },
				cellNotes: { reaper: "Numbered project versions, saved by hand" },
			},
			{
				name: "Sharing a song with the band",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "yes" },
				cellNotes: { sandyne: "A project opened to collaborate" },
			},
			{
				name: "Real-time co-editing",
				note: "Dawn guards against overwrites; live co-editing is planned",
				support: { dawn: "no", dawproject: "no", reaper: "no", sandyne: "yes" },
			},
			{
				name: "Comments pinned to moments",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "unknown" },
			},
			{
				name: "Chat",
				support: { dawn: "no", dawproject: "no", reaper: "no", sandyne: "unknown" },
			},
			{
				name: "Send a mix or stems to a song",
				note: "As a demo, or stems for the stem player",
				support: { dawn: "yes", dawproject: "no", reaper: "no", sandyne: "no" },
			},
		],
	},
];
