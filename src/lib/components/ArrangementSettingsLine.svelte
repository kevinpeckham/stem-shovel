<script lang="ts">
	import { refreshAll } from "$app/navigation";
	import { useSongSettings } from "#lib/remote/arrangements.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * At the top of the Tempo & key tab on an alternate arrangement
	 * (docs/arrangements.md, "Settings of its own"): which tempo, key, time
	 * signature and start of bar 1 are in force, the song's or its own, and
	 * for its own a way back to the song's.
	 */
	interface Props {
		arrangementId: string;
		/** The arrangement has settings of its own (`song.settingsOwn`). */
		own: boolean;
		/** After the arrangement goes back to the song's settings (the page resets the rows). */
		onreset?: () => void;
	}

	let { arrangementId, own, onreset }: Props = $props();

	let busy = $state(false);

	async function useSongs() {
		if (
			!confirm(
				"Use the song's tempo, key, time signature and start of bar 1 for this arrangement? Its own are discarded.",
			)
		)
			return;
		busy = true;
		try {
			await useSongSettings({ id: arrangementId });
			await refreshAll();
			onreset?.();
			notify("Arrangement now uses the song's settings");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = false;
		}
	}
</script>

<p
	class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-white/15 bg-blue-300/5 px-4 py-3 text-sm"
	data-arrangement-settings
>
	{#if own}
		<span>This arrangement has its own tempo, key, time signature and start of bar 1.</span>
		<button class="link text-xs" type="button" disabled={busy} onclick={useSongs}>
			{busy ? "Switching…" : "Use the song's settings"}
		</button>
	{:else}
		<span>
			This arrangement uses the song's tempo, key, time signature and start of bar 1. Change any of
			them here to give it its own.
		</span>
	{/if}
</p>
