<script lang="ts">
	import type { HTMLInputAttributes } from "svelte/elements";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import type { SpanEntries, SpanEntry } from "#lib/state/spanEntries.svelte.js";

	/**
	 * Start of bar 1 or End: typed in the readout's format, carried as seconds
	 * in the form's hidden field (`hidden`, the remote field's
	 * `.as("hidden", entries.positionValue(entry))`), with a Playhead button.
	 * The song's settings form and an alternate's "Start and end" share it.
	 */
	interface Props {
		label: string;
		hint: string;
		entries: SpanEntries;
		entry: SpanEntry;
		/** The remote form's hidden field, holding the seconds. */
		hidden: HTMLInputAttributes;
		/** The field's issues from the server. */
		issues: { message: string }[] | undefined;
		/** The position helpers every editor shares (editPos, the readout mode). */
		changes: SongChanges;
		/** The Stem Player's engine, for the Playhead button. */
		engine: StemEngine | null;
	}

	let { label, hint, entries, entry, hidden, issues, changes, engine }: Props = $props();
</script>

<label class="block">
	<span class="text-sm opacity-90">{label} <span class="opacity-60">(optional)</span></span>
	<span class="mt-1 flex items-center gap-2">
		<input
			class="field font-mono text-sm"
			placeholder={POSITION_PLACEHOLDER[changes.mode]}
			autocomplete="off"
			bind:value={entries[entry]}
			defaultValue={entry === "startAtEntry" ? entries.startAtText : entries.endAtText}
			aria-label={label}
		/>
		<!-- The entry's reset value is the saved text: clearForm resets the form when settings open, and
		     Svelte writes each input's reset value back into its binding a tick later (so without this the
		     entry came back blank). The hidden field renders the value it is given, literally: the seconds
		     the entry reads as, as typed. -->
		<input {...hidden} />
		<button
			class="button button-xs shrink-0"
			type="button"
			title="Use the transport's current position"
			disabled={!engine || engine.status !== "ready"}
			onclick={() => (entries[entry] = changes.editPos(engine?.position ?? 0))}
		>
			Playhead
		</button>
	</span>
	<span class="mt-1 block text-xs opacity-90">{hint}</span>
	{#each issues ?? [] as issue (issue.message)}
		<p class="mt-1 text-sm text-red-400">{issue.message}</p>
	{/each}
</label>
