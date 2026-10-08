<script lang="ts">
	import ChordPlayer from "#lib/components/ChordPlayer.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import DrumMachine from "#lib/components/DrumMachine.svelte";
	import IconDrumKit from "#lib/components/IconDrumKit.svelte";
	import Piano from "#lib/components/Piano.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import IdeaNotesPanel from "#lib/components/IdeaNotesPanel.svelte";
	import InputSourceSettings from "#lib/components/InputSourceSettings.svelte";
	import Metronome from "#lib/components/Metronome.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import PageCopySection from "#lib/components/PageCopySection.svelte";
	import StudioTimeline from "#lib/components/StudioTimeline.svelte";
	import { chordPlayer } from "#lib/audio/chordPlayer.svelte.js";
	import { drumMachine } from "#lib/audio/drumMachine.svelte.js";
	import { inputSources } from "#lib/audio/inputs.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { chordPiano, piano } from "#lib/audio/piano.svelte.js";
	import { isInstrument, studio, type StudioTake } from "#lib/audio/studio.svelte.js";
	import { StudioQueue } from "#lib/audio/studioQueue.svelte.js";
	import { STUDIO_MEMORY_WARNING_BYTES } from "#lib/constants/studio.js";
	import { DEMO_ACCEPT } from "#lib/constants/demoFormats.js";
	import { parseMidi } from "#lib/audio/midi.js";
	import PianoRoll from "#lib/components/PianoRoll.svelte";
	import { MAX_TAKE_BYTES } from "#lib/constants/takeLimits.js";
	import {
		createIdea,
		deleteIdeaNow,
		renameIdea,
		saveIdeaInstruments,
	} from "#lib/remote/ideas.remote.js";
	import {
		autosaveArrangement,
		deleteStudioRevision,
		deleteStudioSource,
		renameStudioRevision,
		restoreStudioRevision,
		saveStudioRevision,
	} from "#lib/remote/studio.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import {
		postJson,
		uploadDemoFile,
		uploadStemFile,
		type DemoReservation,
		type Reservation,
	} from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { downloadBlob } from "#lib/utils/downloadBlob.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import type { IdeaInstruments } from "#lib/val/IdeaSchema.js";
	import type {
		StudioClip,
		StudioInputSource,
		StudioSongView,
		StudioTrack,
	} from "#lib/val/StudioSchema.js";
	import { refreshAll } from "$app/navigation";
	import { onMount, untrack } from "svelte";

	/**
	 * The Studio (docs/multitrack-recorder.md): the user's own multitrack
	 * recorder. A song is an idea of kind "song"; its arrangement autosaves
	 * as it changes and can be kept under a name as a revision; its takes
	 * upload through a queue as sources. The device holds the transport and
	 * the timeline; the songs, the notes, the inputs and the metronome live
	 * in panels as on the looper page.
	 */
	let { data } = $props();
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, {
			__studio: studio,
			__inputs: inputSources,
			__metronome: metronome,
			__piano: piano,
			__chordPiano: chordPiano,
			__chords: chordPlayer,
			__drums: drumMachine,
		});

	// ── The song open on the device ────────────────────────────────────────
	const LAST_KEY = "stemshovel.studio.last-song";
	let songId = $state<string | null>(null);
	let song = $derived(data.songs.find((s) => s.id === songId) ?? null);
	let title = $state("");
	let notes = $state("");
	let notesKey = $state(0);
	/** The song the engine holds ("" for none); starts unset so the first open always loads. */
	let loadedKey = "unloaded";
	let selected = $state<string | null>(null);
	let pxPerSecond = $state(40);

	/** Open a song on the device: its arrangement and sources into the engine (once per song). */
	function openSong(s: StudioSongView | null) {
		songId = s?.id ?? null;
		title = s?.title ?? "";
		notes = s?.notes ?? "";
		notesKey++;
		selected = null;
		loadInstruments(s?.instruments ?? null);
		try {
			if (s) localStorage.setItem(LAST_KEY, s.id);
			else localStorage.removeItem(LAST_KEY);
		} catch {
			// Private mode: the choice lasts for this page only.
		}
		const key = s?.id ?? "";
		if (key === loadedKey) return;
		loadedKey = key;
		void studio.load(s ?? { current: null, sources: [] });
	}
	onMount(() => {
		let last: string | null = null;
		try {
			last = localStorage.getItem(LAST_KEY);
			pxPerSecond = Number(localStorage.getItem("stemshovel.studio.zoom")) || 40;
		} catch {
			// As above.
		}
		openSong(data.songs.find((s) => s.id === last) ?? data.songs[0] ?? null);
		void queue.restore();
		return () => {
			autosaveNow();
			studio.dispose();
		};
	});
	// fallow-ignore-next-line policy-violation:stem-shovel-house-rules/svelte-effect-last-resort -- the zoom is bound into the timeline, which changes it from the wheel; this remembers it
	// The zoom is remembered per browser.
	$effect(() => {
		try {
			localStorage.setItem("stemshovel.studio.zoom", String(Math.round(pxPerSecond)));
		} catch {
			// As above.
		}
	});

	const defaultTitle = () =>
		`Song · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
	/** The song's id, making the song when the device holds none yet (the first take, the first note). */
	async function ensureSong(): Promise<string> {
		if (songId) return songId;
		const created = await createIdea({
			accountId: data.account.id,
			title: title.trim() || defaultTitle(),
			kind: "song",
		});
		songId = created.id;
		title = created.title;
		loadedKey = created.id;
		try {
			localStorage.setItem(LAST_KEY, created.id);
		} catch {
			// As above.
		}
		await refreshAll();
		return created.id;
	}
	async function newSong() {
		if (studio.running) studio.stop();
		await autosaveNow();
		try {
			const created = await createIdea({
				accountId: data.account.id,
				title: defaultTitle(),
				kind: "song",
			});
			await refreshAll();
			openSong(data.songs.find((s) => s.id === created.id) ?? null);
		} catch (e) {
			notify(`Could not make a song: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function titleChanged(value: string) {
		const next = value.trim().slice(0, 120);
		if (!next) {
			title = song?.title ?? "";
			return;
		}
		title = next;
		try {
			const id = await ensureSong();
			await renameIdea({ id, title: next });
			await refreshAll();
		} catch (e) {
			notify(`Title not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function removeSong(s: StudioSongView) {
		const n = s.sources.length;
		if (
			!confirm(
				`Delete “${s.title}”${n ? ` and its ${n} ${n === 1 ? "recording" : "recordings"}` : ""}? This cannot be undone.`,
			)
		)
			return;
		try {
			if (s.id === songId) {
				studio.stop();
				loadedKey = "";
			}
			await deleteIdeaNow({ id: s.id });
			await refreshAll();
			if (s.id === songId) openSong(data.songs[0] ?? null);
			notify(`“${s.title}” deleted`);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ── Autosave and revisions ─────────────────────────────────────────────
	let saving = $state(false);
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let lastSaved = "";
	$effect(() => {
		if (!studio.dirty) return;
		// Debounced: a burst of edits saves once, a second and a half after the last.
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void autosaveNow(), 1500);
	});
	async function autosaveNow() {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = null;
		if (!studio.dirty) return;
		const snapshot = $state.snapshot(studio.arrangement);
		const sent = JSON.stringify(snapshot);
		if (sent === lastSaved) {
			studio.dirty = false;
			return;
		}
		saving = true;
		try {
			const id = await ensureSong();
			await autosaveArrangement({ ideaId: id, data: snapshot });
			lastSaved = sent;
			if (JSON.stringify($state.snapshot(studio.arrangement)) === sent) studio.dirty = false;
		} catch (e) {
			notify(`Not saved: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function saveRevision() {
		const name = prompt("Name this revision", `Revision ${(song?.revisions.length ?? 0) + 1}`);
		if (!name?.trim()) return;
		try {
			const id = await ensureSong();
			await saveStudioRevision({
				ideaId: id,
				name: name.trim(),
				data: $state.snapshot(studio.arrangement),
			});
			lastSaved = JSON.stringify($state.snapshot(studio.arrangement));
			studio.dirty = false;
			await refreshAll();
			notify(`Revision “${name.trim()}” saved`);
		} catch (e) {
			notify(`Revision not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function restoreRevision(rev: { id: string; name: string | null; number: number }) {
		const label = rev.name ?? `autosave ${rev.number}`;
		if (
			studio.dirty &&
			!confirm(`Restore “${label}”? Unsaved changes here become an autosave first.`)
		)
			return;
		try {
			await autosaveNow();
			if (studio.running) studio.stop();
			const { data: arrangement } = await restoreStudioRevision({ id: rev.id });
			studio.replaceArrangement(arrangement);
			lastSaved = JSON.stringify($state.snapshot(studio.arrangement));
			studio.dirty = false;
			await refreshAll();
			notify(`Restored “${label}”`);
		} catch (e) {
			notify(`Could not restore: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function renameRevision(rev: { id: string; name: string | null }) {
		const name = prompt("Rename this revision", rev.name ?? "");
		if (!name?.trim()) return;
		try {
			await renameStudioRevision({ id: rev.id, name: name.trim() });
			await refreshAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	async function removeRevision(rev: { id: string; name: string | null }) {
		if (!confirm(`Delete the revision “${rev.name}”?`)) return;
		try {
			await deleteStudioRevision({ id: rev.id });
			await refreshAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ── Recording and the upload queue ─────────────────────────────────────
	const queue = new StudioQueue({
		onsaved: (sourceId) => {
			studio.markSourceSaved(sourceId);
			void refreshAll();
		},
	});
	let uploading = $derived(queue.items.filter((u) => u.status !== "failed").length);
	let failed = $derived(queue.items.filter((u) => u.status === "failed"));
	/**
	 * The instruments as the song had them, into the engines (the recorder's
	 * way, docs/demo-recording.md): a song without any leaves them alone.
	 */
	function loadInstruments(saved: IdeaInstruments | null) {
		if (!saved) return;
		drumMachine.load();
		piano.load();
		if (saved.drums) drumMachine.loadProject(saved.drums, "replace", title || "Studio");
		if (saved.piano) piano.applyPreset(saved.piano);
		if (saved.chords) chordPlayer.applyPresetSettings(saved.chords);
	}
	/** A take from an instrument track landed: that instrument's settings onto the song (the server keeps the others). */
	let instrumentsToSave: { drums: boolean; piano: boolean; chords: boolean } | null = null;
	function noteInstrumentTake(source: StudioInputSource | null) {
		if (!source || !isInstrument(source)) return;
		const pending = instrumentsToSave ?? { drums: false, piano: false, chords: false };
		pending[source] = true;
		if (!instrumentsToSave) {
			instrumentsToSave = pending;
			// Every take of the pass lands in one tick; one save for them all.
			queueMicrotask(() => void saveInstruments());
		} else instrumentsToSave = pending;
	}
	async function saveInstruments() {
		const which = instrumentsToSave;
		instrumentsToSave = null;
		const id = songId;
		if (!which || !id) return;
		drumMachine.load();
		piano.load();
		try {
			await saveIdeaInstruments({
				id,
				drums: which.drums ? $state.snapshot(drumMachine.project) : null,
				piano: which.piano ? piano.currentPreset() : null,
				chords: which.chords ? $state.snapshot(chordPlayer.presetSettings) : null,
				looper: null,
			});
		} catch (e) {
			notify(`Instrument settings not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	studio.ontake = (take: StudioTake) => {
		const id = songId;
		if (!id) return;
		noteInstrumentTake(
			studio.arrangement.tracks.find((t) => t.id === take.trackId)?.input?.source ?? null,
		);
		queue.enqueue({
			sourceId: take.sourceId,
			ideaId: id,
			kind: take.kind,
			filename: take.filename,
			trackLabel: take.trackLabel,
			takeNumber: take.takeNumber,
			durationSeconds: take.durationSeconds,
			sampleRate: take.buffer.sampleRate,
			channels: take.buffer.numberOfChannels === 2 ? 2 : 1,
			peaks: Array.from(studio.sources[take.sourceId]?.peaks ?? []),
			createdAt: Date.now(),
			blob: take.blob,
		});
		// A take is a big change: saved at once, not after the debounce (a reload right after would lose it).
		void autosaveNow();
	};
	/** Leaving with an edit still unsaved (the debounce pending, a save failed): the browser asks first. */
	function onbeforeunload(e: BeforeUnloadEvent) {
		if (!studio.dirty && !saving) return;
		e.preventDefault();
	}
	/** Record: the song exists first (its takes need a home), the armed inputs are open, then the engine runs. */
	async function record() {
		if (studio.running) {
			studio.stop();
			return;
		}
		try {
			await ensureSong();
			for (const t of studio.armedTracks) await armInput(t);
			const ok = await studio.record();
			if (!ok && studio.notice) notify(studio.notice, { kind: "error" });
			studio.notice = null;
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
	/** A track armed: its input opens (the microphone asks on its first turn). */
	async function armInput(track: StudioTrack) {
		const input = track.input;
		if (!input) return;
		// An instrument's panel comes out (it plays into the song from there); an outside input opens.
		if (isInstrument(input.source)) {
			if (input.source === "piano" && !pianoOpen) togglePiano();
			if (input.source === "chords" && !chordsOpen) toggleChords();
			if (input.source === "drums" && !drumsOpen) toggleDrums();
			return;
		}
		if (inputSources.has(input.source)) return;
		const ok = await studio.requestInput(input.source);
		if (!ok) {
			const err = inputSources.errors[input.source];
			notify(err ?? `Could not open the ${input.source}`, { kind: "error" });
		}
	}
	/** Audio files onto the selected clip's track (else the first, else a new one) at the playhead, one after another; each uploads as a source. */
	let importing = $state(false);
	async function importFiles(files: File[]) {
		if (!files.length) return;
		importing = true;
		try {
			await ensureSong();
			let track: StudioTrack | null =
				studio.arrangement.tracks.find(
					(t) => t.id === studio.arrangement.clips.find((c) => c.id === selected)?.trackId,
				) ??
				studio.arrangement.tracks[0] ??
				studio.addTrack(null, "Imports");
			let at = studio.position;
			for (const file of files) {
				if (/\.midi?$/i.test(file.name)) {
					// A MIDI file: one clip of its notes on a MIDI track (docs/multitrack-recorder.md, phase 3).
					const midiTrack = midiTrackFor();
					if (!midiTrack) break;
					try {
						const clip = studio.importMidi(
							midiTrack,
							parseMidi(await file.arrayBuffer()),
							at,
							file.name,
						);
						if (!clip) {
							if (studio.notice) notify(studio.notice, { kind: "error" });
							studio.notice = null;
							continue;
						}
						selected = clip.id;
						at = studio.snap(at + clip.duration);
					} catch {
						notify(`${file.name} could not be read as MIDI`, { kind: "error" });
					}
					continue;
				}
				if (!track) break;
				if (file.size > MAX_TAKE_BYTES) {
					notify(`${file.name} is over the ${Math.round(MAX_TAKE_BYTES / 1048576)} MB limit`, {
						kind: "error",
					});
					continue;
				}
				let buffer: AudioBuffer;
				try {
					buffer = await studio.decodeFile(await file.arrayBuffer());
				} catch {
					notify(`${file.name} could not be decoded`, { kind: "error" });
					continue;
				}
				const take = studio.importBuffer(track, buffer, { blob: file, filename: file.name }, at);
				if (!take) {
					if (studio.notice) notify(studio.notice, { kind: "error" });
					studio.notice = null;
					break;
				}
				studio.ontake?.(take);
				selected = studio.arrangement.clips[studio.arrangement.clips.length - 1]?.id ?? null;
				at = studio.snap(at + buffer.duration);
				track = studio.arrangement.tracks.find((t) => t.id === track!.id) ?? null;
			}
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			importing = false;
		}
	}
	let selectedClip = $derived(studio.arrangement.clips.find((c) => c.id === selected) ?? null);
	function splitSelected() {
		if (!selectedClip) return;
		const right = studio.splitClip(selectedClip.id, studio.position);
		if (right) selected = right.id;
		else if (studio.notice) {
			notify(studio.notice, { kind: "error" });
			studio.notice = null;
		}
	}
	function duplicateSelected() {
		if (!selectedClip) return;
		const copy = studio.duplicateClip(selectedClip.id);
		if (copy) selected = copy.id;
	}
	function addTrack(kind: "audio" | "midi" = "audio") {
		const t =
			kind === "midi"
				? studio.addTrack({ source: "piano", channel: "stereo" }, undefined, "midi")
				: studio.addTrack({ source: "mic", channel: "stereo" });
		if (!t && studio.notice) {
			notify(studio.notice, { kind: "error" });
			studio.notice = null;
		}
	}
	/** The MIDI track a file or a take goes to: the selected clip's, else the first, else a new one. */
	function midiTrackFor(): StudioTrack | null {
		const selectedTrack = studio.arrangement.tracks.find(
			(t) => t.id === studio.arrangement.clips.find((c) => c.id === selected)?.trackId,
		);
		return (
			(selectedTrack?.kind === "midi" ? selectedTrack : null) ??
			studio.arrangement.tracks.find((t) => t.kind === "midi") ??
			studio.addTrack({ source: "piano", channel: "stereo" }, undefined, "midi")
		);
	}
	/** The piano-roll editor (docs/multitrack-recorder.md, phase 3b): the MIDI clip whose notes it shows, or null when closed. */
	let rollClipId = $state<string | null>(null);
	let rollClip = $derived(
		rollClipId ? (studio.arrangement.clips.find((c) => c.id === rollClipId) ?? null) : null,
	);
	function openRoll(clip: StudioClip) {
		if (!clip.notes) return;
		selected = clip.id;
		rollClipId = clip.id;
	}
	/** The selected MIDI clip as a .mid file, downloaded. */
	function exportMidi(clip: StudioClip) {
		const blob = studio.midiBlobOf(clip.id);
		if (blob) downloadBlob(blob, `${clip.name || "clip"}.mid`);
	}
	/** A MIDI track rendered to an audio track (the track's menu), so it can bounce and go to a song. */
	async function renderMidiTrack(track: StudioTrack) {
		notify(`Rendering ${track.name} to audio, in real time…`);
		const made = await studio.renderMidiTrack(track.id);
		if (made) notify(`${track.name} rendered to “${made.name}”; the MIDI track is muted`);
		else notify(`${track.name} has no notes to render`, { kind: "error" });
	}
	/** Every MIDI track with notes rendered to audio first, so a bounce hears it (an offline render cannot run the instruments). */
	async function renderMidiTracks() {
		const pending = studio.midiTracksWithClips.filter((t) => !t.muted);
		for (const t of pending) await renderMidiTrack(t);
	}

	// ── Bounces: a WAV, a demo, stems ──────────────────────────────────────
	let bouncing = $state(false);
	async function downloadMix() {
		bouncing = true;
		try {
			await renderMidiTracks();
			const mix = await studio.render();
			downloadBlob(studio.wavOf(mix), `${title || "song"}.wav`);
		} catch (e) {
			notify(`Could not bounce: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			bouncing = false;
		}
	}
	let targetSongId = $state("");
	let firstWithSongs = $derived(data.projects.find((p) => p.songs.length > 0));
	let targetSong = $derived(
		data.projects.flatMap((p) => p.songs).find((s) => s.id === targetSongId) ??
			firstWithSongs?.songs[0] ??
			null,
	);
	async function addAsDemo() {
		if (!targetSong) return;
		bouncing = true;
		try {
			await renderMidiTracks();
			const mix = await studio.render();
			const file = new File([studio.wavOf(mix)], `${title || "song"} (studio).wav`, {
				type: "audio/wav",
			});
			const target = targetSong;
			await uploadDemoFile(file, () =>
				postJson<DemoReservation>("/api/demos", {
					songId: target.id,
					filename: file.name,
					sizeBytes: file.size,
				}),
			);
			notify(`Added to ${target.title} as a demo`);
		} catch (e) {
			notify(`Could not add the demo: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			bouncing = false;
		}
	}
	async function addAsStems() {
		if (!targetSong) return;
		bouncing = true;
		const ctx = new AudioContext();
		try {
			await renderMidiTracks();
			const target = targetSong;
			let n = 0;
			for (const track of studio.arrangement.tracks) {
				// A MIDI track's notes went into its rendered audio track just above.
				if (track.kind === "midi") continue;
				if (!studio.arrangement.clips.some((c) => c.trackId === track.id)) continue;
				const buffer = await studio.render(track.id);
				const file = new File([studio.wavOf(buffer)], `${track.name || "Track"}.wav`, {
					type: "audio/wav",
				});
				await uploadStemFile(
					file,
					() =>
						postJson<Reservation>("/api/stems", {
							songId: target.id,
							filename: file.name,
							sizeBytes: file.size,
						}),
					{ ctx },
				);
				n++;
			}
			notify(`Added ${n} ${n === 1 ? "stem" : "stems"} to ${target.title}`);
		} catch (e) {
			notify(`Could not add the stems: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			void ctx.close();
			bouncing = false;
		}
	}
	/** Sources no clip uses, removed from the song (and the server). */
	async function cleanUpSources() {
		const unused = studio.unusedSources;
		if (!unused.length) {
			notify("Every recording is in use.");
			return;
		}
		if (
			!confirm(
				`Remove ${unused.length} unused ${unused.length === 1 ? "recording" : "recordings"}? Earlier revisions that used them will play without them.`,
			)
		)
			return;
		for (const s of unused) {
			try {
				await deleteStudioSource({ id: s.id });
				studio.forgetSource(s.id);
			} catch (e) {
				notify(errorMessage(e), { kind: "error" });
			}
		}
		await refreshAll();
	}

	// ── Panels and keys ────────────────────────────────────────────────────
	type PanelMode = "docked" | "floating" | "minimised";
	let songsMode = $state<PanelMode>("docked");
	let notesMode = $state<PanelMode>("docked");
	let inputsOpen = $state(false);
	let metroOpen = $state(false);
	// The instruments' panels (docs/multitrack-recorder.md, phase 2): floating from lg, docked below; the space bar goes to the instrument touched last, else the transport.
	let drumsOpen = $state(false);
	let pianoOpen = $state(false);
	let chordsOpen = $state(false);
	let spaceOwner = $state<"drums" | "piano" | "chords" | null>(null);
	function toggleDrums(e?: Event) {
		drumsOpen = !drumsOpen;
		if (drumsOpen) spaceOwner = "drums";
		else if (spaceOwner === "drums")
			spaceOwner = pianoOpen ? "piano" : chordsOpen ? "chords" : null;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function togglePiano(e?: Event) {
		pianoOpen = !pianoOpen;
		if (pianoOpen) spaceOwner = "piano";
		else if (spaceOwner === "piano")
			spaceOwner = chordsOpen ? "chords" : drumsOpen ? "drums" : null;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function toggleChords(e?: Event) {
		chordsOpen = !chordsOpen;
		if (chordsOpen) spaceOwner = "chords";
		else {
			chordPlayer.allOff();
			if (spaceOwner === "chords") spaceOwner = pianoOpen ? "piano" : drumsOpen ? "drums" : null;
		}
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	let deviceFloating = $state(false);
	onMount(() => {
		try {
			songsMode = (localStorage.getItem("stemshovel.studio.songs-mode") as PanelMode) || "docked";
			notesMode = (localStorage.getItem("stemshovel.studio.notes-mode") as PanelMode) || "docked";
			deviceFloating = localStorage.getItem("stemshovel.studio.device-floating") === "1";
		} catch {
			// As above.
		}
	});
	function setMode(which: "songs" | "notes", mode: PanelMode) {
		if (which === "songs") songsMode = mode;
		else notesMode = mode;
		try {
			localStorage.setItem(`stemshovel.studio.${which}-mode`, mode);
		} catch {
			// As above.
		}
	}
	function setDeviceFloating(on: boolean) {
		deviceFloating = on;
		try {
			localStorage.setItem("stemshovel.studio.device-floating", on ? "1" : "0");
		} catch {
			// As above.
		}
	}
	function onkeydown(e: KeyboardEvent) {
		if (isTextEntry(e.target) || e.altKey) return;
		const mod = e.metaKey || e.ctrlKey;
		if (mod && e.key.toLowerCase() === "z") {
			e.preventDefault();
			if (e.shiftKey) studio.redo();
			else studio.undo();
			return;
		}
		if (mod && e.key.toLowerCase() === "d" && selectedClip) {
			e.preventDefault();
			duplicateSelected();
			return;
		}
		if (mod) return;
		if ((e.key === "s" || e.key === "S") && selectedClip) {
			e.preventDefault();
			splitSelected();
			return;
		}
		if (e.code === "Space") {
			// An instrument panel touched last has the space bar (the piano's sustain, the drums' play).
			if (spaceOwner !== null) return;
			if ((e.target as HTMLElement | null)?.closest("button, a, select")) return;
			e.preventDefault();
			if (!e.repeat) studio.toggle();
		} else if (e.key === "r" || e.key === "R") {
			e.preventDefault();
			void record();
		} else if (e.key === "Home") {
			e.preventDefault();
			studio.rewind();
		} else if (e.key === "l" || e.key === "L") {
			studio.toggleLoop();
		}
	}
	const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;
	/** The position as bars and beats on the grid, else as time. */
	let readout = $derived.by(() => {
		const a = studio.arrangement;
		const p = studio.position;
		if (!a.gridOn) return formatTime(p);
		const beat = 60 / a.bpm;
		const beats = Math.floor(p / beat + 1e-6);
		return `${Math.floor(beats / a.beatsPerBar) + 1} | ${(beats % a.beatsPerBar) + 1}`;
	});
	$effect(() => {
		// The session tempo follows the song's (the metronome panel shows and sets it).
		const bpm = metronome.bpm;
		untrack(() => {
			if (bpm !== studio.arrangement.bpm) studio.setBpm(bpm);
		});
	});
</script>

<svelte:head>
	<title>{data.copy.title || "Studio"} | Multitrack Recorder</title>
	<meta
		name="description"
		content="A multitrack recorder in the browser: record tracks from the microphone, a line in or the computer over what you have, arrange clips on a timeline, keep revisions, and bounce the song to a demo or its tracks to stems."
	/>
</svelte:head>

<svelte:window {onkeydown} {onbeforeunload} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="@container" onpointerdowncapture={() => void studio.open()}>
	<main class="page-x-padding main-y-padding max-w-full w-full">
		<PageCopyHeader copy={data.copy}>
			{#snippet controls()}
				<button
					class="button button-sm shrink-0 {songsMode !== 'minimised'
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={songsMode !== "minimised"}
					title="Recordings: your Studio songs and their revisions"
					onclick={() => setMode("songs", songsMode === "minimised" ? "docked" : "minimised")}
				>
					<span class="i-ph-list-bullets" aria-hidden="true"></span>
					Recordings
				</button>
				<button
					class="button button-sm shrink-0 {notesMode !== 'minimised'
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={notesMode !== "minimised"}
					title="Notes"
					onclick={() => setMode("notes", notesMode === "minimised" ? "docked" : "minimised")}
				>
					<span class="i-ph-note-pencil" aria-hidden="true"></span>
					Notes
				</button>
				<button
					class="button button-sm shrink-0 {inputsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={inputsOpen}
					title="Inputs"
					onclick={() => (inputsOpen = !inputsOpen)}
				>
					<span class="i-ph-plugs" aria-hidden="true"></span>
					Inputs
				</button>
				<button
					class="button button-sm shrink-0 {metroOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: metronome.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={metroOpen}
					title={metroOpen ? "Close the metronome" : "Open the metronome"}
					onclick={() => (metroOpen = !metroOpen)}
				>
					<span class="i-ph-metronome" aria-hidden="true"></span>
				</button>
				<button
					class="button button-sm shrink-0 {drumsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: drumMachine.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={drumsOpen}
					aria-label={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
					title={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
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
					aria-label={pianoOpen ? "Put the piano away" : "Piano"}
					title={pianoOpen ? "Put the piano away" : "Open the piano"}
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
					aria-label={chordsOpen ? "Put the chord player away" : "Chord player"}
					title={chordsOpen ? "Put the chord player away" : "Open the chord player"}
					onclick={toggleChords}
				>
					<span class="i-ph-circle-dashed" aria-hidden="true"></span>
				</button>
			{/snippet}
		</PageCopyHeader>

		<!-- The device: transport over the timeline, in a docked panel with a pop-out from lg as the looper. -->
		<FloatingPanel
			open={true}
			floating={deviceFloating}
			closable={false}
			title="Studio"
			storageKey="stemshovel.studio.device-panel"
			width={1100}
			height={720}
			onminimise={() => setDeviceFloating(false)}
		>
			{#snippet controls()}
				<span class="text-12px opacity-70 tabular-nums">
					{#if saving}saving…{:else if studio.dirty}unsaved{:else if songId}saved{/if}
					{#if uploading}· uploading {uploading}{/if}
				</span>
				<button
					class="button button-xs hidden lg-inline-flex"
					type="button"
					title={deviceFloating
						? "Put the studio back in the page"
						: "Pop the studio out into a panel"}
					aria-label={deviceFloating ? "Dock the studio" : "Pop out the studio"}
					onclick={() => setDeviceFloating(!deviceFloating)}
				>
					<span
						class={deviceFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
						aria-hidden="true"
					></span>
				</button>
			{/snippet}
			<section
				class="device-chrome grid gap-3 px-3 py-4 pb-6 @xl-px-5 @xl-pt-5 w-full max-w-full relative"
				aria-label="Studio"
			>
				<!-- the song's title -->
				<div class="flex flex-wrap items-center gap-2">
					<label class="block grow device-window-bevel-md min-w-200px">
						<span class="sr-only">Song title</span>
						<input
							class="device-field w-full"
							type="text"
							maxlength="120"
							autocomplete="off"
							data-1p-ignore
							data-lpignore="true"
							data-bwignore
							placeholder={defaultTitle()}
							value={title}
							onchange={(e) => void titleChanged(e.currentTarget.value)}
							onkeydown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur();
							}}
						/>
					</label>
					<button class="device-button-sm px-3" type="button" onclick={() => void newSong()}>
						<span class="i-ph-plus" aria-hidden="true"></span> New song
					</button>
					<ContextMenu
						ariaLabel="Song actions"
						buttonBaseClasses="device-button-sm px-3"
						position="bottom right"
						popoverClasses="min-w-72 max-w-sm !max-h-[calc(100vh-2rem)] overflow-y-auto whitespace-nowrap [&_li>button]-(whitespace-nowrap)"
						items={[
							{
								id: "rev",
								kind: "button",
								label: "Save revision…",
								iconClass: "i-ph-bookmark-simple",
								disabled: !studio.arrangement.tracks.length,
								action: saveRevision,
							},
							{ id: "d1", kind: "divider" },
							{
								id: "wav",
								kind: "button",
								label: "Download mix (WAV)",
								iconClass: "i-ph-download-simple",
								disabled: bouncing || !studio.arrangement.clips.length,
								action: downloadMix,
							},
							{
								id: "demo",
								kind: "snippet",
								snippet: sendBlock,
							},
							{ id: "d2", kind: "divider" },
							{
								id: "clean",
								kind: "button",
								label: "Clean up unused recordings",
								iconClass: "i-ph-broom",
								action: cleanUpSources,
							},
							{
								id: "del",
								kind: "button",
								label: "Delete song",
								iconClass: "i-ph-trash",
								condition: !!song,
								action: () => song && removeSong(song),
							},
						]}
					/>
				</div>

				<!-- the screen -->
				<div
					class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-3"
				>
					<div class="min-w-0 grow">
						<div class="text-28px @xl-text-36px leading-none tabular-nums" aria-live="off">
							{readout}
							<span class="text-14px opacity-60 ml-2">{formatTime(studio.position)}</span>
						</div>
						<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2 tabular-nums">
							<span
								>{studio.arrangement.bpm} bpm · {studio.arrangement.beatsPerBar}/4 · {studio
									.arrangement.tracks.length}
								{studio.arrangement.tracks.length === 1 ? "track" : "tracks"} · {studio.arrangement
									.clips.length}
								{studio.arrangement.clips.length === 1 ? "clip" : "clips"} · {formatTime(
									studio.duration,
									0,
								)}</span
							>
							{#if studio.phase === "counting"}
								<span class="text-accent" role="status">· count-in</span>
							{:else if studio.phase === "recording"}
								<span class="text-red-300" role="status"
									>· ● recording {studio.armedTracks.length}
									{studio.armedTracks.length === 1 ? "track" : "tracks"}</span
								>
							{:else if studio.phase === "playing"}
								<span>· playing</span>
							{/if}
							{#if studio.decoding}
								<span>· loading {studio.decoding}…</span>
							{/if}
							{#if studio.memoryBytes > 0}
								<span class={studio.memoryBytes > STUDIO_MEMORY_WARNING_BYTES ? "text-red-300" : ""}
									>· {mb(studio.memoryBytes)} in memory</span
								>
							{/if}
							{#each failed as f (f.sourceId)}
								<span class="text-red-300"
									>· {f.trackLabel} not saved: {f.error}
									<button class="underline" type="button" onclick={() => queue.retry(f.sourceId)}
										>retry</button
									>
									·
									<button
										class="underline"
										type="button"
										title="Give up on this take (its clip stays, without audio after a reload)"
										onclick={() => void queue.discard(f.sourceId)}>discard</button
									></span
								>
							{/each}
						</div>
					</div>
					<div class="flex items-center gap-2 text-12px opacity-80">
						<span>Master</span>
						<input
							type="range"
							class="w-28 accent-blue-300"
							min="0"
							max="1"
							step="0.01"
							value={studio.arrangement.master}
							aria-label="Master level"
							oninput={(e) => studio.setMaster(e.currentTarget.valueAsNumber)}
						/>
						<span
							class="block h-1.5 w-16 rounded bg-blue-100/10 overflow-hidden"
							role="meter"
							aria-label="Master level meter"
							aria-valuemin="0"
							aria-valuemax="100"
							aria-valuenow={Math.round(studio.masterLevel * 100)}
						>
							<span
								class="block h-full rounded {studio.masterLevel > 0.85
									? 'bg-red-500'
									: 'bg-blue-300'}"
								style:width="{studio.masterLevel * 100}%"
							></span>
						</span>
					</div>
				</div>

				<!-- the transport and the settings -->
				<div class="flex flex-wrap items-center gap-2" role="group" aria-label="Transport">
					<button
						class="device-button-sm px-3 min-w-32px {studio.recording
							? 'text-red-400'
							: 'text-red-300'}"
						type="button"
						title="Record (R)"
						aria-label={studio.recording ? "Stop recording" : "Record"}
						aria-pressed={studio.recording}
						onclick={() => void record()}
					>
						<span class="i-ph-record-fill" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm px-3 min-w-32px"
						type="button"
						title={studio.running ? "Stop (Space)" : "Play (Space)"}
						aria-label={studio.running ? "Stop" : "Play"}
						onclick={() => studio.toggle()}
					>
						<span class={studio.running ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"
						></span>
					</button>
					<button
						class="device-button-sm px-3 min-w-32px"
						type="button"
						title="Pause where it is"
						aria-label="Pause"
						disabled={!studio.running}
						onclick={() => studio.pause()}
					>
						<span class="i-ph-pause-fill" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm px-3 min-w-32px"
						type="button"
						title="To the start (Home)"
						aria-label="To the start"
						onclick={() => studio.rewind()}
					>
						<span class="i-ph-skip-back-fill" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm px-3 min-w-32px {studio.arrangement.loop?.on
							? 'text-accent'
							: ''}"
						type="button"
						title="Loop the region on the ruler (L)"
						aria-label="Loop"
						aria-pressed={studio.arrangement.loop?.on ?? false}
						onclick={() => studio.toggleLoop()}
					>
						<span class="i-ph-repeat" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm px-3 min-w-32px {studio.arrangement.punch ? 'text-accent' : ''}"
						type="button"
						title="Punch: a take keeps only what falls in the loop region"
						aria-label="Punch"
						aria-pressed={studio.arrangement.punch ?? false}
						disabled={!studio.arrangement.loop}
						onclick={() => studio.setPunch(!studio.arrangement.punch)}
					>
						<span class="i-ph-selection" aria-hidden="true"></span>
					</button>
					<span class="w-2"></span>
					<button
						class="device-button-sm px-3"
						type="button"
						title="Undo (⌘Z)"
						disabled={!studio.canUndo}
						onclick={() => studio.undo()}
					>
						<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm px-3"
						type="button"
						title="Redo (⌘⇧Z)"
						disabled={!studio.canRedo}
						onclick={() => studio.redo()}
					>
						<span class="i-ph-arrow-clockwise" aria-hidden="true"></span>
					</button>
					<span class="w-2"></span>
					<!-- A split button, as the chord player's: the tempo switches the click; the caret opens the Timing menu (Kevin). -->
					<div class="flex gap-px" role="group" aria-label="Timing">
						<button
							class="device-button-sm px-3 rounded-r-none tabular-nums {studio.arrangement.click
								? 'text-accent'
								: ''}"
							type="button"
							aria-pressed={studio.arrangement.click}
							title={studio.arrangement.click
								? "Silence the click while the song plays"
								: "A click while the song plays, at this tempo"}
							aria-label="Click at {studio.arrangement.bpm} bpm"
							onclick={() => studio.setClick(!studio.arrangement.click)}
						>
							<span class="i-ph-metronome" aria-hidden="true"></span>
							{studio.arrangement.bpm}
						</button>
						<ContextMenu
							ariaLabel="Timing"
							title="Tempo, beats to the bar, count-in and the click"
							iconClass="i-ph-caret-down"
							position="bottom left"
							buttonBaseClasses="device-button-sm px-2 !min-w-0 rounded-l-none"
							popoverClasses="min-w-72 max-w-sm !max-h-[calc(100vh-2rem)] overflow-y-auto"
							items={[
								{ id: "timing-heading", kind: "heading", label: "Timing" },
								{ id: "timing", kind: "snippet", snippet: timingBlock },
							]}
						/>
					</div>
					<label class="device-button-sm px-3 flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={studio.arrangement.gridOn}
							onchange={(e) => studio.setGridOn(e.currentTarget.checked)}
						/>
						Grid
					</label>
					<span class="ml-auto flex items-center gap-1">
						<button
							class="device-button-sm px-3"
							type="button"
							title="Zoom out"
							aria-label="Zoom out"
							onclick={() => (pxPerSecond = Math.max(4, pxPerSecond / 1.5))}
						>
							<span class="i-ph-magnifying-glass-minus" aria-hidden="true"></span>
						</button>
						<button
							class="device-button-sm px-3"
							type="button"
							title="Zoom in"
							aria-label="Zoom in"
							onclick={() => (pxPerSecond = Math.min(400, pxPerSecond * 1.5))}
						>
							<span class="i-ph-magnifying-glass-plus" aria-hidden="true"></span>
						</button>
					</span>
				</div>

				<!-- the timeline -->
				<StudioTimeline
					bind:selected
					bind:pxPerSecond
					onarm={(t) => void armInput(t)}
					onrender={(t) => void renderMidiTrack(t)}
					onopen={openRoll}
				/>
				<div class="flex flex-wrap items-center gap-2">
					<button class="device-button-sm px-3" type="button" onclick={() => addTrack()}>
						<span class="i-ph-plus" aria-hidden="true"></span> Add track
					</button>
					<button
						class="device-button-sm px-3"
						type="button"
						title="A track of notes, played and recorded through the piano, the chord player or the drum machine"
						onclick={() => addTrack("midi")}
					>
						<span class="i-ph-piano-keys" aria-hidden="true"></span> Add MIDI track
					</button>
					<label class="device-button-sm px-3 cursor-pointer {importing ? 'opacity-60' : ''}">
						<span class="i-ph-file-audio" aria-hidden="true"></span>
						{importing ? "Importing…" : "Import audio or MIDI…"}
						<input
							type="file"
							class="sr-only"
							accept="{DEMO_ACCEPT},.mid,.midi"
							multiple
							disabled={importing}
							onchange={(e) => {
								// Copied first: clearing the input empties its live FileList.
								const files = Array.from(e.currentTarget.files ?? []);
								e.currentTarget.value = "";
								void importFiles(files);
							}}
						/>
					</label>
					<span class="text-12px text-dark/80 ml-auto hidden @2xl-inline">
						Space play · R record · Home start · L loop · S split · ⌘D duplicate · ⌘-wheel zooms
					</span>
				</div>
				{#if selectedClip}
					{@const clip = selectedClip}
					<!-- The selected clip's own controls (docs/multitrack-recorder.md, phase 1b). -->
					<div
						class="device-screen flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-12px"
						role="group"
						aria-label="Clip"
					>
						<input
							class="device-field min-w-0 w-48 text-13px"
							type="text"
							maxlength="60"
							value={clip.name}
							aria-label="Clip name"
							onchange={(e) => studio.renameClip(clip.id, e.currentTarget.value)}
							onkeydown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur();
							}}
						/>
						<label class="flex items-center gap-2">
							{clip.notes ? "Velocity" : "Gain"}
							<input
								type="range"
								class="w-24 accent-blue-300"
								min="0"
								max={clip.notes ? 1 : 2}
								step="0.01"
								value={clip.gain}
								aria-label={clip.notes ? "Clip velocity" : "Clip gain"}
								onchange={(e) => studio.setClipGain(clip.id, e.currentTarget.valueAsNumber)}
								ondblclick={() => studio.setClipGain(clip.id, 1)}
							/>
							<span class="tabular-nums w-10"
								>{clip.notes
									? `${Math.round(clip.gain * 100)}%`
									: `${Math.round(20 * Math.log10(clip.gain || 0.001))} dB`}</span
							>
						</label>
						{#if clip.notes}
							<!-- A MIDI clip (docs/multitrack-recorder.md, phase 3): its notes onto the grid, up or down, or out as a file. -->
							<span class="flex items-center gap-1" role="group" aria-label="Quantize">
								Quantize
								<button
									class="device-button-xs px-2"
									type="button"
									title="Every note's start to the nearest beat"
									onclick={() => studio.quantizeClip(clip.id, 1)}>Beat</button
								>
								<button
									class="device-button-xs px-2"
									type="button"
									title="To the nearest half beat"
									onclick={() => studio.quantizeClip(clip.id, 2)}>½</button
								>
								<button
									class="device-button-xs px-2"
									type="button"
									title="To the nearest quarter beat (a sixteenth in 4/4)"
									onclick={() => studio.quantizeClip(clip.id, 4)}>¼</button
								>
							</span>
							<span class="flex items-center gap-1" role="group" aria-label="Transpose">
								Transpose
								<button
									class="device-button-xs px-2"
									type="button"
									title="Down an octave"
									aria-label="Down an octave"
									onclick={() => studio.transposeClip(clip.id, -12)}>−12</button
								>
								<button
									class="device-button-xs px-2"
									type="button"
									title="Down a semitone"
									aria-label="Down a semitone"
									onclick={() => studio.transposeClip(clip.id, -1)}>−1</button
								>
								<button
									class="device-button-xs px-2"
									type="button"
									title="Up a semitone"
									aria-label="Up a semitone"
									onclick={() => studio.transposeClip(clip.id, 1)}>+1</button
								>
								<button
									class="device-button-xs px-2"
									type="button"
									title="Up an octave"
									aria-label="Up an octave"
									onclick={() => studio.transposeClip(clip.id, 12)}>+12</button
								>
							</span>
							<button
								class="device-button-xs px-2"
								type="button"
								title="Open the notes in the piano-roll editor (or double-click the clip)"
								aria-pressed={rollClipId === clip.id}
								onclick={() => (rollClipId === clip.id ? (rollClipId = null) : openRoll(clip))}
							>
								<span class="i-ph-piano-keys" aria-hidden="true"></span> Edit notes
							</button>
							<button
								class="device-button-xs px-2"
								type="button"
								title="Download the clip's notes as a MIDI file at the song's tempo"
								onclick={() => exportMidi(clip)}
							>
								<span class="i-ph-download-simple" aria-hidden="true"></span> Export MIDI
							</button>
						{:else}
							<label class="flex items-center gap-2">
								Fade in
								<input
									type="number"
									class="device-field w-16 text-12px py-0"
									min="0"
									max={Math.floor((clip.duration / 2) * 100) / 100}
									step="0.05"
									value={clip.fadeIn}
									aria-label="Fade in, seconds"
									onchange={(e) =>
										studio.setClipFades(clip.id, { fadeIn: e.currentTarget.valueAsNumber || 0 })}
								/>
								s
							</label>
							<label class="flex items-center gap-2">
								Fade out
								<input
									type="number"
									class="device-field w-16 text-12px py-0"
									min="0"
									max={Math.floor((clip.duration / 2) * 100) / 100}
									step="0.05"
									value={clip.fadeOut}
									aria-label="Fade out, seconds"
									onchange={(e) =>
										studio.setClipFades(clip.id, { fadeOut: e.currentTarget.valueAsNumber || 0 })}
								/>
								s
							</label>
						{/if}
						<span class="flex items-center gap-1">
							<button
								class="device-button-xs px-2"
								type="button"
								title="Split at the playhead (S)"
								disabled={studio.position <= clip.start ||
									studio.position >= clip.start + clip.duration}
								onclick={splitSelected}
							>
								<span class="i-ph-scissors" aria-hidden="true"></span> Split
							</button>
							<button
								class="device-button-xs px-2"
								type="button"
								title="Duplicate after itself (⌘D)"
								onclick={duplicateSelected}
							>
								<span class="i-ph-copy" aria-hidden="true"></span> Duplicate
							</button>
							<button
								class="device-button-xs px-2"
								type="button"
								title="Remove (Delete)"
								onclick={() => {
									studio.deleteClip(clip.id);
									selected = null;
								}}
							>
								<span class="i-ph-trash" aria-hidden="true"></span> Remove
							</button>
						</span>
						{#if clip.alternates?.length}
							<span class="flex items-center gap-1 ml-auto">
								<button
									class="device-button-xs px-2"
									type="button"
									title="The previous take"
									aria-label="Previous take"
									onclick={() => studio.cycleTake(clip.id, -1)}
								>
									<span class="i-ph-caret-left" aria-hidden="true"></span>
								</button>
								<span class="tabular-nums">{studio.takesOf(clip.id)} takes</span>
								<button
									class="device-button-xs px-2"
									type="button"
									title="The next take"
									aria-label="Next take"
									onclick={() => studio.cycleTake(clip.id, 1)}
								>
									<span class="i-ph-caret-right" aria-hidden="true"></span>
								</button>
							</span>
						{/if}
					</div>
				{/if}
			</section>
		</FloatingPanel>

		<!-- The songs and the notes, side by side from xl; each docks, floats or minimises. -->
		<div class="mt-6 grid grid-cols-1 xl-grid-cols-2 gap-6 items-start">
			<!-- The Recordings panel (Kevin: "Songs" read as the project songs): the user's Studio songs and their revisions. -->
			<section aria-label="Recordings" class={songsMode === "minimised" ? "hidden" : ""}>
				<FloatingPanel
					open={songsMode !== "minimised"}
					floating={songsMode === "floating"}
					title="Recordings"
					storageKey="stemshovel.studio.songs-panel"
					width={520}
					height={560}
					onminimise={() => setMode("songs", "minimised")}
				>
					{#snippet controls()}
						<button
							class="button button-xs hidden lg-inline-flex"
							type="button"
							title={songsMode === "floating" ? "Dock the recordings" : "Pop out the recordings"}
							onclick={() => setMode("songs", songsMode === "floating" ? "docked" : "floating")}
						>
							<span
								class={songsMode === "floating"
									? "i-ph-arrows-in-simple"
									: "i-ph-arrows-out-simple"}
								aria-hidden="true"
							></span>
						</button>
					{/snippet}
					{#if data.songs.length === 0}
						<p class="text-dim text-14px">No songs yet. Add a track, arm it and press Record.</p>
					{:else}
						<ul class="grid gap-1">
							{#each data.songs as s (s.id)}
								<li
									class="rounded-md border {s.id === songId
										? 'border-accent/60 bg-accent/5'
										: 'border-white/10'}"
								>
									<details open={s.id === songId}>
										<summary class="flex items-center gap-2 px-3 py-2 cursor-pointer list-none">
											<span class="i-ph-caret-right text-12px opacity-60" aria-hidden="true"></span>
											<button
												class="grow text-left font-500 truncate hover-text-accent"
												type="button"
												onclick={(e) => {
													e.preventDefault();
													if (studio.running) studio.stop();
													void autosaveNow().then(() => openSong(s));
												}}>{s.title}</button
											>
											<span class="text-11px opacity-60 tabular-nums shrink-0"
												>{s.sources.length}
												{s.sources.length === 1 ? "take" : "takes"} · {s.revisions.filter(
													(r) => r.name,
												).length} saved</span
											>
											<ContextMenu
												ariaLabel="{s.title} actions"
												buttonBaseClasses="button button-xs opacity-70 hover-opacity-100 px-1"
												position="bottom right"
												items={[
													{
														id: "open",
														kind: "button",
														label: "Open",
														iconClass: "i-ph-folder-open",
														action: () => void autosaveNow().then(() => openSong(s)),
													},
													{
														id: "del",
														kind: "button",
														label: "Delete song",
														iconClass: "i-ph-trash",
														action: () => removeSong(s),
													},
												]}
											/>
										</summary>
										<ul class="px-3 pb-2 grid gap-1 text-13px">
											{#each s.revisions as rev (rev.id)}
												<li class="flex items-center gap-2">
													<span class={rev.name ? "" : "opacity-60"}
														>{rev.name ?? `Autosave ${rev.number}`}</span
													>
													<span class="text-11px opacity-50 tabular-nums"
														>{new Date(rev.createdAt).toLocaleString(undefined, {
															month: "short",
															day: "numeric",
															hour: "2-digit",
															minute: "2-digit",
														})}</span
													>
													<span class="ml-auto flex gap-1">
														<button
															class="button button-xs"
															type="button"
															title="Restore this revision"
															onclick={() => void restoreRevision(rev)}>Restore</button
														>
														{#if rev.name}
															<ContextMenu
																ariaLabel="Revision actions"
																buttonBaseClasses="button button-xs px-1"
																position="bottom right"
																items={[
																	{
																		id: "rn",
																		kind: "button",
																		label: "Rename…",
																		iconClass: "i-ph-pencil-simple",
																		action: () => renameRevision(rev),
																	},
																	{
																		id: "rm",
																		kind: "button",
																		label: "Delete revision",
																		iconClass: "i-ph-trash",
																		action: () => removeRevision(rev),
																	},
																]}
															/>
														{/if}
													</span>
												</li>
											{:else}
												<li class="opacity-60">Nothing saved yet.</li>
											{/each}
										</ul>
									</details>
								</li>
							{/each}
						</ul>
					{/if}
				</FloatingPanel>
			</section>

			<section aria-label="Notes" class={notesMode === "minimised" ? "hidden" : ""}>
				<FloatingPanel
					open={notesMode !== "minimised"}
					floating={notesMode === "floating"}
					title={`Notes for “${title || "this song"}”`}
					storageKey="stemshovel.studio.notes-panel"
					width={560}
					height={620}
					onminimise={() => setMode("notes", "minimised")}
				>
					{#snippet controls()}
						<button
							class="button button-xs hidden lg-inline-flex"
							type="button"
							title={notesMode === "floating" ? "Dock the notes" : "Pop out the notes"}
							onclick={() => setMode("notes", notesMode === "floating" ? "docked" : "floating")}
						>
							<span
								class={notesMode === "floating"
									? "i-ph-arrows-in-simple"
									: "i-ph-arrows-out-simple"}
								aria-hidden="true"
							></span>
						</button>
					{/snippet}
					{#key `${songId ?? "new"}/${notesKey}`}
						<IdeaNotesPanel
							idea={{ id: songId, notes, title: title || "this song" }}
							ensureIdea={ensureSong}
							onchange={(m) => (notes = m)}
							onsaved={async ({ ideaDeleted }) => {
								if (ideaDeleted) {
									loadedKey = "";
									songId = null;
								}
								await refreshAll();
							}}
						/>
					{/key}
				</FloatingPanel>
			</section>
		</div>

		<PageCopySection
			html={data.copy.bodyHtml}
			docsHref="/docs/studio"
			docsLabel="Studio docs"
			docsLead="Learn more about using the Studio in the user docs."
		/>
	</main>

	{#snippet timingBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			<div class="flex items-end gap-3">
				<label class="block grow">
					<span class="device-button-label">Tempo · {studio.arrangement.bpm} bpm</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="30"
						max="300"
						step="1"
						value={studio.arrangement.bpm}
						aria-label="Tempo in beats per minute"
						onchange={(e) => studio.setBpm(Number(e.currentTarget.value))}
					/>
				</label>
				<button
					class="device-button-xs px-3 mb-1"
					type="button"
					aria-label="Tap the tempo"
					title="Tap the tempo"
					onclick={() => metronome.tap()}>Tap</button
				>
			</div>
			<label class="block">
				<span class="device-button-label">Beats per bar</span>
				<select
					class="device-field w-full"
					value={studio.arrangement.beatsPerBar}
					aria-label="Beats per bar"
					onchange={(e) => studio.setBeatsPerBar(Number(e.currentTarget.value))}
				>
					{#each [2, 3, 4, 5, 6, 7] as n (n)}<option value={n}>{n}</option>{/each}
				</select>
			</label>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={studio.arrangement.click}
					onchange={(e) => studio.setClick(e.currentTarget.checked)}
				/>
				Click while the song plays
			</label>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={studio.arrangement.countIn}
					onchange={(e) => studio.setCountIn(e.currentTarget.checked)}
				/>
				Count in a bar before recording
			</label>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={studio.playArmed}
					onchange={(e) => (studio.playArmed = e.currentTarget.checked)}
				/>
				Hear an armed track's clips while recording over them
			</label>
			<p class="text-12px opacity-70">
				Output latency {studio.outputLatencyMs} ms · input shift {Math.round(
					inputSources.latencyMs,
				)} ms (Calibrate in the Inputs panel).
			</p>
		</div>
	{/snippet}

	{#snippet sendBlock()}
		<div class="px-3 py-2 grid gap-2 text-13px">
			<label class="block">
				<span class="block mb-1 opacity-80">Send to a song</span>
				<select
					class="field w-full"
					value={targetSong?.id ?? ""}
					aria-label="Song"
					onchange={(e) => (targetSongId = e.currentTarget.value)}
				>
					{#each data.projects as p (p.id)}
						{#if p.songs.length}
							<optgroup label={p.name}>
								{#each p.songs as s (s.id)}<option value={s.id}>{s.title}</option>{/each}
							</optgroup>
						{/if}
					{/each}
				</select>
			</label>
			<div class="grid gap-2">
				<button
					class="button button-xs justify-start"
					type="button"
					disabled={bouncing || !targetSong || !studio.arrangement.clips.length}
					onclick={() => void addAsDemo()}
				>
					<span class="i-ph-waveform" aria-hidden="true"></span> Add mix as demo
				</button>
				<button
					class="button button-xs justify-start"
					type="button"
					disabled={bouncing || !targetSong || !studio.arrangement.clips.length}
					onclick={() => void addAsStems()}
				>
					<span class="i-ph-stack" aria-hidden="true"></span> Add tracks as stems
				</button>
			</div>
		</div>
	{/snippet}

	<!-- The piano-roll editor: a MIDI clip's notes, floating from lg, docked below (docs/multitrack-recorder.md, phase 3b). -->
	<FloatingPanel
		open={rollClip !== null}
		title="Notes · {rollClip?.name ?? ''}"
		storageKey="stemshovel.studio.roll-panel"
		width={820}
		height={460}
		onminimise={() => (rollClipId = null)}
	>
		{#if rollClip}
			{#key rollClip.id}
				<PianoRoll clipId={rollClip.id} />
			{/key}
		{/if}
	</FloatingPanel>

	<FloatingPanel
		open={inputsOpen}
		title="Inputs"
		storageKey="stemshovel.studio.inputs-panel"
		width={560}
		height={560}
		onminimise={() => (inputsOpen = false)}
	>
		<div class="grid gap-4 @2xl-grid-cols-3">
			{#each ["mic", "line", "computer"] as const as source (source)}
				<section class="rounded-md border border-white/10 p-2" aria-label="{source} settings">
					<div class="flex items-center justify-between gap-2 mb-2">
						<span class="font-600 text-13px capitalize"
							>{source === "mic" ? "Microphone" : source === "line" ? "Line in" : "Computer"}</span
						>
						<button
							class="button button-xs"
							type="button"
							onclick={() =>
								void (inputSources.has(source)
									? inputSources.stop(source)
									: studio.requestInput(source))}
						>
							{inputSources.has(source) ? "Close" : "Open"}
						</button>
					</div>
					<span
						class="block h-1 w-full rounded bg-blue-100/10 overflow-hidden mb-2"
						aria-hidden="true"
					>
						<span
							class="block h-full rounded {inputSources.levels[source] > 0.85
								? 'bg-red-500'
								: 'bg-blue-300'}"
							style:width="{inputSources.levels[source] * 100}%"
						></span>
					</span>
					<InputSourceSettings {source} calibrateDisabled={studio.running} />
				</section>
			{/each}
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={metroOpen}
		title="Metronome"
		storageKey="stemshovel.studio.metronome-panel"
		width={640}
		height={520}
		onminimise={() => (metroOpen = false)}
	>
		<Metronome />
	</FloatingPanel>
	<!-- The instruments' panels, as on the looper page: hosted in the Studio's context, they play into an armed track. -->
	<FloatingPanel
		open={drumsOpen}
		title="Drum machine"
		storageKey="stemshovel.studio.drum-panel"
		onminimise={() => toggleDrums()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onpointerdowncapture={() => (spaceOwner = "drums")}>
			<DrumMachine
				kits={data.kits}
				keyboard={spaceOwner === "drums"}
				account={data.account}
				beats={data.beats}
				textToBeat={data.textToBeat}
			/>
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={pianoOpen}
		title="Piano"
		storageKey="stemshovel.studio.piano-panel"
		width={980}
		onminimise={() => togglePiano()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onpointerdowncapture={() => (spaceOwner = "piano")}>
			<Piano
				warm
				samplesBase={data.pianoSamplesBase}
				keyboard={spaceOwner === "piano"}
				sitePresets={data.sitePresets}
				account={data.account}
				presets={data.pianoPresets}
				presetAdmin={data.presetAdmin}
			/>
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={chordsOpen}
		title="Chord player"
		storageKey="stemshovel.studio.chords-panel"
		width={760}
		height={720}
		onminimise={() => toggleChords()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onpointerdowncapture={() => (spaceOwner = "chords")}>
			<ChordPlayer
				samplesBase={data.pianoSamplesBase}
				keyboard={spaceOwner === "chords"}
				sitePresets={data.chordPresets}
				account={data.account}
				presets={data.pianoPresets}
				presetAdmin={data.presetAdmin}
				chordStyles={data.chordStyles}
				pad={false}
			/>
		</div>
	</FloatingPanel>
</div>
