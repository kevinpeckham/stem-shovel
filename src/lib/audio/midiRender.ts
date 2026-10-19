import { DRUM_MIDI_IN_NOTES } from "#lib/constants/drumMachine.js";
import { clipNoteEvents } from "#lib/utils/clipNoteEvents.js";
import { swingNotes } from "#lib/utils/swingNotes.js";
import type { BarGrid } from "./measures";
import type { StudioClip, StudioInputSource } from "#lib/val/StudioSchema.js";
import { createDrumBus } from "./drumBus";
import { playDrumHit, type DrumPlayState } from "./drumRender";
import { drumMachine } from "./drumMachine.svelte";
import { drumKit } from "./kits";
import { chordPiano, piano, type PianoEngine } from "./piano.svelte";
import { createPianoFx } from "./pianoFx";
import { startSampledVoice } from "./pianoSamples";
import { isSampledInstrument, startSampledInstrumentVoice } from "./sampledInstruments";
import { startVoice } from "./synthVoice";

/**
 * A MIDI track's clips played offline (docs/dawn-daw-plan.md, D3): the
 * instrument's own voices on an OfflineAudioContext, so a bounce needs no
 * real-time pass through the speakers. The piano and the chord player
 * play their current sound through a copy of their effects chain
 * (pianoFx.ts) built on the offline context, from the Grand's samples or
 * the small sampled instruments' once decoded (an AudioBuffer plays on
 * any context), the synth standing in where a sample is not in yet, as
 * the live instrument does. The drums play the kit through a drum bus
 * with the machine's effects, each hit through the open pattern's row.
 * Everything lands in `into`, the track's strip.
 */
export async function renderMidiClipsOffline(
	off: OfflineAudioContext,
	into: AudioNode,
	source: StudioInputSource,
	clips: StudioClip[],
	bpm: number,
	feel?: { grid: BarGrid; swing?: number; humanize?: number },
): Promise<void> {
	const flat = clips.flatMap((c) => clipNoteEvents(c));
	const events = feel ? swingNotes(flat, feel) : flat;
	if (events.length === 0) return;
	if (source === "drums") {
		const kit = drumKit(drumMachine.project.kit);
		await kit.load(off);
		const fx = structuredClone(drumMachine.project.fx);
		const bus = createDrumBus(off, fx, bpm);
		bus.master.disconnect();
		bus.master.connect(into);
		const state: DrumPlayState = { openHat: null };
		for (const e of events) {
			const voice = DRUM_MIDI_IN_NOTES[e.pitch];
			if (!voice) continue;
			playDrumHit(off, kit, bus, drumMachine.rowFor(voice), e.velocity, e.at, state);
		}
		return;
	}
	const engine: PianoEngine = source === "piano" ? piano : chordPiano;
	const fx = createPianoFx(off, engine.fxSettings());
	fx.master.disconnect();
	fx.master.connect(into);
	const instrument = engine.instrument;
	for (const e of events) {
		const voice =
			instrument === "grand"
				? startSampledVoice(off, fx.input, e.pitch, e.velocity, e.at)
				: isSampledInstrument(instrument)
					? startSampledInstrumentVoice(off, fx.input, instrument, e.pitch, e.velocity, e.at)
					: startVoice(off, fx.input, instrument, e.pitch, e.velocity, e.at);
		const played =
			voice ??
			startVoice(
				off,
				fx.input,
				isSampledInstrument(instrument) ? instrument : "epiano",
				e.pitch,
				e.velocity,
				e.at,
			);
		played.release(e.at + e.duration);
	}
	fx.dispose();
}
