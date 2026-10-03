<script lang="ts">
	import { metronome } from "$lib/audio/metronome.svelte";
	import { progressionPad } from "$lib/audio/progression.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import {
		deleteProgression,
		renameProgression,
		saveProgression,
	} from "$lib/remote/progressions.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { measuresOf, type ChordBeats } from "$lib/utils/chordRhythm";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { SavedProgression } from "$lib/val/ProgressionSchema";

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
	}
	let { account = null, saved = $bindable([]) }: Props = $props();
	let saving = $state(false);

	const pad = progressionPad;
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
