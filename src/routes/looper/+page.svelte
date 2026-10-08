<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import DrumMachine from "#lib/components/DrumMachine.svelte";
	import ChordPlayer from "#lib/components/ChordPlayer.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import { chordPlayer } from "#lib/audio/chordPlayer.svelte.js";
	import IconDrumKit from "#lib/components/IconDrumKit.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import PageCopySection from "#lib/components/PageCopySection.svelte";
	import Metronome from "#lib/components/Metronome.svelte";
	import Piano from "#lib/components/Piano.svelte";
	import InputSourceSettings from "#lib/components/InputSourceSettings.svelte";
	import SourceButton from "#lib/components/SourceButton.svelte";
	import { drumMachine } from "#lib/audio/drumMachine.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { chordPiano, piano } from "#lib/audio/piano.svelte.js";
	import { inputSources, type ChannelMode, type InputSource } from "#lib/audio/inputs.svelte.js";
	import {
		LOOP_BARS,
		LOOP_SOURCES,
		LEAD_SECONDS,
		LOOP_SOURCE_LABELS,
		MAX_LOOP_LAYERS,
		looper,
		type LoopBars,
		type LoopSource,
	} from "#lib/audio/looper.svelte.js";
	import { TakeQueue } from "#lib/audio/takeQueue.svelte.js";
	import IdeaNotesPanel from "#lib/components/IdeaNotesPanel.svelte";
	import {
		createIdea,
		renameIdea,
		saveIdeaInstruments,
		setIdeaKind,
	} from "#lib/remote/ideas.remote.js";
	import { deleteTake } from "#lib/remote/recordings.remote.js";
	import { loopSources } from "#lib/remote/looper.remote.js";
	import { refreshAll } from "$app/navigation";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import type { Attachment } from "svelte/attachments";
	import { onMount } from "svelte";

	/**
	 * The looper (docs/looper.md): a loop of bars at a tempo plays round and
	 * round while layers are recorded onto it from the microphone, the piano
	 * or the drum machine; the layers' mix and the layers go to the Idea
	 * Recorder as a take with sources. The instruments live in panels as on
	 * the recorder page; the engine hosts them in one audio context.
	 */
	let { data } = $props();
	// The dev server only: the engine on the window, so a Playwright script can measure a layer's timing (docs/looper.md, "Verified").
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, {
			__looper: looper,
			__inputs: inputSources,
			__piano: piano,
			__chordPiano: chordPiano,
			__drums: drumMachine,
			__chords: chordPlayer,
			__metronome: metronome,
		});

	// The looper itself and its notes pop out into panels from lg, as the recorder's device and notes do (Kevin); remembered per browser.
	let looperFloating = $state(false);
	let notesFloating = $state(false);
	const LOOPER_FLOATING_KEY = "stemshovel.looper.device-floating";
	const NOTES_FLOATING_KEY = "stemshovel.looper.notes-floating";
	function setLooperFloating(on: boolean) {
		looperFloating = on;
		try {
			localStorage.setItem(LOOPER_FLOATING_KEY, on ? "1" : "0");
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
	onMount(() => {
		try {
			looperFloating = localStorage.getItem(LOOPER_FLOATING_KEY) === "1";
			notesFloating = localStorage.getItem(NOTES_FLOATING_KEY) === "1";
		} catch {
			// As above.
		}
	});
	// The panels, as on the recorder page: floating from lg, docked below; the space bar follows the instrument touched last, else the looper's transport.
	let drumsOpen = $state(false);
	let pianoOpen = $state(false);
	let metroOpen = $state(false);
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
	/** The chord player (docs/chord-player.md, phase 3): the piano engine on the circle, its own panel and source. */
	function toggleChords(e?: Event) {
		chordsOpen = !chordsOpen;
		if (chordsOpen) spaceOwner = "chords";
		else {
			chordPlayer.allOff();
			if (spaceOwner === "chords") spaceOwner = pianoOpen ? "piano" : drumsOpen ? "drums" : null;
		}
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function toggleMetronome(e?: Event) {
		metroOpen = !metroOpen;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.code !== "Space" || spaceOwner !== null || e.repeat) return;
		if (
			(e.target as HTMLElement | null)?.closest(
				"input, textarea, select, button, a, [contenteditable]",
			)
		)
			return;
		e.preventDefault();
		looper.toggle();
	}

	// Tempo synced both ways (Kevin): the session tempo (the metronome's, which the drums and the chord player follow and
	// set from their own controls) becomes the loop's while the loop has no layers; with layers the loop's tempo is fixed
	// and the session is held to it. An effect because the engines are state outside this component.
	$effect(() => {
		const theirs = metronome.bpm;
		if (theirs === looper.bpm) return;
		if (looper.locked) looper.syncTempo();
		else looper.setBpm(theirs);
	});

	/** Arm a source; the microphone asks for permission on its first turn, and an instrument's panel opens if it is not out (Kevin). */
	/** The armed source's last error, for the screen (the instruments have none). */
	const armedError = $derived(
		looper.armed === "piano" || looper.armed === "chords" || looper.armed === "drums"
			? null
			: inputSources.errors[looper.armed],
	);
	/** A source button's title: the open device's label for an outside source, else its name. */
	function sourceLabel(source: LoopSource) {
		const open =
			source === "piano" || source === "chords" || source === "drums"
				? null
				: inputSources.labels[source];
		return open ?? LOOP_SOURCE_LABELS[source];
	}
	async function arm(source: LoopSource) {
		looper.setArmed(source);
		if (source === "mic" && !inputSources.has("mic")) await looper.requestMic();
		if (source === "line" && !inputSources.has("line")) await looper.requestInput("line");
		if (source === "computer" && !inputSources.has("computer")) await looper.requestComputer();
		if (source === "piano" && !pianoOpen) togglePiano();
		if (source === "chords" && !chordsOpen) toggleChords();
		if (source === "drums" && !drumsOpen) toggleDrums();
	}
	function clearLoop() {
		if (looper.layers.length && !confirm("Clear every layer of this loop?")) return;
		looper.clear();
	}

	/** A layer's waveform on a canvas, redrawn with its size (an attachment, re-run when the peaks change). */
	function wave(peaks: Float32Array): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const draw = () => {
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				if (!w || !h) return;
				canvas.width = w * devicePixelRatio;
				canvas.height = h * devicePixelRatio;
				const g = canvas.getContext("2d");
				if (!g) return;
				g.scale(devicePixelRatio, devicePixelRatio);
				g.clearRect(0, 0, w, h);
				g.fillStyle = "rgba(191, 219, 254, 0.9)";
				const n = peaks.length;
				for (let i = 0; i < n; i++) {
					const p = Math.min(1, peaks[i] * 1.2);
					const x = (i / n) * w;
					g.fillRect(x, (h * (1 - p)) / 2, Math.max(1, w / n - 0.5), Math.max(1, h * p));
				}
			};
			draw();
			const ro = new ResizeObserver(draw);
			ro.observe(canvas);
			return () => ro.disconnect();
		};
	}

	/**
	 * Saving: the layers' mix rendered offline and each layer as 24-bit WAV,
	 * queued as a take with sources for a new idea in the current account
	 * (docs/demo-recording.md, "Takes with sources"); the loop's settings go on
	 * the idea. The recorder's queue would pick up a take left mid-upload.
	 */
	let saving = $state(false);
	let repeats = $state(1);
	/** The layers go with the take as its sources by default; stereo saves the mix alone (Kevin). */
	let saveStems = $state(true);
	let loopTitle = $state("");
	const queue = new TakeQueue({
		ideaFor: async (item) => {
			if (item.ideaId) return item.ideaId;
			if (!data.account) throw new Error("Sign in to save loops");
			const created = await createIdea({
				accountId: data.account.id,
				title: item.ideaTitle,
				kind: "loop",
			});
			return created.id;
		},
		onsaved: async (saved) => {
			if (saved.instruments)
				await saveIdeaInstruments({ id: saved.ideaId, ...saved.instruments }).catch(() => {});
			// The loop's previous take goes once the new one is in (the idea must never be empty, or it would be swept).
			const previous = replacing;
			replacing = null;
			if (previous && previous !== saved.id) await deleteTake({ id: previous }).catch(() => {});
			looper.markSaved({
				ideaId: saved.ideaId,
				recordingId: saved.id,
				title: saved.instruments?.looper ? looper.title : looper.title,
				inRecorder: looper.inRecorder,
			});
			notify(`Loop saved: “${looper.title}”`);
			await refreshAll();
			if (exportAfterSave) {
				exportAfterSave = false;
				await exportLoop();
			}
		},
	});
	let uploading = $derived(queue.items.filter((u) => u.status !== "failed"));
	/** The take id to remove once the new one is saved (an update in place). */
	let replacing = $state<string | null>(null);
	let exportAfterSave = false;
	const defaultTitle = () =>
		`Loop · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${looper.bpm} bpm`;
	/**
	 * Save: the loop as a take with its layers as sources under its own idea
	 * of kind "loop" (docs/looper.md, "Save and Export"), the first time a new
	 * idea, after that the same idea with the previous take replaced; `asNew`
	 * forks it. No dialog: the title field or a default names it.
	 */
	async function saveLoop(asNew = false) {
		if (!looper.layers.length || saving || !data.account) return;
		saving = true;
		try {
			if (asNew) looper.detach();
			if (!looper.title.trim()) looper.setTitle(defaultTitle());
			const title = looper.title;
			const mix = await looper.renderMix(repeats);
			if (looper.savedId) {
				await renameIdea({ id: looper.savedId, title }).catch(() => {});
				replacing = looper.savedRecordingId;
			}
			queue.enqueue({
				localId: `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
				ideaId: looper.savedId,
				ideaTitle: title,
				name: "",
				durationSeconds: mix.duration,
				mimeType: "audio/wav",
				ext: "wav",
				codec: "pcm",
				trimSilence: false,
				createdAt: Date.now(),
				blob: looper.wavOf(mix),
				instruments: {
					drums: null,
					piano: null,
					looper: looper.settings(),
					// The chord player's settings, as it stands, when a chords layer is in the loop.
					chords: looper.layers.some((l) => l.source === "chords")
						? $state.snapshot(chordPlayer.presetSettings)
						: null,
				},
				stems: looper.layers.map((l) => ({
					label: l.label,
					blob: looper.wavOf(l.buffer),
					mimeType: "audio/wav",
					ext: "wav",
					codec: "pcm",
				})),
			});
			notify("Saving the loop…");
		} catch (e) {
			notify(`Could not save the loop: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	/** Export: the saved loop into the Idea Recorder's list (its idea becomes kind "idea"); an unsaved or changed loop is saved first. */
	async function exportLoop() {
		if (!data.account) return;
		if (!looper.savedId || looper.dirty) {
			exportAfterSave = true;
			await saveLoop();
			return;
		}
		try {
			await setIdeaKind({ id: looper.savedId, kind: "idea" });
			looper.inRecorder = true;
			looper.markSaved({
				ideaId: looper.savedId,
				recordingId: looper.savedRecordingId ?? "",
				title: looper.title,
				inRecorder: true,
			});
			notify(`“${looper.title}” is now in the Idea Recorder`);
			await refreshAll();
		} catch (e) {
			notify(`Could not export the loop: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** The loop's notes: an idea's notes, the recorder's panel unchanged (Kevin); the idea is made on the first note when the loop was never saved. */
	let notes = $state("");
	let notesKey = $state(0);
	async function ensureLoopIdea(): Promise<string> {
		if (looper.savedId) return looper.savedId;
		if (!data.account) throw new Error("Sign in to keep notes");
		if (!looper.title.trim()) looper.setTitle(defaultTitle());
		const created = await createIdea({
			accountId: data.account.id,
			title: looper.title,
			kind: "loop",
		});
		looper.savedId = created.id;
		return created.id;
	}
	/** A loop exported earlier, back into the looper from its sources (docs/looper.md, "Export and Load"). */
	async function loadLoop(loop: { id: string; title: string; layers: number }) {
		if (
			looper.layers.length &&
			!confirm(
				`Load “${loop.title}”? The ${looper.layers.length} ${looper.layers.length === 1 ? "layer" : "layers"} here will be replaced (export them first to keep them).`,
			)
		)
			return;
		try {
			const { sources, settings, idea } = await loopSources({ id: loop.id });
			const n = await looper.loadFrom(
				sources,
				settings,
				idea
					? {
							ideaId: idea.id,
							recordingId: loop.id,
							title: idea.title,
							inRecorder: idea.kind === "idea",
						}
					: null,
			);
			notes = idea?.notes ?? "";
			notesKey++;
			notify(`“${loop.title}” loaded: ${n} ${n === 1 ? "layer" : "layers"}`);
		} catch (e) {
			notify(`Could not load the loop: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** Importing a take (docs/looper.md): the loop's length from the take when the loop is empty, else the take fitted to the loop; a start offset for a take that begins before its downbeat. */
	let importLengthFrom = $state<"loop" | "take">("take");
	let importStart = $state(0);
	async function importTake(take: { id: string; title: string }) {
		try {
			const { mix, sources } = await loopSources({ id: take.id });
			const n = await looper.importTake(mix, sources, {
				lengthFrom: looper.locked ? "loop" : importLengthFrom,
				startSeconds: importStart,
			});
			notify(`${take.title} imported as ${n} ${n === 1 ? "layer" : "layers"}`);
		} catch (e) {
			notify(`Could not import the take: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	const sourceIcon: Record<LoopSource, string> = {
		mic: "i-ph-microphone",
		line: "i-ph-plugs",
		computer: "i-ph-desktop",
		piano: "i-ph-piano-keys",
		chords: "i-ph-circle-dashed",
		drums: "",
	};
</script>

<svelte:head>
	<title>{data.copy.title || "Looper"} | Free Online Loop Station</title>
	<meta
		name="description"
		content="A free looper in the browser: lay a loop down a layer at a time from the microphone, the piano or the drum machine, with a count-in, a click and latency compensation, then save it as a take with each layer as a stem."
	/>
</svelte:head>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="@container" onpointerdowncapture={() => void looper.open()}>
	<main class="page-x-padding main-y-padding max-w-full w-full">
		<PageCopyHeader copy={data.copy}>
			{#snippet controls()}
				<button
					class="button button-sm shrink-0 {metroOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: metronome.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={metroOpen}
					aria-label={metroOpen ? "Close the metronome" : "Open the metronome"}
					title={metroOpen ? "Close the metronome" : "Open the metronome"}
					onclick={toggleMetronome}
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

		<!-- The device (docs/looper.md): the chassis, screen and button groups of the other instruments; the settings live in menus on the device. In a docked panel with a pop-out from lg, as the recorder. -->
		<FloatingPanel
			open={true}
			floating={looperFloating}
			closable={false}
			title="Looper"
			storageKey="stemshovel.looper.device-panel"
			width={900}
			height={640}
			onminimise={() => setLooperFloating(false)}
		>
			{#snippet controls()}
				<button
					class="button button-xs hidden lg-inline-flex"
					type="button"
					title={looperFloating
						? "Put the looper back in the page"
						: "Pop the looper out into a panel"}
					aria-label={looperFloating ? "Dock the looper" : "Pop out the looper"}
					onclick={() => setLooperFloating(!looperFloating)}
				>
					<span
						class={looperFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
						aria-hidden="true"
					></span>
				</button>
			{/snippet}
			<section
				class="device-chrome grid gap-4 px-3 py-4 pb-8 @xl-px-5 @xl-pt-5 w-full max-w-full relative"
				aria-label="Looper"
			>
				<!-- the loop's name, as the recorder's idea title: a placeholder until it is typed, editable here, used by Save (Kevin) -->
				<label class="block device-window-bevel-md">
					<span class="sr-only">Loop name</span>
					<input
						class="device-field w-full"
						type="text"
						maxlength="120"
						autocomplete="off"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						placeholder={defaultTitle()}
						value={looper.title}
						onchange={(e) => looper.setTitle(e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
				</label>
				<!-- the screen -->
				<div
					class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-3"
				>
					<div class="min-w-0 grow">
						<div class="text-24px @xl-text-32px leading-none tabular-nums" aria-live="polite">
							{#if looper.phase === "idle"}
								Stopped
							{:else if looper.position.bar === 0}
								Count-in · {looper.position.beat}
							{:else}
								Bar {looper.position.bar} · {looper.position.beat}
							{/if}
						</div>
						<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2 tabular-nums">
							<span
								>{looper.bars}
								{looper.bars === 1 ? "bar" : "bars"} · {looper.beatsPerBar}/4 · {looper.bpm} bpm · {looper.loopSeconds.toFixed(
									1,
								)} s</span
							>
							<span>· {looper.layers.length} {looper.layers.length === 1 ? "layer" : "layers"}</span
							>
							{#if looper.savedId}
								<span
									>· {looper.dirty ? "changed since the save" : "saved"}{looper.inRecorder
										? " · in the Idea Recorder"
										: ""}</span
								>
							{:else if looper.layers.length > 0}
								<span>· unsaved</span>
							{/if}
							{#if looper.phase === "recording"}
								<span class="text-red-300" role="status"
									>· ● recording {LOOP_SOURCE_LABELS[looper.armed]} · pass {looper.passes + 1} · layer
									lands in {Math.ceil(looper.secondsToPassEnd + LEAD_SECONDS)} s{looper.finishing
										? " · the last"
										: ""}</span
								>
							{/if}
							{#if armedError}
								<span class="text-red-300">· {armedError}</span>
							{/if}
							{#if looper.restored > 0 && looper.phase === "idle" && looper.layers.length === looper.restored}
								<span>· back from last time</span>
							{/if}
						</div>
						<div class="mt-3 h-1.5 rounded bg-blue-100/10 overflow-hidden" aria-hidden="true">
							<div class="h-full bg-accent" style:width="{looper.position.fraction * 100}%"></div>
						</div>
					</div>
					<div
						class="text-12px opacity-70 rounded border border-current/40 px-2 py-1 min-w-24 text-center"
					>
						{LOOP_SOURCE_LABELS[looper.armed]}
					</div>
				</div>

				<!-- the controls: transport, the source, the menus, the volume -->
				<!-- Rows under the screen: the sources first (what goes in), the settings and volume, and the transport last, right above the layers it makes (Kevin). -->
				<div>
					<div class="device-button-group-label text-dark">Input Source</div>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Source">
						{#each LOOP_SOURCES as source (source)}
							<SourceButton
								label={LOOP_SOURCE_LABELS[source]}
								iconClass={source === "drums" ? null : sourceIcon[source]}
								pressed={looper.armed === source}
								disabled={looper.phase === "recording"}
								title={sourceLabel(source)}
								level={looper.levels[source]}
								onclick={() => void arm(source)}
								menu={source === "mic"
									? micMenu
									: source === "line"
										? lineMenu
										: source === "computer"
											? computerMenu
											: source === "piano" || source === "chords"
												? pianoMenu
												: undefined}
							>
								{#snippet icon()}
									{#if source === "drums"}<IconDrumKit />{/if}
								{/snippet}
								{#snippet below()}
									{#if source === "mic" || source === "line" || source === "computer"}
										<label
											class="block px-0.5"
											title="Input gain: {inputSources.inputGainsDb[source] > 0
												? '+'
												: ''}{inputSources.inputGainsDb[source]} dB"
										>
											<span class="sr-only">{LOOP_SOURCE_LABELS[source]} gain</span>
											<input
												class="w-full accent-maximumYellow h-3"
												type="range"
												min="-12"
												max="24"
												step="1"
												value={inputSources.inputGainsDb[source]}
												aria-label="{LOOP_SOURCE_LABELS[source]} gain in decibels"
												oninput={(e) =>
													inputSources.setInputGainDb(source, Number(e.currentTarget.value))}
											/>
											<span
												class="block text-11px leading-none text-dark/80 text-center -mt-0.5"
												aria-hidden="true"
												>Gain {inputSources.inputGainsDb[source] > 0 ? "+" : ""}{inputSources
													.inputGainsDb[source]} dB</span
											>
										</label>
									{:else}
										{@const inst =
											source === "drums" ? drumMachine : source === "chords" ? chordPiano : piano}
										<!-- The instrument's own master volume (the same state its panel's slider moves), so it can be set from here while a layer records. -->
										<label
											class="block px-0.5"
											title="{LOOP_SOURCE_LABELS[source]} volume: {Math.round(inst.volume * 100)}%"
										>
											<span class="sr-only">{LOOP_SOURCE_LABELS[source]} volume</span>
											<input
												class="w-full accent-maximumYellow h-3"
												type="range"
												min="0"
												max="100"
												step="1"
												value={Math.round(inst.volume * 100)}
												aria-label="{LOOP_SOURCE_LABELS[source]} volume in percent"
												oninput={(e) => inst.setVolume(Number(e.currentTarget.value) / 100)}
											/>
											<span
												class="block text-11px leading-none text-dark/80 text-center -mt-0.5"
												aria-hidden="true">Volume {Math.round(inst.volume * 100)}%</span
											>
										</label>
									{/if}
								{/snippet}
							</SourceButton>
						{/each}
					</div>
				</div>

				<div class="flex flex-wrap items-end gap-x-5 gap-y-4">
					<div>
						<div class="device-button-group-label text-dark">Settings</div>
						<div class="flex flex-wrap gap-2">
							<ContextMenu
								ariaLabel="Timing settings"
								title="Tempo, bars, count-in and click"
								iconClass="i-ph-metronome"
								label="Timing"
								position="bottom right"
								buttonBaseClasses="device-button-sm px-3"
								buttonClasses={looper.locked ? "text-accent" : ""}
								popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
								items={[
									{ id: "loop-heading", kind: "heading", label: "Timing" },
									{ id: "loop-block", kind: "snippet", snippet: loopMenuBlock },
								]}
							/>
							<ContextMenu
								ariaLabel="Load a loop"
								title="Load a loop you exported before"
								iconClass="i-ph-folder-open"
								label="Load"
								position="bottom right"
								buttonBaseClasses="device-button-sm px-3"
								buttonClasses={looper.loading ? "text-accent" : ""}
								popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
								items={[
									{ id: "load-heading", kind: "heading", label: "Load a loop" },
									{ id: "load-block", kind: "snippet", snippet: loadMenuBlock },
								]}
							/>
							<ContextMenu
								ariaLabel="Save the loop"
								title="Save the loop; export it to the Idea Recorder"
								iconClass="i-ph-floppy-disk"
								label="Save"
								position="bottom right"
								buttonBaseClasses="device-button-sm px-3"
								buttonClasses={uploading.length > 0 ||
								(looper.layers.length > 0 && (looper.dirty || !looper.savedId))
									? "text-accent"
									: ""}
								popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
								items={[
									{ id: "save-heading", kind: "heading", label: "Save" },
									{ id: "save-block", kind: "snippet", snippet: saveMenuBlock },
								]}
							/>
						</div>
					</div>

					<div class="@xl-ml-auto min-w-120px grow @xl-grow-0 @xl-w-40">
						<div class="device-button-group-label text-dark">Volume</div>
						<input
							class="w-full accent-maximumYellow"
							type="range"
							min="0"
							max="100"
							value={Math.round(looper.volume * 100)}
							aria-label="Loop volume"
							oninput={(e) => looper.setVolume(Number(e.currentTarget.value) / 100)}
						/>
					</div>
				</div>

				<div>
					<div class="device-button-group-label text-dark">Transport</div>
					<div class="flex flex-wrap gap-2">
						<button
							class="device-button-lg {looper.phase === 'idle'
								? 'device-button-play'
								: 'device-button-stop'}"
							type="button"
							aria-pressed={looper.phase !== "idle"}
							title={looper.phase === "idle"
								? "Play the loop"
								: "Stop the loop (a pass still recording is dropped)"}
							onclick={() => looper.toggle()}
						>
							{looper.phase === "idle" ? "Play" : "Stop"}
						</button>
						<button
							class="device-button-lg device-button-record {looper.phase === 'recording'
								? 'text-accent bg-slate-900 ring-1 ring-red-500/60'
								: ''}"
							type="button"
							aria-pressed={looper.phase === "recording"}
							disabled={looper.layers.length >= MAX_LOOP_LAYERS || looper.finishing}
							title={looper.phase === "recording"
								? "Recording: press again to make this pass the last layer (Stop drops a pass under way)"
								: "Record a layer from the chosen source, from the next bar 1 (after the count-in when stopped); every full pass becomes a layer until you press Record again"}
							onclick={() => void looper.toggleRecord()}
						>
							Record
						</button>
						<button
							class="device-button-sm px-3"
							type="button"
							disabled={looper.layers.length === 0}
							title="Remove the last layer"
							onclick={() => looper.undo()}
						>
							<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
							Undo
						</button>
						<button
							class="device-button-sm px-3"
							type="button"
							disabled={looper.layers.length === 0}
							title="Remove every layer"
							onclick={clearLoop}
						>
							<span class="i-ph-trash" aria-hidden="true"></span>
							Clear
						</button>
					</div>
				</div>

				<!-- the layers -->
				<div>
					<div class="device-button-group-label text-dark">
						Layers · {looper.layers.length} of {MAX_LOOP_LAYERS}
					</div>
					{#if looper.layers.length === 0}
						<p class="device-screen text-center text-13px opacity-90 !text-wrap">
							No layers yet. Choose a source, press Record, and play a pass of the loop.
						</p>
					{:else}
						<ul class="grid gap-1.5" aria-label="Layers">
							{#each looper.layers as layer (layer.id)}
								<li
									class="device-screen !px-2 !py-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 {layer.muted
										? 'opacity-60'
										: ''}"
								>
									<span class="grid gap-1 w-32 @xl-w-40">
										<span class="text-13px truncate" title={layer.label}>{layer.label}</span>
										<span class="flex items-center gap-1">
											<button
												class="device-button-xs px-2 {layer.muted ? 'text-accent' : ''}"
												type="button"
												aria-pressed={layer.muted}
												aria-label="Mute {layer.label}"
												onclick={() => looper.toggleMute(layer.id)}>M</button
											>
											<button
												class="device-button-xs px-2 {layer.solo ? 'text-accent' : ''}"
												type="button"
												aria-pressed={layer.solo}
												aria-label="Solo {layer.label}"
												onclick={() => looper.toggleSolo(layer.id)}>S</button
											>
											<input
												class="w-14 @xl-w-20 accent-maximumYellow"
												type="range"
												min="0"
												max="100"
												value={Math.round(layer.gain * 100)}
												aria-label="{layer.label} level"
												oninput={(e) =>
													looper.setGain(layer.id, Number(e.currentTarget.value) / 100)}
											/>
										</span>
									</span>
									<span class="relative block h-10 rounded bg-oxford-950/60 overflow-hidden">
										<canvas class="block w-full h-full" {@attach wave(layer.peaks)}></canvas>
										{#if looper.phase !== "idle" && looper.position.bar > 0}
											<span
												class="absolute top-0 bottom-0 w-px bg-accent"
												style:left="{looper.position.fraction * 100}%"
												aria-hidden="true"
											></span>
										{/if}
									</span>
									<button
										class="device-button-xs px-2"
										type="button"
										aria-label="Delete {layer.label}"
										title="Delete this layer"
										onclick={() => looper.remove(layer.id)}
									>
										<span class="i-ph-trash" aria-hidden="true"></span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- branding, as the other devices wear it -->
				<div
					class="absolute bottom-3 right-5 text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
				>
					SS Loop 001
				</div>
			</section>
		</FloatingPanel>

		{#if data.account}
			<!-- The loop's notes: the recorder's panel on the loop's idea (made on the first note when the loop was never saved). -->
			<section class="mt-6" aria-label="Loop notes">
				<FloatingPanel
					open={true}
					floating={notesFloating}
					closable={false}
					title={`Notes for “${looper.title || "this loop"}”`}
					storageKey="stemshovel.looper.notes-panel"
					width={560}
					height={620}
					onminimise={() => setNotesFloating(false)}
				>
					{#snippet controls()}
						<button
							class="button button-xs hidden lg-inline-flex"
							type="button"
							title={notesFloating
								? "Put the notes back in the page"
								: "Pop the notes out into a panel"}
							aria-label={notesFloating ? "Dock the notes" : "Pop out the notes"}
							onclick={() => setNotesFloating(!notesFloating)}
						>
							<span
								class={notesFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
								aria-hidden="true"
							></span>
						</button>
					{/snippet}
					{#key `${looper.savedId ?? "new"}/${notesKey}`}
						<IdeaNotesPanel
							idea={{ id: looper.savedId, notes, title: looper.title || "this loop" }}
							ensureIdea={ensureLoopIdea}
							onchange={(m) => (notes = m)}
							onsaved={async ({ ideaDeleted }) => {
								if (ideaDeleted) looper.detach();
								await refreshAll();
							}}
						/>
					{/key}
				</FloatingPanel>
			</section>
		{/if}

		<PageCopySection
			html={data.copy.bodyHtml}
			docsHref="/docs/looper"
			docsLabel="Looper docs"
			docsLead="Learn more about using the looper in the user docs."
		/>
	</main>

	<!-- The settings, as blocks in the device's menus (the piano's effects menu idiom). -->
	{#snippet loopMenuBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			{#if looper.locked}
				<p class="text-12px opacity-70">
					Tempo and length are fixed while the loop has layers. Clear it to change them.
				</p>
			{/if}
			<div class="flex items-end gap-3">
				<label class="block grow">
					<span class="device-button-label">Tempo · {looper.bpm} bpm</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="40"
						max="240"
						step="1"
						value={looper.bpm}
						disabled={looper.locked}
						aria-label="Tempo in beats per minute"
						oninput={(e) => looper.setBpm(Number(e.currentTarget.value))}
					/>
				</label>
				<button
					class="device-button-xs px-3 mb-1"
					type="button"
					disabled={looper.locked}
					aria-label="Tap the tempo"
					title="Tap the tempo"
					onclick={() => looper.tap()}>Tap</button
				>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<label class="block">
					<span class="device-button-label">Bars</span>
					<select
						class="device-field w-full"
						value={looper.bars}
						disabled={looper.locked}
						aria-label="Bars"
						onchange={(e) => looper.setBars(Number(e.currentTarget.value) as LoopBars)}
					>
						{#each LOOP_BARS as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</label>
				<label class="block">
					<span class="device-button-label">Beats per bar</span>
					<select
						class="device-field w-full"
						value={looper.beatsPerBar}
						disabled={looper.locked}
						aria-label="Beats per bar"
						onchange={(e) => looper.setBeatsPerBar(Number(e.currentTarget.value) as 3 | 4)}
					>
						<option value={4}>4</option>
						<option value={3}>3</option>
					</select>
				</label>
			</div>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={looper.countIn}
					onchange={(e) => (looper.countIn = e.currentTarget.checked)}
				/>
				Count in a bar before the first pass
			</label>
			<label class="block">
				<span class="device-button-label">Click</span>
				<select class="device-field w-full" aria-label="Click" bind:value={looper.click}>
					<option value="count-in">On the count-in only</option>
					<option value="always">Through the loop</option>
					<option value="off">Off</option>
				</select>
			</label>
		</div>
	{/snippet}

	<!-- Each outside source's menu (InputSourceSettings.svelte; Calibrate is on the microphone's). -->
	{#snippet micMenu()}
		<InputSourceSettings source="mic" calibrateDisabled={looper.phase !== "idle"} />
	{/snippet}
	{#snippet lineMenu()}
		<InputSourceSettings source="line" />
	{/snippet}
	{#snippet computerMenu()}
		<InputSourceSettings source="computer" />
	{/snippet}

	{#snippet pianoMenu()}
		<div class="px-3 pt-3 pb-4 grid gap-3">
			<p class="text-12px opacity-70">
				Your audio output reports {looper.ready ? `${looper.outputLatencyMs} ms` : "its"} latency (Bluetooth
				adds a lot). A piano or chords layer played by hand is timed against the loop as you hear it,
				so it is shifted earlier by this much.
			</p>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={looper.compensatePiano}
					onchange={(e) => (looper.compensatePiano = e.currentTarget.checked)}
				/>
				Shift piano and chords layers by the output latency
			</label>
		</div>
	{/snippet}

	{#snippet loadMenuBlock()}
		<div class="px-3 pt-3 pb-4 grid gap-3">
			{#if !data.signedIn}
				<p class="text-13px text-blue-100/90">
					Loops you export to the Idea Recorder load back from here. Sign in to see yours.
				</p>
				<a
					class="device-button-sm px-3 text-accent justify-self-start"
					href="/sign-in?next=%2Flooper">Sign in</a
				>
			{:else if data.loops.length === 0}
				<p class="text-13px text-blue-100/90">
					No loops yet. Export this loop and it will be listed here.
				</p>
			{:else}
				<ul class="grid gap-1" aria-label="Exported loops">
					{#each data.loops as loop (loop.id)}
						<li>
							<button
								class="w-full text-left rounded px-2 py-1.5 hover:bg-white/10 grid gap-0.5 disabled:opacity-50"
								type="button"
								disabled={looper.loading}
								onclick={() => void loadLoop(loop)}
							>
								<span class="text-14px text-blue-100 truncate">{loop.title}</span>
								<span class="text-12px opacity-70"
									>{loop.layers}
									{loop.layers === 1 ? "layer" : "layers"} · {loop.bars}
									{loop.bars === 1 ? "bar" : "bars"} · {loop.bpm} bpm · {new Date(
										loop.createdAt,
									).toLocaleDateString()}</span
								>
							</button>
						</li>
					{/each}
				</ul>
				{#if looper.loading}<p class="text-12px opacity-70" role="status">Loading…</p>{/if}
			{/if}
			{#if data.signedIn && data.takes.length > 0}
				<div
					class="border-t border-current/10 pt-3 grid gap-3 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
				>
					<div class="text-11px uppercase tracking-wider text-accent">Import a take</div>
					<p class="text-12px opacity-70">
						A take from the Idea Recorder as layers: a saved loop one per source, a recorded take as
						one. It is cut to the loop's length from the start you choose.
					</p>
					<div class="grid grid-cols-2 gap-3">
						<label class="block">
							<span class="device-button-label">Loop length</span>
							<select
								class="device-field w-full"
								aria-label="Loop length on import"
								bind:value={importLengthFrom}
								disabled={looper.locked}
							>
								<option value="take">From the take</option>
								<option value="loop">Fit to the loop</option>
							</select>
						</label>
						<label class="block">
							<span class="device-button-label">Start at · s</span>
							<input
								class="device-field w-full"
								type="number"
								min="0"
								step="0.01"
								aria-label="Start offset in seconds"
								bind:value={importStart}
							/>
						</label>
					</div>
					{#if looper.locked}<p class="text-12px opacity-70">
							The loop has layers, so a take is fitted to its length.
						</p>{/if}
					<ul class="grid gap-1 max-h-60 overflow-y-auto" aria-label="Recent takes">
						{#each data.takes as take (take.id)}
							<li>
								<button
									class="w-full text-left rounded px-2 py-1.5 hover:bg-white/10 grid gap-0.5 disabled:opacity-50"
									type="button"
									disabled={looper.loading || looper.layers.length >= MAX_LOOP_LAYERS}
									title="Import this take as {take.sources > 0
										? `${take.sources} layers`
										: 'a layer'}"
									onclick={() => void importTake(take)}
								>
									<span class="text-14px text-blue-100 truncate">{take.title}</span>
									<span class="text-12px opacity-70"
										>{take.durationSeconds
											? `${take.durationSeconds.toFixed(1)} s`
											: "—"}{take.sources > 0 ? ` · ${take.sources} sources` : ""} · {new Date(
											take.createdAt,
										).toLocaleDateString()}</span
									>
								</button>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/snippet}

	{#snippet saveMenuBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			{#if !data.account}
				<p class="text-13px text-blue-100/90">
					Your loop stays in this browser as you work. To keep it for good, save it: that needs an
					account.
				</p>
				<div class="flex flex-wrap gap-2">
					<a class="device-button-sm px-3 text-accent" href="/sign-in?next=%2Flooper">Sign in</a>
					{#if !data.signedIn}<a class="device-button-sm px-3" href="/sign-up">Create an account</a
						>{/if}
				</div>
			{:else}
				<label class="block">
					<span class="device-button-label">Passes in the saved mix</span>
					<select class="device-field w-full" bind:value={repeats}>
						<option value={1}>1</option>
						<option value={2}>2</option>
						<option value={4}>4</option>
					</select>
				</label>
				<p class="text-12px opacity-70">
					{#if looper.savedId}
						Saved as “{looper.title}”{looper.dirty ? ", changed since" : ""}{looper.inRecorder
							? " · in the Idea Recorder"
							: " · in the looper only"}.
					{:else}
						Not saved yet. A saved loop is listed in the Load menu, with each layer kept; export it
						to see it in the Idea Recorder too.
					{/if}
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						class="device-button-sm px-3 {looper.layers.length && (looper.dirty || !looper.savedId)
							? 'text-accent'
							: ''}"
						type="button"
						disabled={looper.layers.length === 0 || saving}
						title={looper.savedId ? "Save this loop again, in place" : "Save this loop"}
						onclick={() => void saveLoop()}
					>
						<span class="i-ph-floppy-disk" aria-hidden="true"></span>
						{saving ? "Rendering…" : "Save"}
					</button>
					{#if looper.savedId}
						<button
							class="device-button-sm px-3"
							type="button"
							disabled={looper.layers.length === 0 || saving}
							title="Save as a separate loop, leaving the saved one as it is"
							onclick={() => void saveLoop(true)}>Save as new loop</button
						>
					{/if}
					<button
						class="device-button-sm px-3"
						type="button"
						disabled={looper.layers.length === 0 || saving || looper.inRecorder}
						title="List this loop in the Idea Recorder as an idea, where its layers can go to a song as stems"
						onclick={() => void exportLoop()}
					>
						<span class="i-ph-export" aria-hidden="true"></span>
						{looper.inRecorder ? "In the Idea Recorder" : "Export to the Idea Recorder"}
					</button>
				</div>
				{#if uploading.length > 0}
					<span class="text-13px opacity-80" role="status">
						{uploading[0].status === "uploading"
							? `Saving… ${Math.round(uploading[0].progress)}%`
							: "Waiting…"}
					</span>
				{/if}
				{#if queue.items.some((u) => u.status === "failed")}
					<span class="text-13px text-red-400" role="status"
						>A save failed: {queue.items.find((u) => u.status === "failed")?.error}</span
					>
					<button
						class="device-button-xs px-3 justify-self-start"
						type="button"
						onclick={() =>
							queue.items
								.filter((u) => u.status === "failed")
								.forEach((u) => queue.retry(u.localId))}>Retry</button
					>
				{/if}
			{/if}
		</div>
	{/snippet}

	<!-- The instruments' panels, as on the recorder page: floating from lg, docked below. -->
	<FloatingPanel
		open={drumsOpen}
		title="Drum machine"
		storageKey="stemshovel.looper.drum-panel"
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
		storageKey="stemshovel.looper.piano-panel"
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
		storageKey="stemshovel.looper.chords-panel"
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
	<FloatingPanel
		open={metroOpen}
		title="Metronome"
		storageKey="stemshovel.looper.metronome-panel"
		width={640}
		height={520}
		onminimise={() => toggleMetronome()}
	>
		<Metronome />
	</FloatingPanel>
</div>
