/**
 * The README inside a session bundle (docs/daw-interop-plan.md): what the
 * folders hold and how each DAW opens them, in plain text, for the person
 * who unzips it with no Stem Shovel page open.
 */
export function sessionReadme(o: {
	title: string;
	application: { name: string; version: string };
	date: Date;
	clips: number;
	stems: number;
	midiTracks: number;
	markers: number;
	sampleRates: number[];
}): string {
	const rates = [...new Set(o.sampleRates)].sort((a, b) => a - b);
	const rate = rates.length ? rates.map((r) => `${r / 1000} kHz`).join(" and ") : "the song's rate";
	return `${o.title}
Exported from ${o.application.name} ${o.application.version} on ${o.date.toISOString().slice(0, 10)}.

What is here
  clips/    ${o.clips} audio clip${s(o.clips)}, each a 24-bit Broadcast WAV (${rate}) stamped with
            its position in the song (the BWF time reference), with its gain and fades applied.
  stems/    ${o.stems} stem${s(o.stems)}, one per track from the start of the song, through the
            track's fader, pan and effects. Any DAW opens these: import them all at zero.
  ${o.title}.mid
            The tempo map, meters, key and ${o.markers} marker${s(o.markers)} on the first track,
            then ${o.midiTracks} MIDI track${s(o.midiTracks)} as notes.
  labels.txt
            The markers and the tempo, meter and key changes as an Audacity label track.

Logic Pro
  Start an empty project. File > Import > MIDI File on the .mid first: Logic takes the
  tempo map, time signatures, key and markers when the project is empty. Then drag the
  clips/ folder in and choose Region > Move > To Original Record Position (or import
  stems/ at bar 1 instead).

Pro Tools (Studio and Ultimate)
  File > Import > MIDI (tick Import Tempo Map and Key Signature), then File > Import >
  Audio for clips/, and Clip > Spot each to its Original Time Stamp; or import stems/ to
  the session start.

Cubase and Nuendo
  Dawn also exports a DAWproject, which Cubase 14 and later open directly. From this
  bundle: File > Import > MIDI File (tempo, signatures, markers), then Pool > Import
  Audio for clips/ and "Insert into Project > At Origin".

Ableton Live
  Drag stems/ into the Arrangement at bar 1, and the .mid for the MIDI parts (Live reads
  its notes; set the tempo by hand). Live does not read BWF time stamps.

Audacity
  File > Import > Audio on stems/ (every file starts at zero), then File > Import > Labels
  on labels.txt for the markers and changes.

Reaper
  Insert > Media File on clips/ with "Insert at original time stamp" (BWF), or stems/ at
  zero; Insert > Media File on the .mid with the tempo map option on.

GarageBand and others
  stems/ at the start of the song is the safe route anywhere.
`;
}

const s = (n: number) => (n === 1 ? "" : "s");
