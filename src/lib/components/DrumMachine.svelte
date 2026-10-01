<script lang="ts">
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import IconDrumKit from "$lib/components/IconDrumKit.svelte";
	import {
		DRUM_BPM_MAX,
		DRUM_BPM_MIN,
		DRUM_KITS,
		DRUM_METERS,
		DRUM_DELAY_TIMES,
		DRUM_SWING_GRIDS,
		DRUM_VOICES,
		MAX_DRUM_PATTERNS,
		MAX_DRUM_TIMELINE,
		MAX_DRUM_ROWS,
		drumStepsFor,
		type DrumDelayTime,
		type DrumSteps,
		type DrumVoiceId,
	} from "$lib/constants/drumMachine";
	import { DRUM_PRESET_STYLES, DRUM_PRESETS } from "$lib/constants/drumPresets";
	import { DRUM_GENERATOR_STYLES } from "$lib/constants/drumGenerator";
	import { deleteBeat, renameBeat, saveBeat } from "$lib/remote/beats.remote";
	import { setHomeBeat } from "$lib/remote/admin.remote";
	import { textToBeat as askForBeat } from "$lib/remote/textToBeat.remote";
	import type { DrumProject } from "$lib/val/DrumPatternSchema";
	import { drumTutorial as tutorial } from "$lib/state/drumTutorial.svelte";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { postJson, uploadDemoFile, type DemoReservation } from "$lib/upload";
	import { resizeDrumPattern } from "$lib/utils/resizeDrumPattern";
	import { startingDrumProject } from "$lib/utils/startingDrumProject";
	import { onMount } from "svelte";

	/**
	 * The drum machine as a device (docs/drum-machine.md): a readout, the
	 * transport and tempo, the pattern tabs, the grid of rows and steps, and
	 * the row controls; or, compact, a toggle with the tempo for a device's
	 * control row or a menu, like the metronome's. A view of the page's one
	 * engine (src/lib/audio/drumMachine.svelte.ts). On a phone a bar shows as
	 * two lines of eight, so every cell stays big enough to tap; the level
	 * and pan sliders show from sm up. The drums and the metronome never
	 * play together: starting one stops the other and takes its tempo.
	 */
	interface Props {
		compact?: boolean;
		/** Compact only: when the tempo field shows. "auto" is while running. */
		tempo?: "auto" | "always" | "never";
		/** Compact only: the toggle shows the icon, or the words On / Off (for a menu row that names it already). */
		toggle?: "icon" | "text";
		/** Space plays and stops. Off where the page needs space for scrolling (the home page demo). */
		keyboard?: boolean;
		/** A signed-in member's account: beats can be saved to it and loaded from it (docs/drum-machine.md, Phase 3). */
		account?: { id: string; name: string; canEdit: boolean } | null;
		/** The account's saved beats, newest first. */
		beats?: SavedBeat[];
		song?: BeatSong | null;
		/** What a first visit opens with when nothing is remembered in the browser (the home page's demo beat, chosen by a system admin). */
		starting?: DrumProject | null;
		/** A system admin on the home page: the ⋯ menu can make the beat in the machine the home page's starting one. */
		homeAdmin?: boolean;
		/** Text-to-Beat is on (the AI Gateway is configured): a menu asks a model for a beat from a description. */
		textToBeat?: boolean;
	}
	interface SavedBeat {
		id: string;
		name: string;
		data: DrumProject;
		updatedAt: Date;
		/** The song the beat belongs to, if any. */
		song?: { id: string; title: string } | null;
	}
	/** A song the page opened the machine for (docs/drum-machine.md, Phase 3): seeds a beat, Save attaches it, the ⋯ menu adds it as a demo. */
	interface BeatSong {
		id: string;
		title: string;
		href: string;
		bpm: number | null;
		meter: string | null;
	}
	let {
		compact = false,
		tempo = "auto",
		toggle = "icon",
		keyboard = true,
		account = null,
		beats = [],
		song = null,
		starting = null,
		homeAdmin = false,
		textToBeat = false,
	}: Props = $props();

	// The account's beats, kept here as they change; the one open, if any, is what Save brings up to date.
	// svelte-ignore state_referenced_locally -- the page's list is the starting point; from here the component keeps it
	let saved = $state<SavedBeat[]>(beats);
	let openBeat = $state<{ id: string; name: string } | null>(null);
	let saving = $state(false);
	let addingDemo = $state(false);
	async function save(asNew = false) {
		if (!account) return;
		let id = asNew ? undefined : openBeat?.id;
		let name = openBeat && !asNew ? openBeat.name : null;
		if (!name) {
			name = window.prompt("Name this beat", `Beat ${saved.length + 1}`)?.trim() ?? "";
			if (!name) return;
		}
		saving = true;
		try {
			const data = $state.snapshot(drumMachine.project);
			const row = await saveBeat({
				accountId: account.id,
				id,
				name,
				data,
				songId: !id && song ? song.id : undefined,
			});
			const entry = {
				id: row.id,
				name: row.name,
				data,
				updatedAt: new Date(row.updatedAt),
				song: id
					? saved.find((b) => b.id === id)?.song
					: song
						? { id: song.id, title: song.title }
						: null,
			};
			saved = [entry, ...saved.filter((b) => b.id !== row.id)];
			openBeat = { id: row.id, name: row.name };
			drumMachine.loadedName = row.name;
			notify(id ? `${row.name} saved` : `${row.name} saved to ${account.name}`);
		} catch (e) {
			notify(`Could not save the beat: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	function openSaved(b: SavedBeat) {
		drumMachine.loadProject($state.snapshot(b.data), "replace", b.name);
		openBeat = { id: b.id, name: b.name };
		notify(`${b.name} loaded`);
	}
	async function renameOpen() {
		if (!openBeat) return;
		const name = window.prompt("Rename the beat", openBeat.name)?.trim();
		if (!name || name === openBeat.name) return;
		try {
			const row = await renameBeat({ id: openBeat.id, name });
			saved = saved.map((b) => (b.id === row.id ? { ...b, name: row.name } : b));
			openBeat = { id: row.id, name: row.name };
		} catch (e) {
			notify(`Could not rename the beat: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function deleteOpen() {
		if (!openBeat || !window.confirm(`Delete "${openBeat.name}" from ${account?.name}?`)) return;
		try {
			await deleteBeat({ id: openBeat.id });
			saved = saved.filter((b) => b.id !== openBeat!.id);
			notify(`${openBeat.name} deleted`);
			openBeat = null;
			drumMachine.loadedName = null;
		} catch (e) {
			notify(`Could not delete the beat: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	const escapeHtml = (t: string) =>
		t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
	/** The ⋯ menu: keeping the beat (Save, Copy link, Download) and, signed in, the account's beats. */
	let moreItems = $derived([
		...(account?.canEdit
			? [
					{
						id: "save",
						kind: "button" as const,
						label: openBeat
							? `Save ${escapeHtml(openBeat.name)}`
							: `Save to ${escapeHtml(account.name)}`,
						iconClass: "i-ph-floppy-disk",
						disabled: saving,
						action: () => save(),
					},
					...(openBeat
						? [
								{
									id: "save-as",
									kind: "button" as const,
									label: "Save as a new beat",
									iconClass: "i-ph-copy",
									action: () => save(true),
								},
								{
									id: "rename",
									kind: "button" as const,
									label: "Rename the beat",
									iconClass: "i-ph-pencil-simple",
									action: renameOpen,
								},
								{
									id: "delete",
									kind: "button" as const,
									label: "Delete the beat",
									iconClass: "i-ph-trash",
									action: deleteOpen,
								},
							]
						: []),
					{ id: "sep-save", kind: "divider" as const },
				]
			: []),
		...(song
			? [
					{
						id: "add-demo",
						kind: "button" as const,
						label: `Add to ${escapeHtml(song.title)} as a demo`,
						iconClass: "i-ph-microphone",
						disabled: addingDemo,
						title: "The open pattern, one cycle, as a WAV demo of the song",
						action: addAsDemo,
					},
					{
						id: "back-to-song",
						kind: "link" as const,
						label: `Back to ${escapeHtml(song.title)}`,
						iconClass: "i-ph-arrow-left",
						href: song.href,
					},
					{ id: "sep-song", kind: "divider" as const },
				]
			: []),
		...(homeAdmin
			? [
					{
						id: "set-home-beat",
						kind: "button" as const,
						label: 'Use as the home page beat <span class="opacity-60 text-12px">admin</span>',
						iconClass: "i-ph-house",
						title: "What the drum machine here opens with for a first-time visitor",
						action: async () => {
							try {
								await setHomeBeat({ data: $state.snapshot(drumMachine.project) });
								notify("Home page beat saved");
							} catch (e) {
								notify(errorMessage(e), { kind: "error" });
							}
						},
					},
				]
			: []),
		{
			id: "copy-link",
			kind: "button" as const,
			label: "Copy link",
			iconClass: "i-ph-link",
			title: "A link to this project",
			action: copyLink,
		},
		{
			id: "download-wav",
			kind: "button" as const,
			label: `Download WAV <span class="opacity-60 text-12px">${drumMachine.playsSong ? "the song" : "one cycle"}</span>`,
			iconClass: "i-ph-waveform",
			action: () => download("wav"),
		},
		{
			id: "download-midi",
			kind: "button" as const,
			label: 'Download MIDI <span class="opacity-60 text-12px">for a DAW</span>',
			iconClass: "i-ph-piano-keys",
			action: () => download("midi"),
		},
		...(account
			? [
					{ id: "sep-beats", kind: "divider" as const },
					{
						id: "heading",
						kind: "notice" as const,
						notice: saved.length
							? `Saved in ${account.name}`
							: `No beats saved in ${account.name} yet`,
					},
					...saved.map((b) => ({
						id: `beat-${b.id}`,
						kind: "button" as const,
						label: `${escapeHtml(b.name)} <span class="opacity-60 text-12px">${b.data.bpm} bpm${b.song ? ` · ${escapeHtml(b.song.title)}` : ""}</span>`,
						action: () => openSaved(b),
					})),
				]
			: []),
	]);
	const midiSupported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;
	const VOICE_OPTIONS = DRUM_VOICES.map((v) => ({ value: v.id, label: v.label }));
	const KIT_OPTIONS = DRUM_KITS.map((k) => ({ value: k.id, label: k.label }));
	let showTempo = $derived(tempo === "always" || (tempo === "auto" && drumMachine.running));

	// The full view is about the drums: fetch the sampled kit as it opens. A toolbar's toggle waits for the first play.
	onMount(() => {
		drumMachine.load(!compact, starting);
		// Opened for a song: a fresh beat at its tempo and meter, the beat that was there kept for Undo.
		if (song && !compact) {
			const seeded = startingDrumProject();
			if (song.bpm) seeded.bpm = Math.min(DRUM_BPM_MAX, Math.max(DRUM_BPM_MIN, song.bpm));
			const meter = DRUM_METERS.find((m) => m.id === song.meter);
			if (meter && meter.id !== "4/4") {
				seeded.patterns[0] = resizeDrumPattern(
					{ ...seeded.patterns[0]!, meter: meter.id },
					meter.barSteps as DrumSteps,
				);
			}
			drumMachine.loadProject(seeded, "replace", null);
		}
	});

	/** The open pattern rendered to WAV and added to the song as a demo, through the demo upload path. */
	async function addAsDemo() {
		if (!song) return;
		addingDemo = true;
		try {
			const blob = await drumMachine.wav();
			const name = `${openBeat?.name ?? drumMachine.loadedName ?? "Beat"} (drum machine).wav`;
			const file = new File([blob], name, { type: "audio/wav" });
			await uploadDemoFile(file, () =>
				postJson<DemoReservation>("/api/demos", {
					songId: song.id,
					filename: file.name,
					sizeBytes: file.size,
				}),
			);
			notify(`Added to ${song.title} as a demo`);
		} catch (e) {
			notify(`Could not add the demo: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			addingDemo = false;
		}
	}

	const voiceLabel = (id: DrumVoiceId) => DRUM_VOICES.find((v) => v.id === id)?.label ?? id;
	const kitLabel = (id: string) => DRUM_KITS.find((k) => k.id === id)?.label ?? id;

	function togglePlay() {
		if (!drumMachine.running) tutorial.played = true;
		if (!drumMachine.running && metronome.running) {
			drumMachine.setBpm(metronome.bpm);
			metronome.stop();
		}
		drumMachine.toggle();
	}

	// Painting: press a cell and drag across others to set them all the same way.
	// A long press (or a right click, or shift) on a sounding cell steps its velocity instead.
	const LONG_PRESS_MS = 450;
	let painting = $state<boolean | null>(null);
	let pressTimer: ReturnType<typeof setTimeout> | null = null;
	function paintAt(x: number, y: number) {
		if (painting === null) return;
		const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row][data-step]");
		if (!el) return;
		drumMachine.setCell(Number(el.dataset.row), Number(el.dataset.step), painting);
	}
	function press(e: PointerEvent, row: number, step: number, velocity: number) {
		if (e.button !== 0) return;
		if (e.shiftKey && velocity) {
			drumMachine.cycleVelocity(row, step);
			return;
		}
		painting = !velocity;
		drumMachine.setCell(row, step, painting);
		if (velocity) {
			// Held: the cell comes back at its next velocity and the paint is off.
			pressTimer = setTimeout(() => {
				painting = null;
				drumMachine.setVelocity(row, step, (velocity % 3) + 1);
			}, LONG_PRESS_MS);
		}
	}
	function release() {
		painting = null;
		if (pressTimer) clearTimeout(pressTimer);
		pressTimer = null;
	}

	function onkeydown(e: KeyboardEvent) {
		const t = e.target as HTMLElement | null;
		if (
			compact ||
			!keyboard ||
			e.key !== " " ||
			t?.closest("input, select, textarea, [contenteditable]")
		)
			return;
		e.preventDefault();
		togglePlay();
	}

	async function copyLink() {
		const url = drumMachine.shareUrl();
		history.replaceState(null, "", url);
		try {
			await navigator.clipboard.writeText(url);
			notify("Link copied");
		} catch {
			notify("Could not copy the link", { kind: "error" });
		}
	}
	async function download(kind: "wav" | "midi") {
		try {
			const blob = kind === "wav" ? await drumMachine.wav() : drumMachine.midi();
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${drumMachine.fileStem()}.${kind === "wav" ? "wav" : "mid"}`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
		} catch (e) {
			notify(`Download failed: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	let p = $derived(drumMachine.project);
	let pattern = $derived(drumMachine.pattern);
	/** The tutorial's pointer: an outline on the control or the cells its step names. */
	const HINT = "outline outline-2 outline-accent outline-offset-2";
	let hintedCells = $derived(
		tutorial.hints && tutorial.hints.pattern === drumMachine.current ? tutorial.hints.cells : null,
	);
	/** Sixteenths to a beat for the shading (6 in 6/8), and cells to a line: a beat pair on a phone, a bar from sm up. */
	let group = $derived(DRUM_METERS.find((m) => m.id === pattern.meter)?.group ?? 4);
	let lineClasses = $derived(
		(DRUM_METERS.find((m) => m.id === pattern.meter)?.barSteps ?? 16) === 16
			? "grid-cols-8 sm-grid-cols-16"
			: "grid-cols-6 sm-grid-cols-12",
	);
	let stepsLabel = (n: number) => {
		const bar = DRUM_METERS.find((m) => m.id === pattern.meter)?.barSteps ?? 16;
		return n < bar ? "½ bar" : n === bar ? "1 bar" : "2 bars";
	};

	/** The presets menu: a heading per style, a button per beat; a second, quieter item adds instead of replacing. */
	let presetItems = $derived(
		DRUM_PRESET_STYLES.flatMap((style) => [
			{ id: `style-${style}`, kind: "heading" as const, label: style },
			...DRUM_PRESETS.filter((preset) => preset.style === style).map((preset) => ({
				id: `preset-${preset.id}`,
				kind: "button" as const,
				label: `${preset.name} <span class="opacity-60 text-12px">${preset.bpm} bpm${preset.meter && preset.meter !== "4/4" ? ` · ${preset.meter}` : ""}</span>`,
				title: "Load in place of the project; shift-click to add its patterns to the project",
				action: () => load(preset.id),
			})),
		]),
	);
	let addPresets = $state(false);

	// The generator's choices, kept while the page lives.
	let generatorStyle = $state(DRUM_GENERATOR_STYLES[0]!.id);
	let generatorDensity = $state(0.5);
	const GENERATOR_OPTIONS = DRUM_GENERATOR_STYLES.map((s) => ({ value: s.id, label: s.name }));
	// Text-to-Beat: the description, whether the answer joins as a new pattern, and the request in flight.
	let beatPrompt = $state("");
	let beatAsNew = $state(false);
	let beatAsking = $state(false);
	let beatNote = $state("");
	let beatError = $state("");
	async function makeBeat() {
		const prompt = beatPrompt.trim();
		if (!prompt || beatAsking) return;
		beatAsking = true;
		beatError = "";
		beatNote = "";
		try {
			const reply = await askForBeat({
				prompt,
				meter: pattern.meter,
				steps: pattern.steps,
				voices: pattern.rows.map((r) => r.voice),
			});
			const index = drumMachine.placePattern(reply.pattern, beatAsNew ? "add" : "replace", {
				bpm: reply.bpm,
				swing: reply.swing,
			});
			beatNote = [reply.note, reply.bpm ? `${reply.bpm} bpm` : ""].filter(Boolean).join(" · ");
			notify(
				beatAsNew
					? `Your beat is pattern ${index + 1}`
					: `Your beat is in pattern ${index + 1}; Undo brings the old one back`,
			);
		} catch (e) {
			beatError = errorMessage(e);
		} finally {
			beatAsking = false;
		}
	}
	function generate(mode: "replace" | "add") {
		const style = DRUM_GENERATOR_STYLES.find((s) => s.id === generatorStyle);
		if (!style) return;
		const index = drumMachine.generate(style, generatorDensity, mode);
		notify(
			mode === "add"
				? `${style.name} generated as pattern ${index + 1}`
				: `${style.name} generated into pattern ${index + 1}; Undo brings yours back`,
		);
	}
	function load(id: string) {
		const preset = DRUM_PRESETS.find((x) => x.id === id);
		if (!preset) return;
		const mode = addPresets ? "add" : "replace";
		drumMachine.loadPreset(preset, mode);
		notify(
			mode === "add"
				? `${preset.name} added as pattern ${drumMachine.current + 1}`
				: `${preset.name} loaded; Undo brings your beat back`,
		);
	}
</script>

<!-- The full view's listeners: the space bar, and the paint following the pointer across cells. -->
<svelte:window
	{onkeydown}
	onpointermove={(e) => paintAt(e.clientX, e.clientY)}
	onpointerup={release}
	onpointercancel={release}
/>

{#if compact}
	<div class="flex items-stretch gap-1" aria-label="Drum machine">
		<button
			class="button button-sm shrink-0 {drumMachine.running
				? 'bg-accent text-oxford border-accent opacity-100'
				: ''}"
			type="button"
			aria-pressed={drumMachine.running}
			title={drumMachine.running
				? "Stop the drums"
				: "Start the drums (the beat from /drum-machine)"}
			aria-label={drumMachine.running ? "Stop the drums" : "Start the drums"}
			onclick={togglePlay}
		>
			{#if toggle === "text"}
				<span class="w-5 text-center" aria-hidden="true">{drumMachine.running ? "On" : "Off"}</span>
			{:else}
				<IconDrumKit
					class="{drumMachine.running && drumMachine.step % 4 === 0
						? 'scale-125'
						: ''} transition-transform"
				/>
			{/if}
		</button>
		{#if showTempo}
			<label class="flex items-center gap-1 text-13px">
				<span class="sr-only">Tempo</span>
				<input
					class="field w-16 py-1 text-center text-13px tabular-nums"
					type="number"
					min={DRUM_BPM_MIN}
					max={DRUM_BPM_MAX}
					step="1"
					value={p.bpm}
					onchange={(e) => drumMachine.setBpm(Number(e.currentTarget.value))}
					aria-label="Drums tempo in beats per minute"
				/>
				<span class="text-dim">bpm</span>
			</label>
		{/if}
		{#if showTempo && (p.patterns.length > 1 || p.timeline.length > 0)}
			<div
				class="w-28"
				title="Pattern, or the song (while playing, it takes over at the end of the cycle)"
			>
				<ComboBox
					ariaLabel="Drums pattern"
					buttonClasses="!px-2 !py-1 !text-13px"
					options={[
						...(p.timeline.length ? [{ value: "song", label: "Song" }] : []),
						...p.patterns.map((_, i) => ({ value: String(i), label: `Pattern ${i + 1}` })),
					]}
					value={drumMachine.playsSong ? "song" : String(drumMachine.current)}
					onchange={(v) => {
						if (v === "song") drumMachine.setSongMode(true);
						else {
							drumMachine.setSongMode(false);
							drumMachine.select(Number(v));
						}
					}}
				/>
			</div>
		{/if}
	</div>
{:else}
	<div
		class="device-chrome grid grid-cols-1 sm-grid-cols-1 gap-4 pb-14 px-3 py-4 sm-px-5 sm-pt-5 w-full max-w-full overflow-hidden relative"
		aria-label="Drum machine"
	>
		<!-- branding -->
		<div
			class="absolute bottom-6 left-5 text-right text-nowrap text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
		>
			SS Drumbo 001
		</div>

		<!-- the readout -->
		<div class="grid grid-cols-1 sm-device-window-bevel-md max-w-full w-full overflow-hidden">
			<div
				class="grid grid-cols-1 gap-y-2 device-screen max-w-full py-3 w-full md-flex md-flex-wrap md-items-baseline md-justify-between md-gap-x-4 md-gap-y-1 text-blue-100 font-mono tabular-nums overflow-hidden"
			>
				<!-- BPM Readout -->
				<div class="flex items-baseline gap-2">
					<span class="text-40px leading-none">{p.bpm}</span>
					<span class="text-13px opacity-70">bpm</span>
				</div>

				<!-- What the project is: the preset or saved beat it still matches, the open beat as edited, or Custom. -->
				<div class=" text-12px opacity-70 flex flex-wrap gap-x-2 gap-y-2">
					<span
						>{drumMachine.loadedName ?? (openBeat ? `${openBeat.name} · edited` : "Custom")}</span
					>
					<span>· pattern {drumMachine.current + 1} of {p.patterns.length}</span>

					<span class="block sm-inline">
						<span><span class="hidden sm-inline">·</span> {pattern.steps} steps</span>
						<span>· {kitLabel(p.kit)}</span>
					</span>
				</div>

				<!-- status -->
				<div
					class="text-12px opacity-70 mt-1 rounded border border-current/40 px-2 py-1 max-w-fit lg-min-w-164px lg-max-w-none lg-text-center"
					aria-live="polite"
				>
					{#if drumMachine.running && !drumMachine.kitReady}
						loading the kit…
					{:else if drumMachine.running && drumMachine.playsSong}
						bar {Math.max(1, drumMachine.bar + 1)} of {p.timeline.length}{drumMachine.queuedBar !==
						null
							? ` then ${drumMachine.queuedBar + 1}`
							: ""} · pattern {drumMachine.playing + 1} · step {drumMachine.step + 1}
					{:else if drumMachine.running}
						playing {drumMachine.playing + 1}{drumMachine.queued !== null
							? ` then ${drumMachine.queued + 1}`
							: ""} · step {drumMachine.step + 1}
					{:else}
						stopped
					{/if}
				</div>
			</div>
		</div>

		<!-- a phone: Play / Stop under the display too, a thumb away from the top of the grid (the foot has the other) -->
		<button
			class="sm-hidden device-button-sm md-device-button-lg w-full text-15px {drumMachine.running
				? 'text-accent'
				: ''}"
			type="button"
			aria-pressed={drumMachine.running}
			title="Play or stop"
			onclick={togglePlay}
		>
			<span class={drumMachine.running ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"
			></span>
			{drumMachine.running ? "Stop" : "Play"}
		</button>

		<!-- a phone's tempo, swing and humanize, in a menu beside Tap Tempo (the sliders show from sm up) -->
		{#snippet tempoItem()}
			<label class="grid gap-1 px-3 py-2 text-13px">
				<span>Tempo · {p.bpm} bpm</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min={DRUM_BPM_MIN}
					max={DRUM_BPM_MAX}
					step="1"
					value={p.bpm}
					oninput={(e) => drumMachine.setBpm(Number(e.currentTarget.value))}
					aria-label="Tempo in beats per minute"
				/>
			</label>
		{/snippet}
		{#snippet swingItem()}
			<label class="grid gap-1 px-3 py-2 text-13px">
				<span class="flex items-center"
					>Swing · {Math.round(p.swing * 100)}%<span
						class="ml-2 inline-flex gap-1 align-middle"
						role="group"
						aria-label="Swing grid"
					>
						{#each DRUM_SWING_GRIDS as g (g)}
							<button
								class="rounded px-1.5 py-0.5 text-11px leading-none {p.swingGrid === g
									? 'bg-accent text-oxford'
									: 'bg-dark/40 hover-bg-dark/60'}"
								type="button"
								aria-pressed={p.swingGrid === g}
								title={g === 16 ? "Swing every second sixteenth" : "Swing the off-beat eighths"}
								onclick={() => drumMachine.setSwingGrid(g)}>1/{g}</button
							>
						{/each}
					</span></span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(p.swing * 100)}
					oninput={(e) => drumMachine.setSwing(Number(e.currentTarget.value) / 100)}
					aria-label="Swing"
				/>
			</label>
		{/snippet}
		{#snippet fxItem()}
			<div class="px-3 py-2 text-13px [&_.device-button-label]-(text-current opacity-80)">
				<div class="text-11px uppercase tracking-wider opacity-60 mb-3">Effects</div>
				<div class="grid grid-cols-1 sm-grid-cols-2 gap-x-6 gap-y-3">
					<div class="grid gap-3 content-start">
						<div class="block text-blue-100/80" title="Delay time, in the beat">
							<span class="device-button-label">Delay</span>
							<ComboBox
								ariaLabel="Delay time"
								buttonClasses="!px-2 !py-1 !text-13px"
								options={DRUM_DELAY_TIMES.map((d) => ({ value: String(d.steps), label: d.label }))}
								value={String(p.fx.delayTime)}
								onchange={(v) => drumMachine.setFx({ delayTime: Number(v) as DrumDelayTime })}
							/>
						</div>
						<label class="block">
							<span class="device-button-label"
								>Feedback · {Math.round(p.fx.delayFeedback * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="90"
								step="1"
								value={Math.round(p.fx.delayFeedback * 100)}
								oninput={(e) =>
									drumMachine.setFx({ delayFeedback: Number(e.currentTarget.value) / 100 })}
								aria-label="Delay feedback"
							/>
						</label>
						<label class="block">
							<span class="device-button-label"
								>Delay level · {Math.round(p.fx.delayReturn * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(p.fx.delayReturn * 100)}
								oninput={(e) =>
									drumMachine.setFx({ delayReturn: Number(e.currentTarget.value) / 100 })}
								aria-label="Delay level"
							/>
						</label>
						<div class="flex gap-2" role="group" aria-label="Delay character">
							<button
								class="flex-1 device-button-xs border {p.fx.delayAnalog ? '' : 'text-accent'}"
								type="button"
								aria-pressed={!p.fx.delayAnalog}
								title="Clean repeats"
								onclick={() => drumMachine.setFx({ delayAnalog: false })}>Digital</button
							>
							<button
								class="flex-1 device-button-xs border {p.fx.delayAnalog ? 'text-accent' : ''}"
								type="button"
								aria-pressed={p.fx.delayAnalog}
								title="Tape-like repeats: each one darker and softer, with a slow wobble"
								onclick={() => drumMachine.setFx({ delayAnalog: true })}>Analog</button
							>
						</div>
					</div>
					<div class="grid gap-3 content-start">
						<label class="block">
							<span class="device-button-label"
								>Reverb size · {Math.round(p.fx.reverbSize * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(p.fx.reverbSize * 100)}
								oninput={(e) =>
									drumMachine.setFx({ reverbSize: Number(e.currentTarget.value) / 100 })}
								aria-label="Reverb size"
							/>
						</label>
						<label class="block">
							<span class="device-button-label"
								>Reverb level · {Math.round(p.fx.reverbReturn * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(p.fx.reverbReturn * 100)}
								oninput={(e) =>
									drumMachine.setFx({ reverbReturn: Number(e.currentTarget.value) / 100 })}
								aria-label="Reverb level"
							/>
						</label>
						<label class="block">
							<span class="device-button-label"
								>Fuzz drive · {Math.round(p.fx.fuzzDrive * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(p.fx.fuzzDrive * 100)}
								oninput={(e) =>
									drumMachine.setFx({ fuzzDrive: Number(e.currentTarget.value) / 100 })}
								aria-label="Fuzz drive"
							/>
						</label>
						<label class="block">
							<span class="device-button-label">Fuzz tone · {Math.round(p.fx.fuzzTone * 100)}%</span
							>
							<input
								class="w-full accent-maximumYellow"
								type="range"
								min="0"
								max="100"
								step="1"
								value={Math.round(p.fx.fuzzTone * 100)}
								oninput={(e) =>
									drumMachine.setFx({ fuzzTone: Number(e.currentTarget.value) / 100 })}
								aria-label="Fuzz tone"
							/>
						</label>
					</div>
				</div>
				<button
					class="device-button-xs px-3 justify-self-start mt-3"
					type="button"
					title="Master levels and the fuzz back to zero, the delay digital, every drum back to its usual sends"
					onclick={() => {
						drumMachine.resetFx();
						notify("Effects reset to their defaults");
					}}>Reset to defaults</button
				>
			</div>
		{/snippet}
		{#snippet midiItem()}
			<div
				class="grid gap-3 px-3 py-2 text-13px [&_.device-button-label]-(text-current opacity-80)"
			>
				<div class="text-11px uppercase tracking-wider opacity-60">MIDI in</div>
				{#if drumMachine.midiIn.status === "on"}
					<div class="text-blue-100/80">
						{drumMachine.midiIn.inputs.length
							? `Listening to ${drumMachine.midiIn.inputs.join(", ")}`
							: "Listening; plug a controller in"}
					</div>
					<button
						class="device-button-xs px-3 justify-self-start"
						type="button"
						onclick={() => drumMachine.disconnectMidi()}>Disconnect</button
					>
					<button
						class="device-button-xs px-3 justify-self-start {drumMachine.midiRecord
							? 'text-accent'
							: ''}"
						type="button"
						aria-pressed={drumMachine.midiRecord}
						title="While the beat plays, each pad hit lands in the grid at the nearest step"
						onclick={() => (drumMachine.midiRecord = !drumMachine.midiRecord)}
					>
						<span class="i-ph-record" aria-hidden="true"></span>
						Record hits into the grid
					</button>
				{:else}
					<div class="text-blue-100/80">
						{drumMachine.midiIn.status === "denied"
							? "The browser refused MIDI access."
							: "Pads and keys play the drums: General MIDI drum notes play their sounds, any other note plays the rows in order."}
					</div>
					<button
						class="device-button-xs px-3 justify-self-start"
						type="button"
						title="The browser asks once"
						onclick={() => void drumMachine.connectMidi()}>Connect MIDI</button
					>
				{/if}
			</div>
		{/snippet}
		{#snippet textToBeatItem()}
			<div
				class="grid gap-3 px-3 py-2 text-13px [&_.device-button-label]-(text-current opacity-80)"
			>
				<div class="text-11px uppercase tracking-wider opacity-60">Text-to-Beat</div>
				<label class="block">
					<span class="device-button-label">Describe the beat you want</span>
					<textarea
						class="field mt-1 min-h-20 resize-y text-13px"
						rows="3"
						placeholder="e.g. a laid-back boom bap with ghost notes on the snare, or a driving punk beat"
						maxlength="300"
						disabled={beatAsking}
						bind:value={beatPrompt}
						onkeydown={(e) => {
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								void makeBeat();
							}
						}}
						aria-label="Describe the beat you want"></textarea>
				</label>
				<label class="flex items-center gap-2 text-12px opacity-80">
					<input type="checkbox" class="accent-maximumYellow" bind:checked={beatAsNew} />
					As a new pattern (else it replaces the open one; Undo brings it back)
				</label>
				<div class="flex flex-wrap items-center gap-3">
					<button
						class="device-button-xs px-3"
						type="button"
						disabled={beatAsking || !beatPrompt.trim()}
						aria-busy={beatAsking}
						title="Ask the model; it fits the open pattern's meter and length"
						onclick={() => void makeBeat()}
					>
						{#if beatAsking}
							<span class="i-ph-circle-notch animate-spin" aria-hidden="true"></span>
							Asking the model…
						{:else}
							<span class="i-ph-sparkle" aria-hidden="true"></span>
							Make the beat
						{/if}
					</button>
				</div>
				{#if beatError}
					<p class="text-12px text-red-300" role="alert">{beatError}</p>
				{:else if beatNote}
					<p class="text-12px text-green-300" aria-live="polite">{beatNote}</p>
				{/if}
			</div>
		{/snippet}
		{#snippet generatorItem()}
			<div
				class="grid gap-3 px-3 py-2 text-13px [&_.device-button-label]-(text-current opacity-80)"
			>
				<div class="text-11px uppercase tracking-wider opacity-60">Random Beat Generator</div>
				<div class="block text-blue-100/80">
					<span class="device-button-label">Style</span>
					<ComboBox
						ariaLabel="Style"
						buttonClasses="!py-1 !text-13px w-full"
						options={GENERATOR_OPTIONS}
						value={generatorStyle}
						onchange={(v) => (generatorStyle = v)}
					/>
					<p class="mt-1 text-12px opacity-60">
						{DRUM_GENERATOR_STYLES.find((s) => s.id === generatorStyle)?.hint}
					</p>
				</div>
				<label class="block">
					<span class="device-button-label">Density · {Math.round(generatorDensity * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(generatorDensity * 100)}
						oninput={(e) => (generatorDensity = Number(e.currentTarget.value) / 100)}
						aria-label="Density"
					/>
				</label>
				<div class="flex flex-wrap gap-2">
					<button
						class="device-button-xs px-3"
						type="button"
						title="A new draw into the open pattern, in its meter and length; Undo brings yours back"
						onclick={() => generate("replace")}>Generate</button
					>
					<button
						class="device-button-xs px-3"
						type="button"
						disabled={p.patterns.length >= MAX_DRUM_PATTERNS}
						title="A new draw as a new pattern after this one"
						onclick={() => generate("add")}>Add as a pattern</button
					>
				</div>
			</div>
		{/snippet}
		{#snippet humanizeItem()}
			<label class="grid gap-1 px-3 py-2 text-13px {tutorial.control === 'humanize' ? HINT : ''}">
				<span>Humanize · {Math.round(p.humanize * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(p.humanize * 100)}
					oninput={(e) => drumMachine.setHumanize(Number(e.currentTarget.value) / 100)}
					aria-label="Humanize"
				/>
			</label>
		{/snippet}

		<!-- tempo and range controls -->
		<div
			class="grid grid-cols-1 sm-grid-cols-[auto_1fr] w-full sm-items-center justify-start gap-4"
		>
			<!-- tempo -->
			<div class="flex items-center gap-2">
				<button
					aria-label="Tempo"
					class="device-button-lg text-center text-14px sm-text-left sm-device-button-xs md-device-button-sm lg-device-button-lg px-3 md-min-w-30"
					type="button"
					onclick={() => drumMachine.tap()}
					title="Tap the tempo"
				>
					Tap Tempo
				</button>
				<div class="sm-hidden {tutorial.control === 'humanize' ? HINT : ''}">
					<ContextMenu
						ariaLabel="Tempo, swing and humanize"
						title="Tempo, swing and humanize"
						iconClass="i-ph-sliders-horizontal"
						buttonBaseClasses="device-button-lg !min-w-0 px-3"
						popoverClasses="min-w-64"
						items={[
							{ id: "tempo", kind: "snippet", snippet: tempoItem },
							{ id: "swing", kind: "snippet", snippet: swingItem },
							{ id: "humanize", kind: "snippet", snippet: humanizeItem },
						]}
					/>
				</div>
			</div>

			<!-- range controls -->
			<div class="hidden sm-grid gap-3 sm-grid-cols-3 sm-gap-6 text-dark">
				<label class="block">
					<span class="device-button-label">Tempo</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min={DRUM_BPM_MIN}
						max={DRUM_BPM_MAX}
						step="1"
						value={p.bpm}
						oninput={(e) => drumMachine.setBpm(Number(e.currentTarget.value))}
						aria-label="Tempo in beats per minute"
					/>
				</label>
				<label class="block">
					<span class="device-button-label flex items-center"
						>Swing · {Math.round(p.swing * 100)}%<span
							class="ml-2 inline-flex gap-1 align-middle"
							role="group"
							aria-label="Swing grid"
						>
							{#each DRUM_SWING_GRIDS as g (g)}
								<button
									class="rounded px-1.5 py-0.5 text-11px leading-none {p.swingGrid === g
										? 'bg-accent text-oxford'
										: 'bg-dark/40 hover-bg-dark/60'}"
									type="button"
									aria-pressed={p.swingGrid === g}
									title={g === 16 ? "Swing every second sixteenth" : "Swing the off-beat eighths"}
									onclick={() => drumMachine.setSwingGrid(g)}>1/{g}</button
								>
							{/each}
						</span></span
					>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(p.swing * 100)}
						oninput={(e) => drumMachine.setSwing(Number(e.currentTarget.value) / 100)}
						aria-label="Swing"
					/>
				</label>
				<label class="block {tutorial.control === 'humanize' ? HINT : ''}">
					<span class="device-button-label">Humanize · {Math.round(p.humanize * 100)}%</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(p.humanize * 100)}
						oninput={(e) => drumMachine.setHumanize(Number(e.currentTarget.value) / 100)}
						aria-label="Humanize"
					/>
				</label>
			</div>
		</div>

		<!-- kit, steps, meter and patterns -->
		<div
			class="gap-x-4 gap-y-2 md-pt-4 lg-pt-8 sm-grid sm-grid-cols-[auto_auto_auto_1fr] sm-gap-x-3 md-gap-x-4 mb-4"
		>
			<!-- kit selector -->
			<div class="sm-grid grid-cols-1" title="Kit">
				<div class="device-button-group-label">Kit</div>
				<ComboBox
					ariaLabel="Kit"
					clearDefaultButtonClasses={true}
					buttonClasses="device-button-drum-combo"
					options={KIT_OPTIONS}
					value={p.kit}
					onchange={(k) => drumMachine.setKit(k)}
				/>
			</div>

			<!-- steps -->
			<!-- put steps in context menu in mobile -->
			<div class="hidden sm-block">
				<div class="device-button-group-label">Steps</div>
				<div class="flex items-center gap-2 sm-gap-x-1 md-gap-x-2" role="group" aria-label="Steps">
					{#each drumStepsFor(pattern.meter) as n (n)}
						<button
							class="device-button-xs md-device-button-sm {pattern.steps === n
								? 'text-accent'
								: ''}"
							type="button"
							aria-pressed={pattern.steps === n}
							title="{n} steps, {stepsLabel(n)}"
							onclick={() => drumMachine.setSteps(n)}
						>
							{n}
						</button>
					{/each}
				</div>
			</div>

			<!-- meters -->
			<!-- put meters in context menu in mobile -->
			<div class="hidden sm-block">
				<div class="device-button-group-label">Meters</div>
				<div class="flex items-center gap-2 sm-gap-x-1 md-gap-x-2" role="group" aria-label="Meter">
					{#each DRUM_METERS as m (m.id)}
						<button
							class="device-button-xs md-device-button-sm {pattern.meter === m.id
								? 'text-accent'
								: ''}"
							type="button"
							aria-pressed={pattern.meter === m.id}
							title="{m.label} time"
							onclick={() => drumMachine.setMeter(m.id)}
						>
							{m.label}
						</button>
					{/each}
				</div>
			</div>

			<!-- Patterns -->
			<div class="w-full sm-w-auto gap-5 mt-5 sm-mt-0 sm-ml-auto">
				<div class="device-button-group-label">Patterns</div>
				<!-- the patterns: tabs, one open for editing; while playing, a chosen one waits for the end of the cycle -->
				<div
					class="ml-auto flex flex-wrap items-center gap-2 sm-ml-0 sm-gap-1 md-gap-2"
					role="group"
					aria-label="Patterns"
				>
					{#each p.patterns as _, i (i)}
						{@const open = drumMachine.current === i}
						{@const sounding = drumMachine.playing === i}
						{@const next = drumMachine.queued === i}
						<button
							class="device-button-sm sm-device-button-xs md-device-button-sm relative {open
								? 'text-accent'
								: ''} {next ? 'ring-1 ring-accent' : ''}"
							type="button"
							aria-pressed={open}
							aria-label="Pattern {i + 1}{sounding ? ', playing' : ''}{next ? ', next' : ''}"
							title={next
								? "Next, at the end of the cycle"
								: sounding
									? "Playing"
									: "Open this pattern"}
							onclick={() => drumMachine.select(i)}
						>
							{i + 1}
							{#if sounding}
								<span
									class="absolute right-1 top-1 block h-1.5 w-1.5 rounded-full bg-green-400"
									aria-hidden="true"
								></span>
							{/if}
						</button>
					{/each}
					<button
						class="device-button-sm sm-device-button-xs md-device-button-sm"
						type="button"
						disabled={p.patterns.length >= MAX_DRUM_PATTERNS}
						title="A new, empty pattern with these rows"
						aria-label="New pattern"
						onclick={() => drumMachine.addPattern(false)}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm sm-device-button-xs md-device-button-sm {tutorial.control ===
						'copy'
							? HINT
							: ''}"
						type="button"
						disabled={p.patterns.length >= MAX_DRUM_PATTERNS}
						title="A copy of this pattern"
						aria-label="Copy pattern"
						onclick={() => drumMachine.addPattern(true)}
					>
						<span class="i-ph-copy" aria-hidden="true"></span>
					</button>
					<button
						class="device-button-sm sm-device-button-xs md-device-button-sm"
						type="button"
						disabled={p.patterns.length <= 1}
						title="Delete this pattern"
						aria-label="Delete pattern {drumMachine.current + 1}"
						onclick={() => drumMachine.removePattern(drumMachine.current)}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
					</button>
				</div>
			</div>
		</div>

		<!-- the timeline: bars, each a pattern, making a song; in song mode Play follows it, in pattern mode it loops the open pattern.
		     Hidden for now (Kevin is refining its design); everything behind it works, and a link or beat with a timeline still plays as a song. -->
		<div class="mt-4 hidden flex-wrap items-center gap-x-4 gap-y-2">
			<div class="device-button-group-label !mb-0">Timeline</div>
			<div class="flex items-stretch gap-1" role="group" aria-label="Play mode">
				<button
					class="device-button-xs px-2 {drumMachine.playsSong ? '' : 'text-accent'}"
					type="button"
					aria-pressed={!drumMachine.playsSong}
					title="Loop the open pattern"
					onclick={() => drumMachine.setSongMode(false)}>Pattern</button
				>
				<button
					class="device-button-xs px-2 {drumMachine.playsSong ? 'text-accent' : ''}"
					type="button"
					disabled={p.timeline.length === 0}
					aria-pressed={drumMachine.playsSong}
					title="Play the timeline, bar after bar"
					onclick={() => drumMachine.setSongMode(true)}>Song</button
				>
			</div>
			<div class="flex flex-wrap items-center gap-1" role="group" aria-label="Bars">
				{#each p.timeline as bar, i (i)}
					{@const sounding = drumMachine.playsSong && drumMachine.bar === i}
					{@const next = drumMachine.queuedBar === i}
					<span
						class="flex items-stretch overflow-hidden rounded-md {sounding
							? 'ring-1 ring-green-400'
							: next
								? 'ring-1 ring-accent'
								: ''}"
					>
						<button
							class="device-button-xs !rounded-none px-2 {drumMachine.current === bar
								? 'text-accent'
								: ''}"
							type="button"
							aria-label="Bar {i + 1}, pattern {bar + 1}{sounding ? ', playing' : ''}{next
								? ', next'
								: ''}"
							title="Go to this bar and open its pattern · shift + arrow keys move the bar"
							onclick={() => drumMachine.goToBar(i)}
							onkeydown={(e) => {
								if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
								e.preventDefault();
								drumMachine.moveBar(i, e.key === "ArrowLeft" ? -1 : 1);
							}}>{bar + 1}</button
						>
						<button
							class="device-button-xs !min-w-auto !rounded-none px-1.5 opacity-60 hover-opacity-100"
							type="button"
							aria-label="Remove bar {i + 1}"
							title="Remove this bar"
							onclick={() => drumMachine.removeBar(i)}
						>
							<span class="i-ph-x text-10px" aria-hidden="true"></span>
						</button>
					</span>
				{/each}
				<button
					class="device-button-xs px-2"
					type="button"
					disabled={p.timeline.length >= MAX_DRUM_TIMELINE}
					aria-label="Add pattern {drumMachine.current + 1} as a bar"
					title="The open pattern as the next bar"
					onclick={() => drumMachine.appendBar()}
				>
					<span class="i-ph-plus" aria-hidden="true"></span>
					{drumMachine.current + 1}
				</button>
				{#if p.timeline.length}
					<button
						class="device-button-xs px-2"
						type="button"
						title="Empty the timeline; the patterns stay"
						onclick={() => drumMachine.clearTimeline()}>Clear</button
					>
				{:else}
					<span class="text-12px opacity-60">Add bars of the open pattern to arrange a song.</span>
				{/if}
			</div>
		</div>

		<hr class="text-dark/20" />

		<!-- the grid -->
		<div
			class="grid grid-cols-1 gap-y-6 mb-8 w-full"
			aria-label="Pattern {drumMachine.current + 1}"
		>
			{#each pattern.rows as row, r (r)}
				<div
					class="
						gap-x-4
						gap-y-3
						grid
						grid-cols-1
						items-center
						w-full
						sm-grid-cols-[auto_1fr]
						sm-gap-x-4"
					aria-label={voiceLabel(row.voice)}
				>
					<!-- voice & controls -->
					<div
						class="gap-2 grid grid-cols-[1fr_auto] items-center sm-grid sm-grid-cols-[100px_auto] sm-gap-1 sm-gap-x-2 md-gap-y-3 md-gap-x-4 md-grid-cols-[120px_auto] lg-grid-cols-[120px_auto_auto]"
					>
						<!-- voice -->
						<ComboBox
							ariaLabel="Voice of row {r + 1}"
							clearDefaultButtonClasses={true}
							buttonClasses="device-button-drum-combo"
							options={VOICE_OPTIONS}
							value={row.voice}
							onchange={(v) => drumMachine.setVoice(r, v)}
						/>

						<!-- mute, solo, clear  -->
						<div class="w-full flex items-center gap-2 sm-gap-x-1 md-gap-2">
							<button
								class="device-button-xs md-device-button-sm {row.mute ? 'text-accent' : ''}"
								type="button"
								aria-pressed={row.mute}
								aria-label="Mute {voiceLabel(row.voice)}"
								title="Mute"
								onclick={() => drumMachine.toggleMute(r)}>M</button
							>
							<button
								class="device-button-xs md-device-button-sm {drumMachine.solo[r]
									? 'text-accent'
									: ''}"
								type="button"
								aria-pressed={drumMachine.solo[r] ?? false}
								aria-label="Solo {voiceLabel(row.voice)}"
								title="Solo"
								onclick={() => drumMachine.toggleSolo(r)}>S</button
							>
							<button
								class="device-button-xs md-device-button-sm"
								type="button"
								aria-label="Remove {voiceLabel(row.voice)}"
								title="Remove the row"
								disabled={pattern.rows.length <= 1}
								onclick={() => drumMachine.removeRow(r)}
							>
								<span class="i-ph-x-bold" aria-hidden="true"></span>
							</button>
							<!-- below lg the row's level and pan live in a menu (the sliders show from lg up) -->
							{#snippet rowMix()}
								<div class="grid gap-3 px-3 py-2 w-56">
									<label class="grid gap-1 text-13px lg-hidden">
										<span>Level · {Math.round(row.level * 100)}%</span>
										<input
											class="w-full accent-maximumYellow"
											type="range"
											min="0"
											max="1"
											step="0.01"
											value={row.level}
											oninput={(e) => drumMachine.setLevel(r, Number(e.currentTarget.value))}
											aria-label="Level of {voiceLabel(row.voice)}"
										/>
									</label>
									<label class="grid gap-1 text-13px lg-hidden">
										<span
											>Pan · {row.pan === 0
												? "centre"
												: row.pan < 0
													? `L${Math.round(-row.pan * 100)}`
													: `R${Math.round(row.pan * 100)}`}</span
										>
										<input
											class="w-full accent-blue-300"
											type="range"
											min="-1"
											max="1"
											step="0.01"
											value={row.pan}
											oninput={(e) => drumMachine.setPan(r, Number(e.currentTarget.value))}
											ondblclick={() => drumMachine.setPan(r, 0)}
											aria-label="Pan of {voiceLabel(row.voice)}"
										/>
									</label>
									<label class="grid gap-1 text-13px">
										<span>Delay send · {Math.round(row.delaySend * 100)}%</span>
										<input
											class="w-full accent-maximumYellow"
											type="range"
											min="0"
											max="100"
											step="1"
											value={Math.round(row.delaySend * 100)}
											oninput={(e) =>
												drumMachine.setSend(r, "delaySend", Number(e.currentTarget.value) / 100)}
											aria-label="Delay send of {voiceLabel(row.voice)}"
										/>
									</label>
									<label class="grid gap-1 text-13px">
										<span>Reverb send · {Math.round(row.reverbSend * 100)}%</span>
										<input
											class="w-full accent-maximumYellow"
											type="range"
											min="0"
											max="100"
											step="1"
											value={Math.round(row.reverbSend * 100)}
											oninput={(e) =>
												drumMachine.setSend(r, "reverbSend", Number(e.currentTarget.value) / 100)}
											aria-label="Reverb send of {voiceLabel(row.voice)}"
										/>
									</label>
								</div>
							{/snippet}
							<div>
								<ContextMenu
									ariaLabel="Mix of {voiceLabel(row.voice)}"
									title="Level, pan and effect sends"
									iconClass="i-ph-sliders-horizontal"
									buttonBaseClasses="device-button-xs md-device-button-sm"
									items={[{ id: "mix", kind: "snippet", snippet: rowMix }]}
								/>
							</div>
						</div>

						<!-- volume & pan  > md -->
						<div class="hidden lg-grid grid-cols-2 gap-3 sm-w-112px">
							<!-- volume -->
							<div class="h-38.5px flex items-center relative w-full overflow-visible">
								<input
									class="w-full accent-maximumYellow"
									type="range"
									min="0"
									max="1"
									step="0.01"
									value={row.level}
									oninput={(e) => drumMachine.setLevel(r, Number(e.currentTarget.value))}
									aria-label="Level of {voiceLabel(row.voice)}"
									title="Level"
								/>
							</div>

							<!--pan -->
							<div class="h-38.5px flex items-center relative w-full overflow-visible">
								<input
									class="hidden sm-block w-full accent-blue-300"
									type="range"
									min="-1"
									max="1"
									step="0.01"
									value={row.pan}
									oninput={(e) => drumMachine.setPan(r, Number(e.currentTarget.value))}
									ondblclick={() => drumMachine.setPan(r, 0)}
									aria-label="Pan of {voiceLabel(row.voice)}"
									title="Pan (double-click for the centre)"
								/>
							</div>
						</div>
					</div>

					<!-- events. A sounding cell stays lit under the pointer (a touch less opaque, so the hover reads): the device button's hover colour is for the empty ones. -->
					<div class="grid {lineClasses} gap-1 md-gap-6px lg-gap-2 touch-pan-y">
						{#each row.cells as cell, s (s)}
							{@const now = drumMachine.step === s && drumMachine.playing === drumMachine.current}
							{@const offBeat = Math.floor(s / group) % 2 === 1}
							<button
								class="device-button-xs !min-w-auto md-device-button-sm transition-colors duration-75 {cell ===
								3
									? 'bg-accent border-white hover-!bg-accent/85'
									: cell === 2
										? 'bg-accent border-accent hover-!bg-accent/85'
										: cell === 1
											? 'bg-accent/40 border-accent/50 hover-!bg-accent/30'
											: offBeat
												? 'bg-dark/60 border-white/10'
												: 'bg-dark/30 border-white/10'} {now
									? 'ring-2 ring-blue-100 ring-inset'
									: ''} {hintedCells?.has(`${row.voice}:${s}`) ? HINT : ''}"
								type="button"
								aria-pressed={cell > 0}
								aria-label="{voiceLabel(row.voice)}, step {s + 1}{cell === 3
									? ', accent'
									: cell === 1
										? ', ghost'
										: ''}"
								title={cell ? "Hold, shift-click or right-click for the velocity" : undefined}
								data-row={r}
								data-step={s}
								onpointerdown={(e) => press(e, r, s, cell)}
								oncontextmenu={(e) => {
									e.preventDefault();
									drumMachine.cycleVelocity(r, s);
								}}
							></button>
						{/each}
					</div>
				</div>
			{/each}
		</div>

		<!-- Pattern & Transport -->
		<div class="grid grid-cols-1 gap-y-5 sm-flex justify-between">
			<!-- grid controls -->
			<div class="flex flex-wrap items-center gap-2 sm-gap-x-2 md-gap-x-3">
				<!-- add row -->
				<button
					class="device-button-xs px-3 md-device-button-sm"
					type="button"
					disabled={pattern.rows.length >= MAX_DRUM_ROWS}
					onclick={() => drumMachine.addRow()}
				>
					<span class="i-ph-plus" aria-hidden="true"></span>
					Row
				</button>

				<!-- clear -->
				<button
					class="device-button-xs px-3 md-device-button-sm"
					type="button"
					onclick={() => drumMachine.clear()}
					title="Every cell off"
				>
					Clear
				</button>

				<!-- undo -->
				<button
					class="device-button-xs px-3 md-device-button-sm disabled-opacity-40"
					type="button"
					disabled={!drumMachine.beforePreset}
					onclick={() => drumMachine.undoPreset()}
					title="Back to the beat you had before a preset or a saved beat loaded"
				>
					<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
					Undo
				</button>

				<!-- the effects: delay and reverb settings in a menu; a beat is dry until their levels come up, and the button lights while either is up -->
				<ContextMenu
					ariaLabel="Effects"
					position="top right"
					title="Delay, reverb and fuzz: turn a level up to hear it"
					iconClass="i-ph-sliders-horizontal"
					label="Effects"
					buttonBaseClasses="device-button-xs px-3 md-device-button-sm"
					buttonClasses={p.fx.delayReturn > 0 || p.fx.reverbReturn > 0 || p.fx.fuzzDrive > 0
						? "text-accent"
						: ""}
					popoverClasses="min-w-72 sm-min-w-140 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[{ id: "fx", kind: "snippet", snippet: fxItem }]}
				/>
				{#if midiSupported}
					<!-- MIDI in: pads play the drums, and with record on land in the grid (docs/drum-machine.md, "MIDI input") -->
					<ContextMenu
						ariaLabel="MIDI"
						position="top left"
						title="Play the drums from a MIDI pad or keyboard"
						iconClass="i-ph-usb"
						label="MIDI"
						buttonBaseClasses="device-button-xs px-3 md-device-button-sm"
						buttonClasses={drumMachine.midiIn.status === "on" ? "text-accent" : ""}
						popoverClasses="min-w-72"
						items={[{ id: "midi", kind: "snippet", snippet: midiItem }]}
					/>
				{/if}
				<ContextMenu
					ariaLabel="More"
					position="top left"
					title="Save, share and download"
					buttonBaseClasses="device-button-xs px-3 md-device-button-sm "
					popoverClasses="max-h-[min(70vh,100%)] overflow-y-auto min-w-64"
					items={moreItems}
				/>
			</div>

			<!-- transport -->
			<div
				class="grid grid-cols-1 sm-flex items-center gap-5 mt-5 sm-mt-0 sm-gap-2 md-gap-3 mb-8 sm-mb-0"
			>
				{#if textToBeat}
					<!-- Text-to-Beat: a description to a model, a pattern back (docs/drum-machine.md) -->
					<ContextMenu
						ariaLabel="Text-to-Beat"
						position="top left"
						title="Describe the beat you want"
						iconClass="i-ph-sparkle"
						label="Text-to-Beat"
						buttonBaseClasses="device-button-lg sm-device-button-xs px-3 md-device-button-sm"
						popoverClasses="min-w-80"
						items={[{ id: "text-to-beat", kind: "snippet", snippet: textToBeatItem }]}
					/>
				{/if}
				<!-- the generator: a pattern drawn from a style at a density, in the open pattern's shape -->
				<ContextMenu
					ariaLabel="Generate"
					position="top left"
					title="Generate a pattern from a style"
					iconClass="i-ph-shuffle"
					label="Generate"
					buttonBaseClasses="device-button-lg sm-device-button-xs px-3 md-device-button-sm"
					popoverClasses="min-w-72"
					items={[{ id: "generator", kind: "snippet", snippet: generatorItem }]}
				/>
				<div
					class=""
					onpointerdown={(e) => (addPresets = e.shiftKey)}
					onkeydown={(e) => (addPresets = e.shiftKey)}
					role="presentation"
				>
					<ContextMenu
						ariaLabel="Presets"
						position="top left"
						title="Preset beats"
						iconClass="i-ph-music-notes"
						label="Presets"
						buttonBaseClasses="device-button-lg sm-device-button-xs px-3 md-device-button-sm "
						popoverClasses="max-h-[min(70vh,100%)] overflow-y-auto min-w-64"
						items={presetItems}
					/>
				</div>

				<button
					class="device-button-lg sm-device-button-xs px-3 md-device-button-sm lg-device-button-lg {drumMachine.running
						? 'text-accent'
						: ''} {tutorial.control === 'play' ? HINT : ''}"
					type="button"
					aria-pressed={drumMachine.running}
					title="Play or stop (space)"
					onclick={togglePlay}
				>
					<span class={drumMachine.running ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"
					></span>
					{drumMachine.running ? "Stop" : "Play"}
				</button>
			</div>
		</div>
	</div>
{/if}
