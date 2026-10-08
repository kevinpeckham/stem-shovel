<script lang="ts">
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { progressionPad } from "#lib/audio/progression.svelte.js";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import {
		deleteProgression,
		renameProgression,
		saveProgression,
	} from "#lib/remote/progressions.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { DEMO_PROGRESSIONS, type DemoProgression } from "#lib/constants/demoProgressions.js";
	import { textToChords as askForChords } from "#lib/remote/textToChords.remote.js";
	import { chordPlayer } from "#lib/audio/chordPlayer.svelte.js";
	import { measuresOf, type ChordBeats } from "#lib/utils/chordRhythm.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import type { SavedProgression } from "#lib/val/ProgressionSchema.js";

	/**
	 * The progression pad under the circle (docs/chord-player.md, "The
	 * progression pad"): the chords jotted as they are played, by measure,
	 * each with its beats; a tap picks one to change its length, make it a
	 * rest or drop it. Play runs the progression through the chord player
	 * with a click; Export saves it as MIDI; a member keeps it in the
	 * account by name.
	 */
	interface Props {
		account?: { id: string; name: string; canEdit: boolean } | null;
		/** The account's saved progressions (bound, so the page's notes panel and the pad share one list). */
		saved?: SavedProgression[];
		/** Text-to-Progression is on (docs/chord-player.md): a Describe menu beside Demos asks a model for a progression. */
		textToChords?: boolean;
	}
	let { account = null, saved = $bindable([]), textToChords = false }: Props = $props();
	let saving = $state(false);

	const pad = progressionPad;

	// Text-to-Progression (docs/chord-player.md): the description and the request in flight; the answer lands on the pad as a demo does, learn mode off, ready to Play.
	let chordsPrompt = $state("");
	let chordsAsking = $state(false);
	let chordsNote = $state("");
	let chordsError = $state("");
	async function makeProgression() {
		const prompt = chordsPrompt.trim();
		if (!prompt || chordsAsking) return;
		chordsAsking = true;
		chordsError = "";
		chordsNote = "";
		try {
			const reply = await askForChords({
				prompt,
				beatsPerBar: metronome.beatsPerBar === 3 ? 3 : 4,
				key: chordPlayer.keyCenter,
				style: chordPlayer.style,
			});
			const demo: DemoProgression = {
				id: "text-to-chords",
				name: reply.name,
				hint: reply.note,
				bpm: reply.bpm ?? metronome.bpm,
				beatsPerBar: metronome.beatsPerBar,
				chords: reply.chords,
				setup: {
					...reply.setup,
					...(reply.style ? { style: reply.style } : {}),
					...(reply.keyCenter === null ? {} : { keyCenter: reply.keyCenter }),
				},
			};
			pad.loadDemo(demo);
			pad.setLearn(false);
			chordsNote = [reply.note, reply.bpm ? `${reply.bpm} bpm` : ""].filter(Boolean).join(" · ");
			notify(`${reply.name} is on the pad: press Play, or Learn to play it yourself`);
		} catch (e) {
			chordsError = errorMessage(e);
		} finally {
			chordsAsking = false;
		}
	}
	const measures = $derived(measuresOf(pad.entries, metronome.beatsPerBar));
	/** The entry's index in the pad for each measure's entries, so a tap finds it. */
	const indexed = $derived.by(() => {
		let i = 0;
		return measures.map((bar) => bar.map(() => i++));
	});
	const selectedEntry = $derived(pad.selected >= 0 ? (pad.entries[pad.selected] ?? null) : null);
	const openRow = $derived(pad.savedId ? (saved.find((p) => p.id === pad.savedId) ?? null) : null);
	const BEATS: ChordBeats[] = [1, 2, 4];

	function exportMidi() {
		if (pad.entries.length === 0) return;
		const a = document.createElement("a");
		a.href = URL.createObjectURL(pad.midi());
		a.download = `${(pad.name || "progression").replace(/[^\w.-]+/g, "-")}.mid`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
	}

	async function save(asNew = false) {
		if (!account || !pad.hasContent) return;
		const id = asNew ? undefined : (openRow?.id ?? undefined);
		let name = id ? openRow!.name : "";
		if (!name) {
			name =
				window.prompt("Name this progression", `Progression ${saved.length + 1}`)?.trim() ?? "";
			if (!name) return;
		}
		saving = true;
		try {
			const data = $state.snapshot(pad.data);
			const notes = pad.notes;
			const row = await saveProgression({ accountId: account.id, id, name, data, notes });
			const entry = { id: row.id, name: row.name, data, notes, updatedAt: new Date(row.updatedAt) };
			saved = [entry, ...saved.filter((p) => p.id !== row.id)];
			pad.saved({ id: row.id, name: row.name });
			notify(id ? `${row.name} saved` : `${row.name} saved to ${account.name}`);
		} catch (e) {
			notify(`Could not save the progression: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	function open(p: SavedProgression) {
		pad.open($state.snapshot(p.data), { id: p.id, name: p.name, notes: p.notes });
		notify(`${p.name} loaded`);
	}
	async function rename(p: SavedProgression) {
		const name = window.prompt("Rename the progression", p.name)?.trim();
		if (!name || name === p.name) return;
		try {
			const row = await renameProgression({ id: p.id, name });
			saved = saved.map((s) => (s.id === row.id ? { ...s, name: row.name } : s));
			if (pad.savedId === row.id) pad.saved({ id: row.id, name: row.name });
		} catch (e) {
			notify(`Could not rename the progression: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function remove(p: SavedProgression) {
		if (!window.confirm(`Delete "${p.name}" from ${account?.name}?`)) return;
		try {
			await deleteProgression({ id: p.id });
			saved = saved.filter((s) => s.id !== p.id);
			pad.detach(p.id);
			notify(`${p.name} deleted`);
		} catch (e) {
			notify(`Could not delete the progression: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	const beatsLabel = (n: number) => (n === 1 ? "1 beat" : `${n} beats`);
</script>

<div class="grid gap-2" role="group" aria-label="Progression pad">
	<!-- the pad's controls -->
	<div class="flex flex-wrap items-center gap-1.5 @xl-gap-2">
		<button
			class="device-button-sm px-3 {pad.jot ? 'text-accent' : ''}"
			type="button"
			aria-pressed={pad.jot}
			title={pad.jot
				? "Chords played on the circle are written to the pad; click to stop jotting"
				: "Write chords played on the circle to the pad"}
			onclick={() => pad.setJot(!pad.jot)}
		>
			<span class="i-ph-pencil-simple-line" aria-hidden="true"></span>
			<span class="hidden @xl-inline">Jot</span>
		</button>
		<button
			class="device-button-sm px-3 {pad.playing ? 'text-accent' : ''}"
			type="button"
			aria-pressed={pad.playing}
			aria-label={pad.playing ? "Stop" : "Play the progression"}
			title={pad.playing ? "Stop" : "Play the progression"}
			disabled={pad.entries.length === 0}
			onclick={() => pad.toggle()}
		>
			<span class={pad.playing ? "i-ph-stop-fill" : "i-ph-play-fill"} aria-hidden="true"></span>
			<span class="hidden @xl-inline">{pad.playing ? "Stop" : "Play"}</span>
		</button>
		<button
			class="device-button-sm px-3 {pad.loop ? 'text-accent' : ''}"
			type="button"
			aria-pressed={pad.loop}
			aria-label="Loop"
			title={pad.loop ? "Playing round and round; click to play once" : "Play round and round"}
			onclick={() => pad.setLoop(!pad.loop)}
		>
			<span class="i-ph-repeat" aria-hidden="true"></span>
			<span class="hidden @xl-inline">Loop</span>
		</button>
		<button
			class="device-button-sm px-3"
			type="button"
			aria-label="Undo"
			title="Undo the last change to the pad"
			disabled={!pad.canUndo}
			onclick={() => pad.undo()}
		>
			<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
			<span class="hidden @xl-inline">Undo</span>
		</button>
		<button
			class="device-button-sm px-3"
			type="button"
			aria-label="Clear the pad"
			title="Clear the pad (Undo brings it back)"
			disabled={pad.entries.length === 0}
			onclick={() => pad.clear()}
		>
			<span class="i-ph-eraser" aria-hidden="true"></span>
			<span class="hidden @xl-inline">Clear</span>
		</button>
		<button
			class="device-button-sm px-3"
			type="button"
			aria-label="Export as MIDI"
			title="Save the progression as a MIDI file"
			disabled={pad.entries.length === 0}
			onclick={exportMidi}
		>
			<span class="i-ph-download-simple" aria-hidden="true"></span>
			<span class="hidden @xl-inline">MIDI</span>
		</button>
		<button
			class="device-button-sm px-3 {pad.learn ? 'text-accent' : ''}"
			type="button"
			aria-pressed={pad.learn}
			aria-label="Learn mode"
			title={pad.learn
				? "Learn mode on: the circle outlines the next chord and waits for it; click to stop"
				: "Learn the progression: the circle outlines each chord in turn and waits for you to play it"}
			disabled={pad.entries.length === 0}
			onclick={() => pad.setLearn(!pad.learn)}
		>
			<span class="i-ph-student" aria-hidden="true"></span>
			<span class="hidden @xl-inline">Learn</span>
		</button>
		{#if textToChords}
			<!-- Text-to-Progression: a description to a model, a progression back on the pad (docs/chord-player.md) -->
			<ContextMenu
				ariaLabel="Describe a progression"
				title="Describe the progression you want; a model writes it onto the pad"
				iconClass="i-ph-sparkle"
				label="Describe"
				position="bottom left"
				buttonBaseClasses="device-button-sm px-3"
				popoverClasses="min-w-80 max-w-md"
				items={[{ id: "describe", kind: "snippet", snippet: describeBlock }]}
			/>
		{/if}
		<ContextMenu
			ariaLabel="Demo progressions"
			title="Progressions to learn and to hear, in the key the circle is turned to"
			iconClass="i-ph-book-open-text"
			label="Demos"
			position="bottom left"
			buttonBaseClasses="device-button-sm px-3"
			popoverClasses="min-w-80 max-w-md !max-h-[calc(100%-0.5rem)] overflow-y-auto"
			items={[
				{ id: "demos-heading", kind: "heading", label: "Demo progressions" },
				{ id: "demos-block", kind: "snippet", snippet: demosBlock },
			]}
		/>
		{#if account}
			<ContextMenu
				ariaLabel="Saved progressions"
				title="Save the progression to {account.name}, or open a saved one"
				iconClass="i-ph-bookmarks-simple"
				label={openRow ? openRow.name : "Saved"}
				position="bottom left"
				buttonBaseClasses="device-button-sm px-3 max-w-40 truncate"
				popoverClasses="min-w-72 max-w-sm !max-h-[calc(100%-0.5rem)] overflow-y-auto"
				items={[
					{ id: "saved-heading", kind: "heading", label: "Saved progressions" },
					{ id: "saved-block", kind: "snippet", snippet: savedBlock },
				]}
			/>
		{/if}
		<div class="ml-auto text-12px text-dark opacity-80 tabular-nums">
			{#if pad.entries.length > 0}
				{measures.length} {measures.length === 1 ? "bar" : "bars"} · {beatsLabel(pad.totalBeats)}
			{:else}
				empty
			{/if}
		</div>
	</div>

	<!-- the entries, by measure -->
	<div
		class="device-window-bevel-md"
		aria-live="polite"
		aria-label="Jotted chords"
		data-pad-entries
	>
		<div
			class="device-screen min-h-12 px-3 py-2 flex flex-wrap items-center gap-y-2 gap-x-1 text-14px"
		>
			{#if pad.entries.length === 0}
				<span class="opacity-60 text-13px py-1"
					>{pad.jot
						? "Play chords on the circle to jot them here: each lasts until the next, a long silence is a rest."
						: "Switch Jot on and play chords on the circle to write them here."}</span
				>
			{:else}
				{#each measures as bar, m (m)}
					{#if m > 0}<span class="opacity-40 px-1 select-none" aria-hidden="true">|</span>{/if}
					{#each bar as entry, k (indexed[m][k])}
						{@const i = indexed[m][k]}
						<button
							class="rounded px-2 py-0.5 border transition-colors tabular-nums {pad.playingIndex ===
							i
								? 'bg-accent text-oxford border-accent'
								: pad.learnTarget?.index === i
									? 'border-accent text-accent ring-1 ring-accent'
									: pad.selected === i
										? 'border-accent text-accent'
										: 'border-current/25 hover-border-current/60'} {entry.kind === 'rest'
								? 'opacity-70'
								: ''}"
							type="button"
							aria-pressed={pad.selected === i}
							aria-label="{entry.kind === 'chord' ? entry.label : 'rest'}, {beatsLabel(
								entry.beats,
							)}"
							title="{entry.kind === 'chord' ? entry.label : 'Rest'} · {beatsLabel(entry.beats)}"
							onclick={() => pad.select(i)}
						>
							<span>{entry.kind === "chord" ? entry.label : "–"}</span>
							<span class="ml-1 text-10px opacity-70">{"·".repeat(entry.beats)}</span>
						</button>
					{/each}
				{/each}
			{/if}
		</div>
	</div>

	<!-- the picked entry -->
	{#if selectedEntry}
		<div class="flex flex-wrap items-center gap-2 text-13px" role="group" aria-label="Picked entry">
			<span class="text-dark opacity-80 min-w-16"
				>{selectedEntry.kind === "chord" ? selectedEntry.label : "Rest"}</span
			>
			<div class="flex gap-px" role="group" aria-label="Beats">
				{#each BEATS as n (n)}
					<button
						class="device-button-sm px-3 {n === 1
							? 'rounded-r-none'
							: n === 4
								? 'rounded-l-none'
								: 'rounded-none'} {selectedEntry.beats === n ? 'text-accent' : ''}"
						type="button"
						aria-pressed={selectedEntry.beats === n}
						aria-label={beatsLabel(n)}
						onclick={() => pad.setBeats(pad.selected, n)}>{n}</button
					>
				{/each}
			</div>
			{#if selectedEntry.kind === "chord"}
				<button
					class="device-button-sm px-3"
					type="button"
					title="A rest in its place"
					onclick={() => pad.toRest(pad.selected)}>Rest</button
				>
			{/if}
			<button
				class="device-button-sm px-3"
				type="button"
				title="Drop it from the pad"
				onclick={() => pad.removeAt(pad.selected)}>Remove</button
			>
			<button
				class="device-button-sm px-2"
				type="button"
				aria-label="Done"
				title="Done"
				onclick={() => pad.select(pad.selected)}
			>
				<span class="i-ph-x" aria-hidden="true"></span>
			</button>
		</div>
	{/if}
</div>

{#snippet describeBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-3 text-13px">
		<div class="text-11px uppercase tracking-wider opacity-60">Text-to-Progression</div>
		<label class="block">
			<span class="block mb-1 text-blue-100/90">Describe the progression you want</span>
			<textarea
				class="device-field w-full min-h-20 resize-y text-13px"
				rows="3"
				placeholder="e.g. a wistful indie verse in a minor key, a twelve-bar blues with a quick change, or a jazz turnaround with a tritone sub"
				maxlength="300"
				disabled={chordsAsking}
				bind:value={chordsPrompt}
				onkeydown={(e) => {
					if (e.key === "Enter" && !e.shiftKey) {
						e.preventDefault();
						void makeProgression();
					}
				}}
				aria-label="Describe the progression you want"></textarea>
		</label>
		<p class="text-12px opacity-70 -mt-1">
			It lands on the pad in your key and meter, and the model sets the player up for it when the
			description calls for it: the sound, style, voicing, strum, arpeggiator, key, tempo, octave,
			sustain and effects. Undo brings the last progression back.
		</p>
		<div class="flex flex-wrap items-center gap-3">
			<button
				class="device-button-xs px-3"
				type="button"
				disabled={chordsAsking || !chordsPrompt.trim()}
				aria-busy={chordsAsking}
				onclick={() => void makeProgression()}
			>
				{#if chordsAsking}
					<span class="i-ph-circle-notch animate-spin" aria-hidden="true"></span>
					Asking the model…
				{:else}
					<span class="i-ph-sparkle" aria-hidden="true"></span>
					Make the progression
				{/if}
			</button>
		</div>
		{#if chordsError}
			<p class="text-12px text-red-300" role="alert">{chordsError}</p>
		{:else if chordsNote}
			<p class="text-12px text-green-300" aria-live="polite">{chordsNote}</p>
		{/if}
	</div>
{/snippet}

{#snippet demosBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-2 text-13px">
		<p class="text-12px opacity-70">
			A progression onto the pad in your key, with learn mode on: the circle outlines each chord in
			turn and waits for you to play it. Press Play to hear it instead. Switch the style first for
			the chords it wants.
		</p>
		<ul class="grid gap-1" aria-label="Demo progressions">
			{#each DEMO_PROGRESSIONS as demo (demo.id)}
				<li>
					<button
						class="w-full text-left rounded px-2 py-1.5 hover-bg-white/10 grid gap-0.5"
						type="button"
						onclick={() => {
							pad.loadDemo(demo);
							notify(`${demo.name} on the pad: play the outlined chords`);
						}}
					>
						<span class="font-600">{demo.name}</span>
						<span class="text-12px opacity-70"
							>{demo.hint} · {demo.bpm} bpm, {demo.beatsPerBar}/4</span
						>
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/snippet}

{#snippet savedBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-3 text-13px">
		{#if account?.canEdit}
			<div class="flex flex-wrap gap-2">
				<button
					class="device-button-sm px-3"
					type="button"
					disabled={saving || !pad.hasContent}
					onclick={() => save(false)}>{openRow ? `Save ${openRow.name}` : "Save"}</button
				>
				{#if openRow}
					<button
						class="device-button-sm px-3"
						type="button"
						disabled={saving || !pad.hasContent}
						onclick={() => save(true)}>Save as new</button
					>
				{/if}
				<button
					class="device-button-sm px-3"
					type="button"
					title="A new pad: the chords and notes cleared, the saved one left as it is"
					disabled={saving || (!pad.hasContent && !openRow)}
					onclick={() => pad.newPad()}>New</button
				>
			</div>
		{/if}
		{#if saved.length === 0}
			<p class="opacity-70">Nothing saved to {account?.name} yet.</p>
		{:else}
			<ul class="grid gap-1" aria-label="Saved progressions">
				{#each saved as p (p.id)}
					<li class="flex items-center gap-1">
						<button
							class="flex-1 min-w-0 text-left rounded px-2 py-1 hover-bg-white/10 truncate {pad.savedId ===
							p.id
								? 'text-accent'
								: ''}"
							type="button"
							title="Open {p.name} ({p.data.bpm} bpm, {p.data.entries.length} {p.data.entries
								.length === 1
								? 'chord'
								: 'chords'}{p.notes.trim() ? ', notes' : ''})"
							onclick={() => open(p)}>{p.name}</button
						>
						{#if account?.canEdit}
							<button
								class="device-button-sm px-2 !min-w-0"
								type="button"
								aria-label="Rename {p.name}"
								title="Rename"
								onclick={() => rename(p)}
							>
								<span class="i-ph-pencil-simple" aria-hidden="true"></span>
							</button>
							<button
								class="device-button-sm px-2 !min-w-0"
								type="button"
								aria-label="Delete {p.name}"
								title="Delete"
								onclick={() => remove(p)}
							>
								<span class="i-ph-trash" aria-hidden="true"></span>
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</div>
{/snippet}
