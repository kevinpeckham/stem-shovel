import type { StudioArrangement } from "#lib/val/StudioSchema.js";

/**
 * Dawn's autosave (docs/dawn-daw-plan.md, D8: persistence out of the
 * page): a burst of edits saves once, a moment after the last; saves run
 * one after another; each sends the newest revision this browser knows
 * (`baseNumber`), and a newer one from elsewhere means the page reloads
 * rather than overwrites (D7); a song edited while a save was out saves
 * again. The page hands in the engine's flag and snapshot, the way to
 * make the song, the remote call and what to do on a conflict, so a test
 * drives it with fakes and timers.
 */
export interface PersistenceDeps {
	isDirty(): boolean;
	setDirty(dirty: boolean): void;
	snapshot(): StudioArrangement;
	/** The song's id, making the song when the device holds none yet. */
	ensureSong(): Promise<string>;
	save(
		ideaId: string,
		data: StudioArrangement,
		base: number,
	): Promise<{ number: number; conflict?: boolean }>;
	onConflict(ideaId: string): Promise<void>;
	notify(message: string, opts?: { kind: "error" }): void;
	/** Milliseconds after the last edit before a save (1500 by default). */
	delayMs?: number;
}

export class StudioPersistence {
	saving = $state(false);
	/** The newest revision this browser knows of the open song. */
	baseNumber = $state(0);
	#lastSaved = "";
	#timer: ReturnType<typeof setTimeout> | null = null;
	#chain: Promise<void> = Promise.resolve();
	constructor(private readonly deps: PersistenceDeps) {}

	/** A song opened: its newest revision is the base, nothing is known saved. */
	open(baseNumber: number) {
		this.cancel();
		this.baseNumber = baseNumber;
		this.#lastSaved = "";
	}
	/** The server holds the song as it stands now (a named revision, a restore, a reload). */
	markSaved(baseNumber: number) {
		this.baseNumber = baseNumber;
		this.#lastSaved = JSON.stringify(this.deps.snapshot());
		this.deps.setDirty(false);
	}
	cancel() {
		if (this.#timer) clearTimeout(this.#timer);
		this.#timer = null;
	}
	/** A save a moment from now; another call starts the wait over. */
	schedule() {
		this.cancel();
		this.#timer = setTimeout(() => void this.saveNow(), this.deps.delayMs ?? 1500);
	}
	/** A save now, after any in flight. */
	saveNow(): Promise<void> {
		const once = () => this.#saveOnce();
		this.#chain = this.#chain.then(once, once);
		return this.#chain;
	}
	async #saveOnce() {
		this.cancel();
		if (!this.deps.isDirty()) return;
		const snapshot = this.deps.snapshot();
		const sent = JSON.stringify(snapshot);
		if (sent === this.#lastSaved) {
			this.deps.setDirty(false);
			return;
		}
		this.saving = true;
		try {
			const id = await this.deps.ensureSong();
			const saved = await this.deps.save(id, snapshot, this.baseNumber);
			if (saved.conflict) {
				await this.deps.onConflict(id);
				return;
			}
			this.baseNumber = saved.number;
			this.#lastSaved = sent;
			if (JSON.stringify(this.deps.snapshot()) === sent) this.deps.setDirty(false);
			// Edited while the save was out: the flag never flipped, so no effect fires; another save follows.
			else this.schedule();
		} catch (e) {
			this.deps.notify(`Not saved: ${e instanceof Error ? e.message : String(e)}`, {
				kind: "error",
			});
		} finally {
			this.saving = false;
		}
	}
}
