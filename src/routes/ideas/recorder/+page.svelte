<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder, { type Take } from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import IdeaNotesPanel from "$lib/components/IdeaNotesPanel.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
	import Tuner from "$lib/components/Tuner.svelte";
	import Metronome from "$lib/components/Metronome.svelte";
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import FloatingPanel from "$lib/components/FloatingPanel.svelte";
	import { RECORDER_SOURCES, type RecorderSource } from "$lib/components/DemoRecorder.svelte";
	import { inputSources } from "$lib/audio/inputs.svelte";
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import { loopSources } from "$lib/remote/looper.remote";
	import type { IdeaInstruments } from "$lib/val/IdeaSchema";
	import Piano from "$lib/components/Piano.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import IconDrumKit from "$lib/components/IconDrumKit.svelte";
	import ChordPlayer from "$lib/components/ChordPlayer.svelte";
	import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import TuningForkIcon from "$lib/components/TuningForkIcon.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import {
		createIdea,
		deleteIdeaNow,
		dropIdeaIfEmpty,
		renameIdea,
		saveIdeaInstruments,
		saveIdeaNotes,
	} from "$lib/remote/ideas.remote";
	import { deleteTake, setTakeName } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";
	import { invalidateAll } from "$app/navigation";
	import { onMount, tick, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { TakeQueue } from "$lib/audio/takeQueue.svelte";
	import {
		loadDiscardShortTakes,
		saveDiscardShortTakes,
		SHORT_TAKE_SECONDS,
	} from "$lib/utils/discardShortTakes";
	import {
		DEFAULT_RECORDER_PREFERENCES,
		loadRecorderPreferences,
		saveRecorderPreferences,
		type RecorderPreferences,
	} from "$lib/utils/recorderPreferences";

	let { data } = $props();
	type Idea = (typeof data.ideas)[number];
	type TakeRow = Idea["takes"][number];

	/**
	 * On a phone the recorder fills the viewport and the page must not scroll
	 * behind it: the document is locked while the phone layout applies and
	 * unlocked when it stops applying or the page is left (nothing leaks to
	 * other pages). A media query, not a width binding, so it runs only when
	 * the answer changes.
	 */
	onMount(() => {
		const phone = window.matchMedia("(max-width: 639.98px)");
		const root = document.documentElement;
		const before = { maxHeight: root.style.maxHeight, overflowY: root.style.overflowY };
		const apply = () => {
			root.style.maxHeight = phone.matches ? "100svh" : before.maxHeight;
			root.style.overflowY = phone.matches ? "hidden" : before.overflowY;
		};
		apply();
		phone.addEventListener("change", apply);
		return () => {
			phone.removeEventListener("change", apply);
			root.style.maxHeight = before.maxHeight;
			root.style.overflowY = before.overflowY;
		};
	});

	let recorder = $state<DemoRecorder | null>(null);
	// Dev only: the engines on window for the browser scripts in .screenshots/ (docs/agent-screenshots.md).
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, { __inputs: inputSources, __piano: piano, __drums: drumMachine });
	/** The idea in the recorder and the notes panel; null = a new idea not yet saved. */
	let ideaId = $state<string | null>(null);
	let idea = $derived(data.ideas.find((i) => i.id === ideaId) ?? null);
	/** The take in the player, when one is. */
	let takeId = $state<string | null>(null);
	let loadedTake = $derived(idea?.takes.find((t) => t.id === takeId) ?? null);
	/** The title in the recorder's field; for an unsaved idea, what it will be created with. */
	let ideaTitle = $state(untrack(() => `Untitled Idea ${data.ideas.length + 1}`));
	/** The notes as the page knows them (the panel autosaves to the idea). */
	let notes = $state("");
	/** Bumped to re-seed the notes panel (another idea, a clear). */
	let notesKey = $state(0);
	let phase = $state("idle");
	/** Drop takes under SHORT_TAKE_SECONDS (a mis-tap); a per-browser setting, read on mount. */
	let discardShort = $state(false);
	/** The tuner in its panel (floating from lg, docked under the recorder below); a take starting closes it, which frees the microphone. */
	let tuner = $state<Tuner | null>(null);
	let tunerOpen = $state(false);
	async function toggleTuner(e?: Event) {
		(e?.currentTarget as HTMLElement | null)?.blur();
		tunerOpen = !tunerOpen;
		if (tunerOpen) {
			await tick(); // the panel mounts the tuner
			void tuner?.start();
		} else tuner?.stop();
	}
	/** The recorder device itself popped out into a panel (from lg), or docked back in its column; remembered per browser. */
	let recorderFloating = $state(false);
	const RECORDER_FLOATING_KEY = "stemshovel.recorder.recorder-floating";
	function setRecorderFloating(on: boolean) {
		recorderFloating = on;
		try {
			localStorage.setItem(RECORDER_FLOATING_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	/** Loops saved from the looper are kind "loop" and hidden from the list unless asked for (docs/looper.md, "Save and Export"); remembered per browser. */
	let showLoops = $state(false);
	const SHOW_LOOPS_KEY = "stemshovel.recorder.show-loops";
	function setShowLoops(on: boolean) {
		showLoops = on;
		try {
			localStorage.setItem(SHOW_LOOPS_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	/** The ideas the list and the search show: ideas, and loops when asked for. */
	let listedIdeas = $derived(data.ideas.filter((i) => i.kind !== "loop" || showLoops));
	/** The recordings list popped out into a panel (from lg), or docked back; remembered per browser. */
	/**
	 * The Recordings panel (the ideas and takes, with the search field at its
	 * top): docked in its column, popped out into a floating panel, or
	 * minimised to the toolbar's Ideas button, which brings it back the way it
	 * was (Kevin: one panel with search, expandable to a popover or minimised
	 * to an icon; docked by default). Remembered per browser. On a phone the
	 * same list opens as a full-screen sheet from that button instead.
	 */
	type RecordingsMode = "docked" | "floating" | "minimised";
	let recordingsMode = $state<RecordingsMode>("docked");
	let recordingsRestore: Exclude<RecordingsMode, "minimised"> = "docked";
	const RECORDINGS_MODE_KEY = "stemshovel.recorder.recordings-mode";
	function setRecordingsMode(mode: RecordingsMode) {
		if (mode === "minimised" && recordingsMode !== "minimised") recordingsRestore = recordingsMode;
		recordingsMode = mode;
		try {
			localStorage.setItem(RECORDINGS_MODE_KEY, mode);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	function toggleRecordings() {
		setRecordingsMode(recordingsMode === "minimised" ? recordingsRestore : "minimised");
	}
	/** The notes popped out of their column into a panel (from lg), or docked back; remembered per browser. */
	let notesFloating = $state(false);
	const NOTES_FLOATING_KEY = "stemshovel.recorder.notes-floating";
	/** The Tracks panel (a multitrack take's stems) pops out like the notes; remembered per browser. */
	let tracksFloating = $state(false);
	const TRACKS_FLOATING_KEY = "stemshovel.recorder.tracks-floating";
	function setTracksFloating(on: boolean) {
		tracksFloating = on;
		try {
			localStorage.setItem(TRACKS_FLOATING_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	function setNotesFloating(on: boolean) {
		notesFloating = on;
		try {
			localStorage.setItem(NOTES_FLOATING_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	// The piano: a keyboard under the recorder whose sound goes into the take with the microphone (or without it).
	let pianoOpen = $state(false);
	/** The piano's sound and effects are saved with the idea when a take is recorded, unless switched off (its panel's header); remembered per browser. */
	let pianoSettings = $state(true);
	const PIANO_SETTINGS_KEY = "stemshovel.recorder.piano-settings";
	function setPianoSettings(on: boolean) {
		pianoSettings = on;
		try {
			localStorage.setItem(PIANO_SETTINGS_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	/** Multitrack takes (docs/demo-recording.md, "Multitrack takes"): the mix plus a file per source; offered, and on by default, with two or more sources in the take (syncMultitrack). */
	let multitrack = $state(false);
	/**
	 * Which sources go into the take (docs/demo-recording.md, "Input sources"):
	 * the recorder's source buttons switch them, as do the instrument panels'
	 * "In the take" switches; remembered per browser, the microphone on by
	 * default. Switching an instrument in opens its panel; closing the panel
	 * switches it out.
	 */
	let sourcesOn = $state<Record<RecorderSource, boolean>>({
		mic: true,
		line: false,
		computer: false,
		piano: false,
		chords: false,
		drums: false,
	});
	const SOURCES_KEY = "stemshovel.recorder.sources";
	function setSource(source: RecorderSource, on: boolean) {
		const before = sourcesInTake;
		sourcesOn[source] = on;
		// The chord player and the piano are one engine, one sound: only one of them is in the take.
		if (on && source === "chords" && sourcesOn.piano) sourcesOn.piano = false;
		if (on && source === "piano" && sourcesOn.chords) sourcesOn.chords = false;
		syncMultitrack(before);
		try {
			localStorage.setItem(SOURCES_KEY, JSON.stringify($state.snapshot(sourcesOn)));
		} catch {
			// Private mode: the choice lasts for this page only.
		}
		if (source === "piano" && on && !pianoOpen) togglePiano();
		if (source === "chords" && on && !chordsOpen) toggleChords();
		if (source === "drums" && on && !drumsOpen) toggleDrums();
	}
	const pianoInTake = $derived(sourcesOn.piano);
	const chordsInTake = $derived(sourcesOn.chords);
	const setChordsInTake = (on: boolean) => setSource("chords", on);
	const drumsInTake = $derived(sourcesOn.drums);
	const setPianoInTake = (on: boolean) => setSource("piano", on);
	const setDrumsInTake = (on: boolean) => setSource("drums", on);
	/** How many sources are in the take: two or more and the take can be multitrack. */
	const sourcesInTake = $derived(RECORDER_SOURCES.filter((s) => sourcesOn[s]).length);
	/**
	 * Multitrack is the default with two or more sources in (Kevin): crossing
	 * that line switches it on, dropping below switches it off; between, a
	 * Stereo choice stands. The page's load does the same after restoring the sources.
	 */
	function syncMultitrack(before: number) {
		const now = sourcesInTake;
		if (before < 2 && now >= 2) multitrack = true;
		else if (now < 2) multitrack = false;
	}
	function togglePiano(e?: Event) {
		pianoOpen = !pianoOpen;
		if (pianoOpen) {
			piano.warm();
			spaceOwner = "piano";
		} else {
			piano.allOff();
			if (spaceOwner === "piano") spaceOwner = chordsOpen ? "chords" : drumsOpen ? "drums" : null;
			if (sourcesOn.piano) setSource("piano", false);
		}
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	/** The chord player (docs/chord-player.md, phase 3): the piano engine on the circle, its own panel and source. */
	let chordsOpen = $state(false);
	function toggleChords(e?: Event) {
		chordsOpen = !chordsOpen;
		if (chordsOpen) {
			piano.warm();
			spaceOwner = "chords";
		} else {
			chordPlayer.allOff();
			if (spaceOwner === "chords") spaceOwner = pianoOpen ? "piano" : drumsOpen ? "drums" : null;
			if (sourcesOn.chords) setSource("chords", false);
		}
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	// The drum machine: the compact control in the toolbar always; on a desktop, the full machine in a floating
	// panel too (docs/demo-recording.md, "The drum machine panel"). Its beat goes into the take unless switched off.
	let drumsOpen = $state(false);
	/** The drum machine's project is saved with the idea when a take is recorded, unless switched off; remembered per browser. */
	let drumsSettings = $state(true);
	const DRUMS_SETTINGS_KEY = "stemshovel.recorder.drums-settings";
	function setDrumsSettings(on: boolean) {
		drumsSettings = on;
		try {
			localStorage.setItem(DRUMS_SETTINGS_KEY, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	/** The full metronome in a panel from lg (the compact control below), as the drums. */
	let metroOpen = $state(false);
	function toggleMetronome(e?: Event) {
		metroOpen = !metroOpen;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	/**
	 * Who owns the space bar: the instrument touched last. The drum machine's panel takes it as it opens
	 * (space plays and stops the beat), the piano as it opens (space is its sustain pedal), and a click
	 * in either hands it over; buttons blur after a click so a focused one never swallows the key.
	 */
	let spaceOwner = $state<"drums" | "piano" | "chords" | null>(null);
	function toggleDrums(e?: Event) {
		drumsOpen = !drumsOpen;
		if (drumsOpen) spaceOwner = "drums";
		else {
			if (spaceOwner === "drums") spaceOwner = pianoOpen ? "piano" : chordsOpen ? "chords" : null;
			if (sourcesOn.drums) setSource("drums", false);
		}
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	/**
	 * The instruments' capture streams for the recorder, asked as a take starts
	 * (a gesture) and as an instrument's meter is tapped: the piano's and the
	 * drum machine's whenever they are in the take, their panels open or not,
	 * so a beat started after Record still lands. An instrument that is not
	 * playing contributes silence: no cost to the recording, only its idle graph.
	 */
	function instrumentStreams(): Partial<Record<"piano" | "drums" | "chords", MediaStream>> {
		return {
			...(sourcesOn.piano ? { piano: piano.captureStream() } : {}),
			// The chord player is the piano engine: the same capture under its own name.
			...(sourcesOn.chords ? { chords: piano.captureStream() } : {}),
			...(sourcesOn.drums ? { drums: drumMachine.captureStream() } : {}),
		};
	}

	/**
	 * The instruments' settings travel with the idea through its takes
	 * (Kevin): when a take is recorded, the drum machine's project and the
	 * piano's sound and effects as they stand go with it, each unless its
	 * "settings with the idea" switch is off, and are saved on the idea once
	 * the take lands (so the idea is the one the take went to, even after a
	 * switch during the upload); showing an idea puts them back into the
	 * instruments, an idea without any (older than the feature, or recorded
	 * with the switches off) leaving the instruments as they are, so it
	 * inherits the current settings until a take is recorded there. What was
	 * saved this visit is kept here too, so switching back to an idea loads
	 * the latest rather than the page's data from load time.
	 */
	const instrumentsById = new Map<string, IdeaInstruments>();
	/** The settings to go with a take recorded now: each instrument whose switch is on, else null (the idea keeps what it had for that one). */
	function instrumentsForTake(): IdeaInstruments {
		drumMachine.load();
		piano.load();
		return {
			drums: drumsSettings ? $state.snapshot(drumMachine.project) : null,
			piano: pianoSettings ? piano.currentPreset() : null,
			// A loop is saved from the looper page, never from here.
			looper: null,
			// The chord player's settings go with a take it was in (the piano's switch covers the engine they share).
			chords:
				pianoSettings && sourcesOn.chords ? $state.snapshot(chordPlayer.presetSettings) : null,
		};
	}
	/** A take landed: its settings onto its idea (the server keeps the idea's earlier settings for an instrument sent as null). */
	async function saveTakeInstruments(id: string, instruments: IdeaInstruments) {
		if (!instruments.drums && !instruments.piano && !instruments.chords) return;
		try {
			instrumentsById.set(id, await saveIdeaInstruments({ id, ...instruments }));
		} catch (e) {
			notify(`Instrument settings not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** The instruments as the idea had them, into the engines; an idea without any leaves the instruments as they are. */
	function loadInstruments(i: Idea) {
		const saved = instrumentsById.get(i.id) ?? i.instruments ?? null;
		if (!saved) return;
		drumMachine.load();
		piano.load();
		if (saved.drums) drumMachine.loadProject(saved.drums, "replace", i.title);
		if (saved.piano) piano.applyPreset(saved.piano);
		if (saved.chords) chordPlayer.applyPresetSettings(saved.chords);
	}
	/** Quality and silence trimming: per browser too (src/lib/utils/recorderPreferences.ts). */
	let prefs = $state<RecorderPreferences>({ ...DEFAULT_RECORDER_PREFERENCES });
	/** The microphones the browser lists once permission is granted. */
	function savePrefs() {
		saveRecorderPreferences({ ...prefs });
	}
	let recorderBusy = $derived(
		phase === "recording" || phase === "requesting" || phase === "saving",
	);
	/** A new idea's placeholder: "Untitled Idea N", N counting the user's ideas. */
	const placeholder = () => `Untitled Idea ${data.ideas.length + 1}`;

	/**
	 * Uploads run in the background so Record is available the moment Stop is
	 * pressed; a take waits on disk (IndexedDB) until its upload lands.
	 */
	const queue = new TakeQueue({
		// The idea the take was recorded for, created now if it never was; a
		// take restored from an earlier visit whose idea was never created gets
		// one with the title it had then.
		ideaFor: async (item) => {
			const id = await (async () => {
				if (item.ideaId) return item.ideaId;
				if (item.ideaTitle !== ideaTitle || ideaId) {
					const created = await createIdea({ accountId: data.account.id, title: item.ideaTitle });
					await invalidateAll();
					return created.id;
				}
				return ensureIdea();
			})();
			openIdeas.add(id); // the take now lists under this idea: keep it unfolded
			return id;
		},
		onsaved: async (saved) => {
			recorder?.resolve(saved.localId, saved);
			if (takeId === saved.localId) {
				takeId = saved.id;
				if (ideaId) openIdeas.add(ideaId); // the new take shows in the list
			}
			notify(`Take ${saved.takeNumber} saved`);
			if (saved.instruments) await saveTakeInstruments(saved.ideaId, saved.instruments);
			await invalidateAll();
			void followRendition(saved.id);
		},
	});
	/**
	 * The jobs function makes the take's MP3 within a minute or so; when it
	 * lands, the player switches to it (a browser cannot always play its own
	 * lossless recording, and another device never can). Polls the page data
	 * a few times, then gives up quietly: the next visit has it anyway.
	 */
	async function followRendition(takeId: string) {
		for (let i = 0; i < 12; i++) {
			await new Promise((r) => setTimeout(r, 5000));
			await invalidateAll();
			const take = data.ideas.flatMap((i) => i.takes).find((t) => t.id === takeId);
			if (!take) return;
			if (take.playbackUrl) {
				recorder?.refreshUrl(take);
				return;
			}
		}
	}
	onMount(() => {
		discardShort = loadDiscardShortTakes();
		prefs = loadRecorderPreferences();
		try {
			const saved = JSON.parse(localStorage.getItem(SOURCES_KEY) ?? "null") as unknown;
			if (saved && typeof saved === "object") {
				for (const src of RECORDER_SOURCES) {
					const v = (saved as Record<string, unknown>)[src];
					if (typeof v === "boolean") sourcesOn[src] = v;
				}
			}
			// An instrument comes back into the take only with its panel: the panels start closed.
			sourcesOn.piano = false;
			sourcesOn.chords = false;
			sourcesOn.drums = false;
			syncMultitrack(0);
			drumsSettings = localStorage.getItem(DRUMS_SETTINGS_KEY) !== "0";
			pianoSettings = localStorage.getItem(PIANO_SETTINGS_KEY) !== "0";
			notesFloating = localStorage.getItem(NOTES_FLOATING_KEY) === "1";
			tracksFloating = localStorage.getItem(TRACKS_FLOATING_KEY) === "1";
			recorderFloating = localStorage.getItem(RECORDER_FLOATING_KEY) === "1";
			const mode = localStorage.getItem(RECORDINGS_MODE_KEY);
			if (mode === "docked" || mode === "floating" || mode === "minimised") recordingsMode = mode;
			showLoops = localStorage.getItem(SHOW_LOOPS_KEY) === "1";
		} catch {
			// As above.
		}
		void queue.restore();
	});

	/** The current idea's id, creating the idea on first use (a take, notes, a title). */
	async function ensureIdea(): Promise<string> {
		if (ideaId) return ideaId;
		const created = await createIdea({
			accountId: data.account.id,
			title: ideaTitle.trim() || placeholder(),
		});
		ideaId = created.id;
		ideaTitle = created.title;
		await invalidateAll();
		return created.id;
	}

	/** New idea: an empty player, a fresh title, an empty note board; saved on first use. */
	function newIdea() {
		if (recorderBusy || !recorder) return;
		ideaId = null;
		takeId = null;
		notes = "";
		ideaTitle = placeholder();
		notesKey++;
		recorder.reset();
	}

	/** Which ideas are unfolded in the list: a plain accordion, the loaded idea opened when it is shown. */
	const openIdeas = new SvelteSet<string>();

	/**
	 * The list as shown: the ideas from the server plus every take still
	 * uploading (the queue) under its idea, so a take is listed the moment
	 * Stop is pressed rather than once its upload lands. A take whose idea
	 * the server does not have yet sits under a pending group with that
	 * title until the refresh after the idea is created. Failed uploads stay
	 * in the Uploads box, which offers Retry and Discard.
	 */
	type ShownTake = TakeRow & { pending?: { status: "waiting" | "uploading"; progress: number } };
	type ShownIdea = Omit<Idea, "takes"> & { takes: ShownTake[]; pending?: boolean };
	let ideasShown = $derived.by((): ShownIdea[] => {
		const pending = queue.items.filter((u) => u.status !== "failed");
		const row = (u: (typeof pending)[number], takeNumber: number): ShownTake => ({
			id: u.localId,
			takeNumber,
			title: u.name,
			url: "",
			playbackUrl: null,
			codec: null,
			durationSeconds: u.durationSeconds,
			createdAt: new Date(u.createdAt),
			stems: [],
			pending: { status: u.status === "uploading" ? "uploading" : "waiting", progress: u.progress },
		});
		const known = new Set(data.ideas.map((i) => i.id));
		const ideas: ShownIdea[] = listedIdeas.map((i) => {
			const mine = pending.filter((u) => u.ideaId === i.id);
			return { ...i, takes: [...i.takes, ...mine.map((u, k) => row(u, i.takes.length + k + 1))] };
		});
		const orphans = pending.filter((u) => !u.ideaId || !known.has(u.ideaId));
		const groups = new Map<string, typeof orphans>();
		for (const u of orphans) groups.set(u.ideaTitle, [...(groups.get(u.ideaTitle) ?? []), u]);
		const made: ShownIdea[] = [...groups].map(([title, us]) => ({
			id: `pending:${us[0].localId}`,
			title,
			notes: "",
			kind: "idea" as const,
			instruments: null,
			createdAt: new Date(us[0].createdAt),
			pending: true,
			takes: us.map((u, k) => row(u, k + 1)),
		}));
		return [...made, ...ideas];
	});
	function show(i: Idea, t: TakeRow | null) {
		if (recorderBusy || !recorder) return;
		const switching = ideaId !== i.id;
		ideaId = i.id;
		ideaTitle = i.title;
		openIdeas.add(i.id);
		if (switching) {
			notes = i.notes;
			notesKey++;
			loadInstruments(i);
		}
		if (t) {
			takeId = t.id;
			recorder.load(t);
		} else {
			takeId = null;
			recorder.reset();
		}
		searchOpen = false;
		// On a phone the list is a sheet: a choice closes it.
		try {
			document.getElementById("idea-search")?.hidePopover();
		} catch {
			// Not open.
		}
	}

	async function titleChanged(title: string) {
		if (!title) {
			ideaTitle = idea?.title ?? placeholder();
			return;
		}
		if (!ideaId) return; // used when the idea is created
		try {
			await renameIdea({ id: ideaId, title });
			await invalidateAll();
		} catch (e) {
			notify(`Title not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function takeNamed(t: { id: string; title: string }) {
		try {
			await setTakeName(t);
			await invalidateAll();
		} catch (e) {
			notify(`Take name not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function clearNotes() {
		notes = "";
		notesKey++;
		if (ideaId) {
			try {
				const r = await saveIdeaNotes({ id: ideaId, markdown: "" });
				if (r.ideaDeleted) ideaId = null; // nothing left in it; the title stays for the next take
				await invalidateAll();
			} catch (e) {
				notify(errorMessage(e), { kind: "error" });
			}
		}
	}
	/** A failed upload discarded: the idea goes too when it was created for that take and holds nothing else. */
	async function discardUpload(u: { localId: string; ideaId: string | null }) {
		queue.discard(u.localId);
		const id = u.ideaId ?? ideaId;
		if (!id) return;
		try {
			const r = await dropIdeaIfEmpty({ id });
			if (r.ideaDeleted && id === ideaId) ideaId = null;
			await invalidateAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function removeTake(t: Take) {
		if (
			!confirm(
				`Delete take ${t.takeNumber}${t.title ? ` “${t.title}”` : ""}? Demos made from it stay on their songs.`,
			)
		)
			return;
		try {
			const r = await deleteTake({ id: t.id });
			notify(`Take ${t.takeNumber} deleted`);
			// The take before the deleted one, to show once the list has refreshed.
			const before = idea?.takes.filter((x) => x.takeNumber < t.takeNumber).at(-1) ?? null;
			takeId = null;
			recorder?.reset();
			// The last take of an idea without notes takes the idea with it.
			if (r.ideaDeleted && idea?.takes.some((x) => x.id === t.id)) ideaId = null;
			await invalidateAll();
			const still = before && idea?.takes.find((x) => x.id === before.id);
			if (idea && still) show(idea, still);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ---- a take into a song: one popover, two modes, one target ----
	let songTarget = $state<{ id: string; label: string; ideaTitle: string } | null>(null);
	let songMode = $state<"add" | "new" | "stems">("add");
	let songPanel = $state<HTMLDivElement | null>(null);
	function songDialog(
		i: { title: string },
		t: { id: string; takeNumber: number; title: string },
		mode: "add" | "new" | "stems",
	) {
		songTarget = { id: t.id, label: `${i.title} · ${takeLabel(t)}`, ideaTitle: i.title };
		songMode = mode;
		songPanel?.showPopover();
	}
	async function removeIdea(i: Idea) {
		const n = i.takes.length;
		if (
			!confirm(
				`Delete “${i.title}” and its ${n} ${n === 1 ? "take" : "takes"}? Demos made from them stay on their songs.`,
			)
		)
			return;
		try {
			await deleteIdeaNow({ id: i.id });
			notify("Idea deleted");
			// Deleting the idea in the player empties it; another one leaves it alone.
			const emptied = i.id === ideaId;
			if (emptied) {
				ideaId = null;
				takeId = null;
				notes = "";
				notesKey++;
				recorder?.reset();
			}
			await invalidateAll();
			// After the refresh, so the placeholder counts without the deleted idea.
			if (emptied) ideaTitle = placeholder();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ---- search (a popover over the list: every idea, filtered as you type) ----
	let searchOpen = $state(false);
	let searchText = $state("");
	/**
	 * The rows, narrowed by the search field: an idea stays when its title or
	 * notes match or any take's label or number does; the takes that matched
	 * are noted so their idea opens on them.
	 */
	const query = $derived(searchText.trim().toLowerCase());
	let matchedTakes = $derived.by(() => {
		const out = new Map<string, Set<string>>();
		if (!query) return out;
		for (const i of ideasShown) {
			const hits = i.takes
				.filter(
					(t) => t.title.toLowerCase().includes(query) || `take ${t.takeNumber}`.includes(query),
				)
				.map((t) => t.id);
			if (hits.length) out.set(i.id, new Set(hits));
		}
		return out;
	});
	let shownFiltered = $derived(
		query
			? ideasShown.filter(
					(i) =>
						i.title.toLowerCase().includes(query) ||
						i.notes.toLowerCase().includes(query) ||
						matchedTakes.has(i.id),
				)
			: ideasShown,
	);

	const fmtWhen = (d: Date) =>
		`${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
	const takeLabel = (t: { takeNumber: number; title: string }) =>
		`Take ${t.takeNumber}${t.title ? ` · ${t.title}` : ""}`;
</script>

<svelte:head>
	<title>{pageTitle(data.copy.title || "Idea Recorder")}</title>
</svelte:head>

<main
	class="max-h-[calc(100svh-72px)] h-[calc(100svh-72px)] grid grid-rows-[auto_1fr] sm-block sm-max-h-none sm-h-auto px-3 sm-!page-x-padding pt-3 sm-pt-8 max-w-full overflow-hidden pb-16"
>
	<!-- The page's words from its copy doc (docs/page-copy.md), with the toolbar at the right. -->
	<PageCopyHeader copy={data.copy} class="mb-1 sm-mb-3">
		{#snippet after()}
			{#if data.fromSong}
				<p class="opacity-90 mb-3">
					Opened from <a class="link-dim" href={data.fromSong.href}>{data.fromSong.title}</a>.
				</p>
			{/if}
		{/snippet}
		{#snippet controls()}
			<button
				class="button button-sm sm-bg-accent sm-text-oxford shrink-0"
				type="button"
				disabled={recorderBusy}
				title="New idea"
				aria-label="New idea"
				onclick={newIdea}
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				<span class="hidden sm-inline">New Idea</span>
			</button>
			<!-- The ideas and takes: on a phone a full-screen sheet from this button (the ⋯ menu's item too); from sm the Recordings panel, which this button minimises and brings back. -->
			<button
				class="button button-sm shrink-0 sm-hidden"
				style:anchor-name="--idea-search"
				type="button"
				popovertarget="idea-search"
				title="Ideas and takes"
				aria-label="Ideas and takes"
			>
				<span class="i-ph-magnifying-glass" aria-hidden="true"></span>
			</button>
			<button
				class="button button-sm shrink-0 hidden sm-inline-flex {recordingsMode === 'minimised'
					? ''
					: 'bg-accent text-oxford border-accent opacity-100'}"
				type="button"
				aria-pressed={recordingsMode !== "minimised"}
				title={recordingsMode === "minimised" ? "Show the recordings" : "Minimise the recordings"}
				aria-label={recordingsMode === "minimised"
					? "Show the recordings"
					: "Minimise the recordings"}
				onclick={toggleRecordings}
			>
				<span class="i-ph-magnifying-glass" aria-hidden="true"></span>
				<span class="hidden sm-inline-block">Ideas</span>
			</button>
			<!-- The tools: the metronome and the drums (a click or a beat while a take records) and the tuner. From sm up
			     they sit in the toolbar; a phone has room for one button, a tools menu holding them all. -->
			<div class="hidden sm-flex gap-2">
				<!-- The metronome: below lg the compact control; from lg one button that opens and closes the full metronome's panel (Kevin). -->
				<div class="lg-hidden"><Metronome compact /></div>
				<button
					class="button button-sm shrink-0 hidden lg-inline-flex {metroOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: metronome.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={metroOpen}
					title={metroOpen
						? "Close the metronome"
						: metronome.running
							? "The metronome is running; open it"
							: "Open the metronome"}
					aria-label={metroOpen ? "Close the metronome" : "Open the metronome"}
					onclick={toggleMetronome}
				>
					<span
						class="i-ph-metronome {metronome.running && metronome.beat === 0
							? 'scale-125'
							: ''} transition-transform"
						aria-hidden="true"
					></span>
				</button>
				<!-- The drums: below lg the compact control (play, stop, tempo) as on a phone; from lg one button that
				     opens and closes the full drum machine's floating panel (Kevin). -->
				<div class="lg-hidden"><DrumMachine compact /></div>
				<button
					class="button button-sm shrink-0 hidden lg-inline-flex {drumsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: drumMachine.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={drumsOpen}
					title={drumsOpen
						? "Close the drum machine"
						: drumMachine.running
							? "The beat is playing; open the drum machine"
							: "Open the drum machine"}
					aria-label={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
					onclick={toggleDrums}
				>
					<span class="grid place-items-center" aria-hidden="true"><IconDrumKit /></span>
				</button>
				<button
					class="button button-sm shrink-0 {pianoOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={pianoOpen}
					title={pianoOpen ? "Put the piano away" : "Play the piano into the take"}
					aria-label={pianoOpen ? "Put the piano away" : "Piano"}
					onclick={togglePiano}
				>
					<span class="i-ph-piano-keys" aria-hidden="true"></span>
				</button>
				<button
					class="button button-sm shrink-0 {chordsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={chordsOpen}
					title={chordsOpen ? "Put the chord player away" : "Play chords into the take"}
					aria-label={chordsOpen ? "Put the chord player away" : "Chord player"}
					onclick={toggleChords}
				>
					<span class="i-ph-circle-dashed" aria-hidden="true"></span>
				</button>
			</div>
			{#snippet tunerIcon()}
				<TuningForkIcon />
			{/snippet}
			{#snippet metronomeItem()}
				<div class="flex items-center gap-3 px-3 py-1.5">
					<span class="w-1em i-ph-metronome" aria-hidden="true"></span>
					<span class="grow">Metronome</span>
					<Metronome compact tempo="always" toggle="text" />
				</div>
			{/snippet}
			{#snippet drumsItem()}
				<div class="flex items-center gap-3 px-3 py-1.5">
					<span class="w-1em grid place-items-center" aria-hidden="true"><IconDrumKit /></span>
					<span class="grow">Drums</span>
					<DrumMachine compact tempo="always" toggle="text" />
				</div>
			{/snippet}
			<!-- A phone: the tools menu, or, while the metronome runs, its stop button in the menu's place
			     (one tap to stop, no digging; the tuner is back in the menu once it stops). -->
			<div class="sm-hidden">
				{#if metronome.running}
					<Metronome compact tempo="never" />
				{:else if drumMachine.running}
					<DrumMachine compact tempo="never" />
				{:else}
					<ContextMenu
						ariaLabel="Tools"
						title="Tools"
						iconClass="i-ph-wrench"
						buttonBaseClasses="button button-sm shrink-0"
						items={[
							{
								id: "tools-tuner",
								kind: "button",
								label: "Tuner",
								icon: tunerIcon,
								action: () => toggleTuner(),
							},
							{ id: "metronome", kind: "snippet", snippet: metronomeItem },
							{ id: "drums", kind: "snippet", snippet: drumsItem },
							{
								id: "tools-piano",
								kind: "button",
								label: pianoOpen ? "Put the piano away" : "Piano",
								iconClass: "i-ph-piano-keys",
								action: togglePiano,
							},
							{
								id: "tools-chords",
								kind: "button",
								label: chordsOpen ? "Put the chord player away" : "Chord player",
								iconClass: "i-ph-circle-dashed",
								action: toggleChords,
							},
						]}
					/>
				{/if}
			</div>
			<button
				class="button button-sm shrink-0 hidden sm-flex {tunerOpen
					? 'bg-accent text-oxford border-accent opacity-100'
					: ''}"
				type="button"
				aria-pressed={tunerOpen}
				title={tunerOpen ? "Close the tuner" : "Tuner"}
				aria-label="Tuner"
				onclick={toggleTuner}
			>
				<span aria-hidden="true">{@render tunerIcon()}</span>
			</button>
			<button
				class="button button-sm shrink-0"
				type="button"
				popovertarget="recorder-settings"
				title="Recorder settings"
				aria-label="Recorder settings"
			>
				<span class="i-ph-gear" aria-hidden="true"></span>
			</button>
		{/snippet}
	</PageCopyHeader>

	<!--
		Like the song page: the recorder where the player is, the notes where the
		documents are, the ideas list under the recorder. On a phone the recorder
		and the notes follow each other so both are in view, the list gives way to
		a picker above the recorder, and the takes are reached from the recorder's
		"Take N" dropdown.
	-->
	<div
		class="gap-y-2 grid grid-cols-1 grid-rows-[auto_1fr] h-full place-content-stretch max-h-full sm-h-auto sm-max-h-none sm-grid-rows-auto gap-4 sm-gap-x-8 sm-gap-y-4 xl-grid-cols-2 xl-grid-rows-[auto_1fr] overflow-x-hidden relative"
	>
		<section
			class="grid grid-cols-1 gap-6 place-content-start w-full xl-col-start-1 xl-row-start-1"
			aria-label="Recorder"
		>
			<!-- The recorder device: docked at the top of its column, or popped out into a panel of its own from lg (Kevin:
			     rearrange the screen however you want); one instance either way, so a take in progress is untouched. -->
			<FloatingPanel
				open={true}
				floating={recorderFloating}
				closable={false}
				title="Idea Recorder"
				storageKey="stemshovel.recorder.recorder-panel"
				width={640}
				height={640}
				onminimise={() => setRecorderFloating(false)}
			>
				{#snippet controls()}
					<button
						class="button button-xs hidden lg-inline-flex"
						type="button"
						title={recorderFloating
							? "Put the recorder back in its column"
							: "Pop the recorder out into a panel"}
						aria-label={recorderFloating ? "Dock the recorder" : "Pop out the recorder"}
						onclick={() => setRecorderFloating(!recorderFloating)}
					>
						<span
							class={recorderFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
							aria-hidden="true"
						></span>
					</button>
				{/snippet}
				<DemoRecorder
					bind:this={recorder}
					bind:ideaTitle
					onphase={(p) => (phase = p)}
					ontitlechange={titleChanged}
					ontakename={takeNamed}
					ondeletetake={removeTake}
					onaddtosong={(t) => idea && songDialog(idea, t, "add")}
					onnewsong={(t) => idea && songDialog(idea, t, "new")}
					onaddstems={(t) => idea && songDialog(idea, t, "stems")}
					bind:multitrack
					multitrackAvailable={sourcesInTake >= 2}
					ondeleteidea={() => idea && removeIdea(idea)}
					onnewidea={newIdea}
					minTakeSeconds={discardShort ? SHORT_TAKE_SECONDS : 0}
					quality={prefs.quality}
					{sourcesOn}
					ontoggle={setSource}
					{instrumentStreams}
					newIdeaDisabled={!ideaId && !takeId && phase === "idle"}
					takes={idea?.takes ?? []}
					onpick={(id) => {
						const row = idea?.takes.find((x) => x.id === id);
						if (idea && row) show(idea, row);
					}}
					onstart={() => {
						takeId = null;
						if (tunerOpen) void toggleTuner();
					}}
					onqueued={(t) => {
						takeId = t.localId;
						// The take lists at once, under its idea (or a pending group for a new one): unfold it.
						openIdeas.add(ideaId ?? `pending:${t.localId}`);
						queue.enqueue({
							...t,
							ideaId,
							ideaTitle,
							trimSilence: prefs.trimSilence,
							createdAt: Date.now(),
							// The instruments as the take was made, for the idea to keep (saved once the take lands).
							instruments: instrumentsForTake(),
						});
					}}
				/>
			</FloatingPanel>

			{#if loadedTake && loadedTake.stems.length > 0}
				<!-- The tracks of a multitrack take (docs/demo-recording.md, "Multitrack takes"): the song player over its stems, each with its waveform, mute, solo and fader, under the recorder. -->
				<FloatingPanel
					open={true}
					floating={tracksFloating}
					closable={false}
					title="Tracks · Take {loadedTake.takeNumber}"
					storageKey="stemshovel.recorder.tracks-panel"
					width={640}
					height={420}
					onminimise={() => setTracksFloating(false)}
				>
					{#snippet controls()}
						<button
							class="button button-xs hidden lg-inline-flex"
							type="button"
							title={tracksFloating
								? "Put the tracks back under the recorder"
								: "Pop the tracks out into a panel"}
							aria-label={tracksFloating ? "Dock the tracks" : "Pop out the tracks"}
							onclick={() => setTracksFloating(!tracksFloating)}
						>
							<span
								class={tracksFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
								aria-hidden="true"
							></span>
						</button>
					{/snippet}
					{#key loadedTake.id}
						{#await loopSources({ id: loadedTake.id })}
							<p class="p-4 text-13px opacity-70">Loading the tracks…</p>
						{:then found}
							<div class="p-3">
								<StemPlayer
									manifest={{
										title: loadedTake.title || `Take ${loadedTake.takeNumber}`,
										stems: found.sources.map((src, i) => ({
											id: `${loadedTake.id}-${i}`,
											label: src.label,
											url: src.url,
										})),
									}}
									showStatus={false}
									keyboard={false}
								/>
							</div>
						{:catch e}
							<p class="p-4 text-13px text-red-300">{errorMessage(e)}</p>
						{/await}
					{/key}
				</FloatingPanel>
			{/if}

			{#if drumsOpen || drumMachine.running}
				<!-- The drums: in the take unless switched off (the beat's sound through the recorder's mix, as the piano's). -->
				<div
					class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-13px text-dim"
					aria-label="Drums in the take"
				>
					<span>
						{drumsInTake
							? "The drum machine goes into the take while it plays."
							: "The drum machine plays along but stays out of the take."}
					</span>
					<span class="flex flex-wrap items-center gap-x-4 gap-y-2">
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								class="accent-maximumYellow"
								checked={drumsInTake}
								onchange={(e) => setDrumsInTake(e.currentTarget.checked)}
							/>
							Drums in the take
						</label>
						<label
							class="flex items-center gap-2"
							title="A take saves the beat and the drum machine's settings with the idea, and opening the idea brings them back"
						>
							<input
								type="checkbox"
								class="accent-maximumYellow"
								checked={drumsSettings}
								onchange={(e) => setDrumsSettings(e.currentTarget.checked)}
							/>
							Settings with the idea
						</label>
					</span>
				</div>
			{/if}

			<!-- The tuner: listens while open, quiet again when closed or when a take starts. Its own panel from lg, docked here below. -->
			<FloatingPanel
				open={tunerOpen}
				title="Instrument Tuner"
				storageKey="stemshovel.recorder.tuner-panel"
				width={640}
				height={520}
				onminimise={() => toggleTuner()}
			>
				<Tuner bind:this={tuner} />
			</FloatingPanel>

			<!-- The piano: in a floating panel from lg (dragged, resized, remembered), docked here under the recorder below
			     it; one instance either way. Its sound is mixed into the next take (docs/piano.md), with or without the microphone. -->
			<FloatingPanel
				open={pianoOpen}
				title="Piano"
				storageKey="stemshovel.recorder.piano-panel"
				width={980}
				height={420}
				onminimise={() => togglePiano()}
			>
				{#snippet controls()}
					<label
						class="flex items-center gap-2 text-13px text-dim cursor-pointer"
						title="The piano's sound goes into the take while it is out"
					>
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={pianoInTake}
							onchange={(e) => setPianoInTake(e.currentTarget.checked)}
						/>
						Piano in the take
					</label>
					<label
						class="flex items-center gap-2 text-13px text-dim cursor-pointer"
						title="A take saves the piano's sound and effects with the idea, and opening the idea brings them back"
					>
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={pianoSettings}
							onchange={(e) => setPianoSettings(e.currentTarget.checked)}
						/>
						Settings with the idea
					</label>
				{/snippet}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div onpointerdowncapture={() => (spaceOwner = "piano")}>
					<Piano
						warm
						samplesBase={data.pianoSamplesBase}
						keyboard={spaceOwner === "piano"}
						sitePresets={data.sitePresets}
						account={{ id: data.account.id, name: data.account.name, canEdit: true }}
						presets={data.pianoPresets}
						presetAdmin={data.presetAdmin}
					/>
				</div>
			</FloatingPanel>

			<!-- The chord player: the piano engine on the circle of fifths (docs/chord-player.md), its own panel and its own source; one of it and the piano is in the take at a time. -->
			<FloatingPanel
				open={chordsOpen}
				title="Chord player"
				storageKey="stemshovel.recorder.chords-panel"
				width={760}
				height={720}
				onminimise={() => toggleChords()}
			>
				{#snippet controls()}
					<label
						class="flex items-center gap-2 text-13px text-dim cursor-pointer"
						title="The chord player's sound goes into the take while it is out (it takes the piano's place: they are one sound)"
					>
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={chordsInTake}
							onchange={(e) => setChordsInTake(e.currentTarget.checked)}
						/>
						Chords in the take
					</label>
				{/snippet}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div onpointerdowncapture={() => (spaceOwner = "chords")}>
					<ChordPlayer
						samplesBase={data.pianoSamplesBase}
						keyboard={spaceOwner === "chords"}
						sitePresets={data.chordPresets}
						account={{ id: data.account.id, name: data.account.name, canEdit: true }}
						presets={data.pianoPresets}
						presetAdmin={data.presetAdmin}
						chordStyles={data.chordStyles}
						pad={false}
					/>
				</div>
			</FloatingPanel>

			<!-- Uploads that failed: a take still saving is listed under its idea instead. -->
			{#if queue.items.some((u) => u.status === "failed")}
				<ul class="grid gap-1 text-sm" aria-label="Failed uploads">
					{#each queue.items.filter((u) => u.status === "failed") as u (u.localId)}
						<li
							class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-red-400/40 bg-red-400/5 px-3 py-2"
						>
							<span class="i-ph-cloud-warning" aria-hidden="true"></span>
							<span class="min-w-0 grow truncate">
								{u.ideaTitle}{u.name ? ` · ${u.name}` : ""} · {formatTime(u.durationSeconds, 0)}
							</span>
							<span class="text-red-400">{u.error}</span>
							<button class="link-dim" type="button" onclick={() => queue.retry(u.localId)}
								>Retry</button
							>
							<button class="link-dim" type="button" onclick={() => discardUpload(u)}
								>Discard</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- The idea's note board; a new idea's notes create it on the first save. Docked in its column, or popped out
		     into a panel of its own from lg (Kevin), the same editor either way. -->
		<section
			class="h-full max-h-full overflow-y-scroll sm-h-auto sm-max-h-none sm-min-h-560px xl-col-start-2 xl-row-start-1 xl-row-span-2 max-w-full overflow-x-hidden sm-overflow-y-visible rounded-md"
			aria-label="Notes"
		>
			<FloatingPanel
				open={true}
				floating={notesFloating}
				closable={false}
				title={`Notes for “${ideaTitle}”`}
				storageKey="stemshovel.recorder.notes-panel"
				width={560}
				height={620}
				onminimise={() => setNotesFloating(false)}
			>
				{#snippet controls()}
					<button
						class="button button-xs hidden lg-inline-flex"
						type="button"
						title={notesFloating
							? "Put the notes back in their column"
							: "Pop the notes out into a panel"}
						aria-label={notesFloating ? "Dock the notes" : "Pop out the notes"}
						onclick={() => setNotesFloating(!notesFloating)}
					>
						<span
							class={notesFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
							aria-hidden="true"
						></span>
					</button>
					<button
						class="button button-xs"
						type="button"
						title="Clear the notes"
						aria-label="Clear the notes"
						onclick={() => {
							if (confirm("Clear the notes?")) clearNotes?.();
						}}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
					</button>
				{/snippet}
				{#key notesKey}
					<IdeaNotesPanel
						idea={{ id: ideaId, notes, title: ideaTitle }}
						{ensureIdea}
						onchange={(m) => (notes = m)}
						onsaved={async ({ ideaDeleted }) => {
							// Emptied notes on an idea without takes remove the idea; the list shows the first line of the notes.
							if (ideaDeleted) ideaId = null;
							await invalidateAll();
						}}
					/>
				{/key}
			</FloatingPanel>
		</section>

		<!-- Ideas, newest first, each opening to its takes; the current one is open. The panel docks here, floats, or is minimised to the toolbar (recordingsMode). -->
		<section
			class="hidden sm-grid grid-cols-1 content-start gap-2 xl-col-start-1 xl-row-start-2 xl-max-h-640px"
			aria-label="Ideas"
		>
			<FloatingPanel
				open={recordingsMode !== "minimised"}
				floating={recordingsMode === "floating"}
				closable={true}
				title="Recordings"
				storageKey="stemshovel.recorder.recordings-panel"
				width={560}
				height={600}
				onminimise={() => setRecordingsMode("minimised")}
			>
				{#snippet controls()}
					<label
						class="flex items-center gap-2 text-13px text-dim cursor-pointer"
						title="Loops saved from the looper are kept out of the list unless shown"
					>
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={showLoops}
							onchange={(e) => setShowLoops(e.currentTarget.checked)}
						/>
						Show loops
					</label>
					<button
						class="button button-xs hidden lg-inline-flex"
						type="button"
						title={recordingsMode === "floating"
							? "Put the recordings back in their column"
							: "Pop the recordings out into a panel"}
						aria-label={recordingsMode === "floating"
							? "Dock the recordings"
							: "Pop out the recordings"}
						onclick={() => setRecordingsMode(recordingsMode === "floating" ? "docked" : "floating")}
					>
						<span
							class={recordingsMode === "floating"
								? "i-ph-arrows-in-simple"
								: "i-ph-arrows-out-simple"}
							aria-hidden="true"
						></span>
					</button>
				{/snippet}
				{@render recordingsList()}
			</FloatingPanel>
		</section>

		<!-- <p class="text-13px opacity-70 xl-col-span-2">
			Tips: keep the screen on and the app in front while recording (a phone stops the microphone
			when it sleeps or switches apps). Voice processing is switched off so instruments sound like
			themselves. Takes are saved as your browser recorded them and converted to MP3 for playback.
		</p> -->
	</div>

	<!-- A take into a song: add as a demo, or create a new song. -->
	<div
		id="take-song"
		popover="auto"
		bind:this={songPanel}
		class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(36rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">
				{songMode === "add"
					? "Add as demo"
					: songMode === "stems"
						? "Add as stems"
						: "Create new song"}
			</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="take-song"
				popovertargetaction="hide">Close</button
			>
		</div>
		{#if songTarget}
			<p class="mb-4 text-sm opacity-90">{songTarget.label}</p>
			{#key `${songTarget.id}/${songMode}`}
				<RecordingActions
					mode={songMode}
					take={songTarget}
					projects={data.projects}
					fromSong={data.fromSong}
				/>
			{/key}
		{/if}
	</div>

	<!-- Recorder settings: per-browser preferences (localStorage), the gear in the header. -->
	<div
		id="recorder-settings"
		popover="auto"
		class="fixed
		h-screen
		left-0
		overflow-y-auto
		pb-6
		px-3
		pt-5
		rounded-md
		text-blue-100
		top-0
		w-full
		sm-[position-area:bottom_span-left]
		sm-absolute
		sm-h-auto
		sm-max-h-fit
		sm-mt-4
		sm-max-h-[calc(100dvh-2rem)]
		sm-w-[min(640px,100vw)]
		sm-border
		sm-border-white/5
		bg-oxford
		sm-px-8
		sm-pt-5
		sm-pb-12
	 sm-shadow-2xl
		sm-shadow-black/60
		sm-[&::backdrop]-bg-black/60
		sm-[&::backdrop]-backdrop-blur-none"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="font-600">Recorder Settings</h2>
			<button
				class="button-popover-close"
				type="button"
				popovertarget="recorder-settings"
				popovertargetaction="hide"
			>
				<span class="sr-only">Close</span>
			</button>
		</div>
		<div class="grid gap-5 text-sm">
			<fieldset class="grid gap-2">
				<legend class="mb-1 font-500">Quality</legend>
				<label class="flex items-start gap-3">
					<input
						class="mt-1 accent-maximumYellow"
						type="radio"
						name="quality"
						value="lossless"
						bind:group={prefs.quality}
						onchange={savePrefs}
					/>
					<span>
						Lossless where the browser can
						<span class="block text-13px opacity-70"
							>ALAC on iPhone, iPad and Safari (18.4 or later), raw PCM on Chrome and Edge (kept as
							FLAC); Opus or AAC elsewhere. About 3 MB a minute in mono.</span
						>
					</span>
				</label>
				<label class="flex items-start gap-3">
					<input
						class="mt-1 accent-maximumYellow"
						type="radio"
						name="quality"
						value="compressed"
						bind:group={prefs.quality}
						onchange={savePrefs}
					/>
					<span>
						Compressed
						<span class="block text-13px opacity-70"
							>Opus or AAC at 256 kbit/s, about 2 MB a minute: for a slow or metered connection.</span
						>
					</span>
				</label>
			</fieldset>
			<label class="flex items-start gap-3">
				<input
					class="mt-1 accent-maximumYellow"
					type="checkbox"
					bind:checked={discardShort}
					onchange={() => saveDiscardShortTakes(discardShort)}
				/>
				<span>
					Discard takes shorter than {SHORT_TAKE_SECONDS} seconds automatically
					<span class="block text-13px opacity-70"
						>A mis-tap on Record is dropped instead of saved.</span
					>
				</span>
			</label>
			<label class="flex items-start gap-3">
				<input
					class="mt-1 accent-maximumYellow"
					type="checkbox"
					bind:checked={prefs.trimSilence}
					onchange={savePrefs}
				/>
				<span>
					Trim silence at the start and end
					<span class="block text-13px opacity-70"
						>Once a take is saved, the silence before the first sound and after the last is cut from
						the take and its MP3 alike, leaving a little room. Off unless you turn it on.</span
					>
				</span>
			</label>
			<p class="text-13px opacity-70">Remembered on this device.</p>
		</div>
	</div>

	<!-- The phone's sheet of ideas and takes (from sm the Recordings panel holds the list). -->
	<div
		id="idea-search"
		popover="auto"
		onbeforetoggle={(e) => {
			searchOpen = e.newState === "open";
			if (searchOpen) searchText = "";
		}}
		class="
		fixed
		h-screen
		left-0
		overflow-y-auto
		pb-6
		px-3
		pt-5
		rounded-md
		text-blue-100
		top-0
		w-full
		sm-[position-area:bottom_span-left]
		sm-absolute
		sm-mt-4
		sm-max-h-[calc(100dvh-2rem)]
		sm-w-[min(640px,100vw)]
		sm-border
		sm-border-white/5
		bg-oxford
		sm-px-8
		sm-pt-5
		sm-pb-12
	 sm-shadow-2xl
		sm-shadow-black/60
		sm-[&::backdrop]-bg-black/60
		sm-[&::backdrop]-backdrop-blur-none
		[&:popover-open]:flex
		[&:popover-open]:flex-col
		sm-h-[min(85dvh,52rem)]"
		style:position-anchor="--idea-search"
	>
		<!-- Full screen on a phone: the same list as the Recordings panel, the sheet closing on a chosen take. -->
		<div class="flex items-center justify-between mb-4">
			<h2 class="font-600">Recordings</h2>
			<button
				class="button-popover-close ml-auto"
				type="button"
				popovertarget="idea-search"
				popovertargetaction="hide"
			>
				<span class="sr-only">Close</span>
			</button>
		</div>
		{@render recordingsList()}
	</div>
	<div class="hidden sm-block">
		<PageCopySection
			html={data.copy.bodyHtml}
			docsHref="/docs/idea-recorder"
			docsLabel="Idea Recorder docs"
			docsLead="Learn more about using the Idea Recorder in the user docs."
		/>
	</div>
</main>

<!-- The ideas and takes with the search field at the top: in the Recordings panel from sm, in the phone's sheet below it. -->
{#snippet recordingsList()}
	<div class="grid grid-cols-1 content-start gap-2">
		<label class="flex">
			<span class="sr-only">Search ideas and takes</span>
			<input
				class="field text-sm"
				type="search"
				placeholder="Filter by title, notes, take label or number…"
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				bind:value={searchText}
			/>
		</label>
		{#if query}
			<p class="text-12px uppercase tracking-wider opacity-60">
				{shownFiltered.length} of {ideasShown.length}
				{ideasShown.length === 1 ? "idea" : "ideas"}
			</p>
		{/if}
		{#if shownFiltered.length === 0}
			<p
				class="rounded border border-dashed border-white/15 px-4 py-4 text-center text-sm opacity-90"
			>
				{query
					? "Nothing matches."
					: "Nothing recorded yet. Your ideas and their takes will list here."}
			</p>
		{:else}
			<ul
				class="
					max-h-[60vh]
					min-h-64
					overflow-y-auto
					rounded
					bg-slate-400
					bg-gradient-to-br
					from-slate-500/10
					via-slate-500/60
					to-slate-500/80
					divide-y
					divide-dark/30
				  shadow-xl
					shadow-oxford-800
						{recorderBusy ? 'opacity-60' : ''}"
			>
				{#each shownFiltered as i (i.id)}
					<li>
						<!--
							An accordion and nothing more: the row only folds and unfolds; a take
							loads. The set is the one source of truth (the native toggle is
							cancelled): a toggle event lands after a re-render from an autosave
							and the two would otherwise fight over the state.
						-->
						<details open={openIdeas.has(i.id) || matchedTakes.has(i.id)}>
							<summary
								class="
									cursor-pointer
									font-sans
									grid
									grid-cols-[auto_1fr_auto_auto]
									items-center
									gap-x-3
									opacity-95
									px-4
									py-2.5
									list-none
									shadow
									text-oxford
									hover-opacity-100
									[&::-webkit-details-marker]:hidden {i.id === ideaId || (i.pending && !ideaId)
									? 'bg-blue-300/10'
									: ''}"
								onclick={(e) => {
									e.preventDefault();
									if (openIdeas.has(i.id)) openIdeas.delete(i.id);
									else openIdeas.add(i.id);
								}}
							>
								<span
									class="i-ph-caret-right-bold inline-block text-1em opacity-90 {openIdeas.has(i.id)
										? 'rotate-90'
										: ''}"
									aria-hidden="true"
								></span>
								<span class="block truncate font-600 w-full font-sans w-full"
									>{#if i.kind === "loop"}<span
											class="i-ph-repeat inline-block align-[-2px] mr-1.5 opacity-80"
											title="A loop saved from the looper"
											aria-label="Loop"
										></span>{/if}{i.title}</span
								>
								<span class="text-14px tabular-nums opacity-90 h-full inline-flex items-center"
									>{i.takes.length}
									{i.takes.length === 1 ? "take" : "takes"} | {formatDate(i.createdAt)}</span
								>
							</summary>
							{#if i.takes.length > 0}
								<ul
									class="divide-y divide-dark/10 bg-blue-100/40 border-t border-t-dark/30 text-oxford"
								>
									{#each i.takes as t (t.id)}
										<li
											class="grid grid-cols-[1fr_auto] items-center gap-2 pr-2 shadow-inner {t.id ===
											takeId
												? 'bg-blue-300/15'
												: ''}"
										>
											<button
												class="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 py-2 pl-12 pr-2 text-left hover:bg-white/5 disabled:cursor-default"
												type="button"
												aria-current={t.id === takeId ? "true" : undefined}
												disabled={recorderBusy || !!t.pending}
												onclick={() => show(i, t)}
											>
												<span class="inline-grid w-full grid-cols-1">
													<span class="truncate"
														>{takeLabel(t)}{#if t.stems.length > 0}<span
																class="ml-2 text-11px opacity-70"
																title={t.stems.map((s) => s.label).join(", ")}
																>· {t.stems.length} stems</span
															>{/if}</span
													>
													<span class="text-12px opacity-70">{fmtWhen(t.createdAt)}</span>
												</span>
												<span
													class="text-sm tabular-nums opacity-80 inline-flex h-full items-center gap-1"
												>
													{#if t.pending}
														<span class="i-ph-cloud-arrow-up animate-pulse" aria-hidden="true"
														></span>
														{t.pending.status === "uploading"
															? `Saving… ${Math.round(t.pending.progress)}%`
															: "Waiting…"}
													{:else}
														{t.durationSeconds !== null ? formatTime(t.durationSeconds, 0) : "–:––"}
													{/if}
												</span>
											</button>
											{#if !t.pending}
												<ContextMenu
													buttonClasses="text-oxford bg-slate-800/5 hover-bg-slate-800/20"
													popoverClasses="text-blue-100"
													title="Take Menu"
													ariaLabel="Menu for {takeLabel(t)}"
													items={[
														{
															action: () => songDialog(i, t, "add"),
															kind: "button",
															iconClass: "i-ph-plus",
															label: "Add as demo...",
														},
														{
															action: () => songDialog(i, t, "stems"),
															kind: "button",
															iconClass: "i-ph-stack",
															label: `Add ${t.stems.length} stems to song...`,
															condition: t.stems.length > 0,
														},
														{
															action: () => songDialog(i, t, "new"),
															kind: "button",
															iconClass: "i-ph-music-notes-plus",
															label: "Create new song...",
														},
														{
															kind: "divider",
														},
														{
															action: () => removeTake(t),
															kind: "button",
															iconClass: "i-ph-trash",
															label: "Delete Take",
														},
													]}
												/>
											{/if}
										</li>
									{/each}
								</ul>
							{/if}
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}

<!-- The metronome's floating panel (desktop), as the drum machine's. -->
<FloatingPanel
	open={metroOpen}
	title="Metronome"
	storageKey="stemshovel.recorder.metronome-panel"
	width={640}
	height={520}
	onminimise={() => toggleMetronome()}
>
	<Metronome />
</FloatingPanel>

<!-- The drum machine's floating panel (desktop): dragged by its header, resized by its corner, minimised to the toolbar. -->
<FloatingPanel
	open={drumsOpen}
	title="Drum machine"
	storageKey="stemshovel.recorder.drum-panel"
	onminimise={() => toggleDrums()}
>
	{#snippet controls()}
		<label class="flex items-center gap-2 text-13px text-dim cursor-pointer">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={drumsInTake}
				onchange={(e) => setDrumsInTake(e.currentTarget.checked)}
			/>
			In the take
		</label>
		<label
			class="flex items-center gap-2 text-13px text-dim cursor-pointer"
			title="A take saves the beat and the drum machine's settings with the idea, and opening the idea brings them back"
		>
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={drumsSettings}
				onchange={(e) => setDrumsSettings(e.currentTarget.checked)}
			/>
			Settings with the idea
		</label>
	{/snippet}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div onpointerdowncapture={() => (spaceOwner = "drums")}>
		<DrumMachine
			kits={data.kits}
			keyboard={spaceOwner === "drums"}
			account={{ id: data.account.id, name: data.account.name, canEdit: true }}
			beats={data.beats}
			textToBeat={data.textToBeat}
		/>
	</div>
</FloatingPanel>
