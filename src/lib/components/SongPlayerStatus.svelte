<script lang="ts">
	import type { ComponentProps } from "svelte";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import KeepOnDevice from "#lib/components/KeepOnDevice.svelte";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	interface Props {
		/** The stem player's engine; no status line until it mounts (the stage notice shows regardless). */
		engine: StemEngine | null;
		/** The song's stems (`data.manifest.stems.length`). */
		stemCount: number;
		/** The "keep on this device" line (the player's keepProps, or nothing until it mounts). */
		keepProps: ComponentProps<typeof KeepOnDevice>;
		/** Switch the player's mode (StemPlayer.switchMode). */
		onmode: (mode: "buffered" | "streamed") => void;
		/** The stems are from an earlier stage and the song has mixes. */
		showStageNotice: boolean;
		/** The notice's Mixes link: the Mixes view. */
		onshowmixes: () => void;
	}
	let { engine, stemCount, keepProps, onmode, showStageNotice, onshowmixes }: Props = $props();
</script>

{#snippet streamed(engine: StemEngine)}
	streamed{#if engine.buffering}, buffering…{:else}
		<span class="i-ph-check text-green-300 align-[-2px]"></span>{/if}
	<button
		class="link ml-1"
		type="button"
		title="Decode every stem into memory instead: instant seeking, about 60 MB per four-minute stereo stem"
		onclick={() => onmode("buffered")}>play buffered</button
	>
{/snippet}

{#snippet buffered(engine: StemEngine)}
	{formatBytes(engine.decodedBytes)} decoded
	<span class="i-ph-check text-green-300 align-[-2px]"></span>
	{#if typeof AudioDecoder !== "undefined"}
		<button
			class="link ml-1"
			type="button"
			title="Decode a window around the playhead instead of the whole song, so a song of any size fits"
			onclick={() => onmode("streamed")}>stream</button
		>
	{/if}
{/snippet}

<!-- The player's status, the body's first line (the player's own box is hidden; the header has no room beside the views and the controls). -->
{#if engine}
	<p class="mb-2 text-13px opacity-70" aria-live="polite">
		{#if engine.status === "loading"}
			Decoding stem {Math.min(engine.loaded + 1, engine.total)} of {engine.total}…
		{:else if engine.status === "ready"}
			{stemCount}
			{stemCount === 1 ? "stem" : "stems"},
			{#if engine.mode === "streamed"}
				{@render streamed(engine)}
			{:else}
				{@render buffered(engine)}
			{/if}
			<KeepOnDevice {...keepProps} />
		{/if}
	</p>
{/if}
{#if showStageNotice}
	<!-- The stems are from an earlier stage (docs/mixes.md, "Phase 2"); the studio recording is in Mixes. -->
	<p class="mb-3 rounded border border-current/20 bg-blue-300/5 px-3 py-2 text-13px opacity-90">
		These stems are from the arranging stage. The studio recording is in
		<button type="button" class="link" onclick={onshowmixes}>Mixes</button>.
	</p>
{/if}
