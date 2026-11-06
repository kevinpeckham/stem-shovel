import { type MidiSummary, parseMidi } from "#lib/audio/midi.js";
import { errorMessage } from "#lib/utils/errorMessage.js";

interface MidiViewsOptions {
	/** The fetch that reads a MIDI file (a stand-in in a test). */
	fetch?: typeof fetch;
}

/**
 * The song page's MIDI views: a stem with a MIDI file shows its notes under
 * its row when the badge is toggled on. Each file is fetched and parsed once
 * per page (a failed read is forgotten, so the next toggle tries again).
 */
export class MidiViews {
	/** The parsed MIDI of each stem whose view is on, by stem id. */
	views = $state<Record<string, MidiSummary>>({});
	#cache = new Map<string, Promise<MidiSummary>>();
	#fetch: typeof fetch;

	constructor(opts: MidiViewsOptions = {}) {
		this.#fetch = opts.fetch ?? ((input, init) => fetch(input, init));
	}

	/** Turn a stem's MIDI view off, or on from its file at `url` (nothing without one). */
	async toggle(stemId: string, url: string | undefined) {
		if (this.views[stemId]) {
			this.views = Object.fromEntries(Object.entries(this.views).filter(([id]) => id !== stemId));
			return;
		}
		if (!url) return;
		let parsed = this.#cache.get(url);
		if (!parsed) {
			parsed = this.#fetch(url).then(async (res) => {
				if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
				return parseMidi(await res.arrayBuffer());
			});
			this.#cache.set(url, parsed);
		}
		try {
			this.views = { ...this.views, [stemId]: await parsed };
		} catch (e) {
			this.#cache.delete(url);
			alert(`Could not read the MIDI file: ${errorMessage(e)}`);
		}
	}
}
