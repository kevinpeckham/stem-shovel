<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * The Stem Player's "keep on this device" (audio/mediaCache.ts), at the
	 * end of the status line under the rows: the keep's progress, what this
	 * device keeps of the song, or the link to keep it. Nothing without a
	 * song or a browser that can keep one.
	 */
	interface Props {
		/** A song, and a browser that can keep one (DeviceKeep.available). */
		available: boolean;
		/** What this device keeps of the song (engine.keptOnDevice), or null when nothing. */
		kept: { bytes: number; missing: number } | null;
		/** About how much the song's playback files weigh (duration × stems × the rendition bitrate), for the offer. */
		estimate?: number;
		/** A keep in progress (engine.keeping). */
		keeping: { done: number; total: number } | null;
		/** Keep the song, or fetch the stems the kept copy lacks. */
		onkeep: () => void;
		/** Remove the song's files from this device. */
		onremove: () => void;
	}

	let { available, kept, estimate = 0, keeping, onkeep, onremove }: Props = $props();
	const about = $derived(estimate > 0 ? ` (about ${formatBytes(estimate)})` : "");
</script>

{#if available}
	<span class="ml-2">
		{#if keeping}
			keeping… {keeping.done} of {keeping.total}
		{:else if kept}
			{@render keptLine(kept)}
		{:else}
			<button
				class="link"
				type="button"
				title="Keep the stems' playback files on this device so the song opens without downloading them again"
				onclick={onkeep}>keep on this device</button
			>
			<InfoTip
				label="About keeping a song on this device"
				class="ml-1 align-[-2px]"
				text="Keeps this song's playback files{about} in this browser's own storage, so the song opens without downloading them again: handy on a slow connection, or before a rehearsal. The page itself still needs a connection, nothing changes on the server, and you can remove the copy any time. Your browser may clear it after a while without a visit."
			/>
		{/if}
	</span>
{/if}

<!-- What this device keeps: the size, any stems missing (a stem replaced since the keep) and the link that updates or removes it. -->
{#snippet keptLine(k: { bytes: number; missing: number })}
	kept on this device ({formatBytes(k.bytes)}{#if k.missing > 0}, {k.missing}
		{k.missing === 1 ? "stem" : "stems"} missing{/if})
	{#if k.missing > 0}
		<button
			class="link ml-1"
			type="button"
			title="Download the missing stems' playback files to this device"
			onclick={onkeep}>update</button
		>
	{:else}
		<button
			class="link ml-1"
			type="button"
			title="Remove this song's playback files from this device"
			onclick={onremove}>remove</button
		>
	{/if}
{/snippet}
