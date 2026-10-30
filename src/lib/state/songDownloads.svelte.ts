import type { StemEngine } from "#lib/audio/engine.svelte.js";
import { type MixMode, mixQuery, saveMix, saveStemsZip } from "#lib/audio/downloads.js";
import { saveDefaultMix } from "#lib/remote/songs.remote.js";
import { importSongStems } from "#lib/remote/studio.remote.js";
import { notify } from "#lib/state/notifications.svelte.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import { goto } from "$app/navigation";

/** What the downloads read of the song (the page's data). */
interface DownloadsSong {
	id: string;
	slug: string;
	version: string;
	project: { slug: string };
}

/** A ready stem, as the zip reads it. */
type ZipStem = Parameters<typeof saveStemsZip>[0][number];

/** What the page supplies, as functions: SvelteKit reuses the page between songs. */
interface SongDownloadsOptions {
	/** The song as saved. */
	song: () => DownloadsSong;
	/** The song's ready stems (uploaded and decoded, with a file to fetch). */
	ready: () => ZipStem[];
	/** The Stem Player's engine, for the custom mix and the default mix to save. */
	engine: () => StemEngine | null;
	/** After the default mix is saved: the player forgets this browser's levels, then the page's data again. */
	onmixsaved: () => Promise<void>;
}

/**
 * The song page's Downloads menu and the mix actions beside it: the stems as
 * one zip (built in the browser from the Blob files, which allow cross-origin
 * reads; stored, not compressed, since audio does not shrink), an MP3
 * mixdown ("original" is every stem at the default mix, cached on the
 * server; "custom" is what the player has audible now: mute, solo and
 * faders), the stems into a new Dawn song, and the faders saved as the
 * song's default mix.
 */
export class SongDownloads {
	/** The zip's progress while it is built ("Preparing… 2 of 5"), else null. */
	zipping = $state<string | null>(null);
	/** The mix being rendered, else null. */
	mixing = $state<MixMode | null>(null);
	/** Why the last mix failed (or that nothing is audible), shown under the menu. */
	mixError = $state<string | null>(null);
	/** The default mix is being saved. */
	savingMix = $state(false);
	/** The stems are going into a new Dawn song. */
	openingInDawn = $state(false);
	#opts: SongDownloadsOptions;

	constructor(opts: SongDownloadsOptions) {
		this.#opts = opts;
	}

	/** `project-song-v1.2.3`: every download names the song version it was made from. */
	get name() {
		const song = this.#opts.song();
		return `${song.project.slug}-${song.slug}-v${song.version}`;
	}

	/** An MP3 of the default mix or of what is audible now; refused when nothing is. */
	async downloadMix(mixMode: MixMode) {
		if (this.mixing) return;
		this.mixError = null;
		const query = mixQuery(mixMode, this.#opts.engine());
		if (query === null) {
			this.mixError = "Nothing is audible — unmute a stem first.";
			return;
		}
		this.mixing = mixMode;
		try {
			await saveMix(this.#opts.song().id, this.name, mixMode, query);
		} catch (e) {
			this.mixError = errorMessage(e);
		} finally {
			this.mixing = null;
		}
	}

	/**
	 * Every ready stem as one zip. It takes a while on a big song and the menu
	 * closes on the click (Kevin), so a notice follows the work: which stem is
	 * going in, then the hand-off to the browser's download.
	 */
	async downloadAll() {
		const ready = this.#opts.ready();
		if (ready.length === 0 || this.zipping) return;
		this.zipping = "Preparing…";
		const id = "stems-zip";
		const count = `${ready.length} ${ready.length === 1 ? "stem" : "stems"}`;
		notify(`Preparing the stems zip (${count})…`, {
			id,
			kind: "info",
			timeout: null,
			dismissable: false,
		});
		try {
			await saveStemsZip(ready, this.name, (done, total) => {
				this.zipping = `Preparing… ${done} of ${total}`;
				if (done < total)
					notify(
						`Preparing the stems zip: ${ready[done]?.label ?? ""} (${done + 1} of ${total})…`,
						{
							id,
							kind: "info",
							timeout: null,
							dismissable: false,
						},
					);
			});
			notify(`Stems zip ready (${count}): your browser is saving it`, { id, kind: "success" });
		} catch (e) {
			notify(`Could not prepare the stems zip: ${errorMessage(e)}`, { id, kind: "error" });
		} finally {
			this.zipping = null;
		}
	}

	/** The song's ready stems into a new Dawn song (docs/multitrack-recorder.md, "A song's stems in"), then Dawn opens on it. */
	async openInDawn() {
		this.openingInDawn = true;
		try {
			const made = await importSongStems({ songId: this.#opts.song().id });
			notify(`${made.tracks} ${made.tracks === 1 ? "stem" : "stems"} loaded into Dawn`);
			if (made.left)
				notify(
					`${made.left} ${made.left === 1 ? "stem" : "stems"} left behind: a Dawn song holds at most ${made.tracks} tracks`,
					{ kind: "error" },
				);
			await goto(`/multitrack-recorder?song=${made.ideaId}`);
		} catch (e) {
			notify(`Could not load the stems into Dawn: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			this.openingInDawn = false;
		}
	}

	/** The player's fader levels and pans as the song's default mix, for everyone, after a confirmation. */
	async saveMixAsDefault() {
		const engine = this.#opts.engine();
		if (!engine || this.savingMix) return;
		if (
			!confirm(
				"Save these fader levels and pans as the default mix for everyone who opens this song?",
			)
		)
			return;
		this.savingMix = true;
		try {
			await saveDefaultMix({
				id: this.#opts.song().id,
				gains: engine.stems.map((s) => ({
					id: s.id,
					gain: Math.round(s.gain * 1000) / 1000,
					pan: Math.round(s.pan * 100) / 100,
				})),
			});
			await this.#opts.onmixsaved();
			notify("Saved as the default mix; the original mixdown is re-rendering");
		} catch (e) {
			notify(`Could not save the mix: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			this.savingMix = false;
		}
	}
}
