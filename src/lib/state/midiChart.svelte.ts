import { chartFromMidi } from "#lib/remote/files.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import type { ScoreChart } from "#lib/state/songChordDraft.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";

/** Where a MIDI file's chart goes: the song page's draft card (`chordDraft.fromScore`). */
export type OnMidiChart = (draft: ScoreChart) => void;

/** The attachment as the menu item needs it. */
interface MidiTile {
	id: string;
	kind: string;
	title: string;
	filename: string;
	songId?: string | null;
}

/**
 * "Chart from MIDI" on the Attachments panel's ⋯ menu (SongFilesPanel): a
 * MIDI file of the song read into a barmark chart on the server
 * (files.remote.ts `chartFromMidi`) and handed to the draft card, or a
 * notice naming the import's first error when it gives nothing.
 */
export class MidiChart {
	/** The file being charted; the menu item is disabled meanwhile. */
	charting = $state<string | null>(null);

	async chart(f: MidiTile, onchart?: OnMidiChart) {
		if (this.charting) return;
		const name = f.title || f.filename;
		this.charting = f.id;
		try {
			const r = await chartFromMidi({ id: f.id });
			if (!r.chart.trim()) {
				const why = r.diagnostics.find((d) => d.level === "error")?.message;
				notify(`Nothing to chart in ${name}${why ? `: ${why}` : ""}`, { kind: "error" });
				return;
			}
			onchart?.({ ...r, source: name, notationId: f.id, parts: [] });
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			this.charting = null;
		}
	}

	/** The ⋯ menu's item: an editor's, on a MIDI file of the song (the song view, never the project's). */
	itemOf(f: MidiTile, at: { canEdit: boolean; projectView: boolean; onchart?: OnMidiChart }) {
		return {
			id: "chart",
			label: "Chart from MIDI",
			iconClass: "i-ph-text-columns",
			title:
				"Read this MIDI file's harmony into a chart you can save as the song's: the chords as block chords read by bar, its markers as sections",
			condition: at.canEdit && f.kind === "midi" && !at.projectView && !!f.songId,
			disabled: this.charting !== null,
			action: () => void this.chart(f, at.onchart),
		};
	}
}
