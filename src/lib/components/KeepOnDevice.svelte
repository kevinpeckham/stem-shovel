<script lang="ts">
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
		/** A keep in progress (engine.keeping). */
		keeping: { done: number; total: number } | null;
		/** Keep the song, or fetch the stems the kept copy lacks. */
		onkeep: () => void;
		/** Remove the song's files from this device. */
		onremove: () => void;
	}

	let { available, kept, keeping, onkeep, onremove }: Props = $props();
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
				title="Keep the stems' playback files on this device so the song opens without downloading them again. The page itself still needs a connection."
				onclick={onkeep}>keep on this device</button
			>
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
