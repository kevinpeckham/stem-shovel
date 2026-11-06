<script lang="ts">
	import type { ComponentProps } from "svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import { shareSong } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	interface Props {
		/** The song to share; a private song or project sends a link made for the recipient. */
		song: { id: string; isPrivate: boolean; project: { isPrivate: boolean } };
		/** The song's share links (the page's data), listed under the form. */
		shareLinks: ComponentProps<typeof ShareLinks>["links"];
	}
	let { song, shareLinks }: Props = $props();

	// Share by email: the song's public link plus a note, sent through Resend.
	let sharePanel = $state<HTMLDivElement | null>(null);
	let shareTo = $state("");
	let shareMessage = $state("");
	let shareBusy = $state(false);
	let shareError = $state<string | null>(null);
	async function sendShare(e: SubmitEvent) {
		e.preventDefault();
		shareError = null;
		shareBusy = true;
		try {
			const { sent } = await shareSong({
				songId: song.id,
				to: shareTo,
				message: shareMessage,
			});
			shareTo = "";
			shareMessage = "";
			notify(`Sent to ${sent}`);
			sharePanel?.hidePopover();
		} catch (err) {
			shareError = errorMessage(err);
		} finally {
			shareBusy = false;
		}
	}
</script>

<div
	id="song-share"
	popover="auto"
	bind:this={sharePanel}
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Share by email</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="song-share"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<p class="mb-3 text-sm text-dim">
		{#if song.isPrivate || song.project.isPrivate}
			Sends a viewing link to this song, made for the recipient (it appears below and can be
			revoked). With it they can listen, read the chart and download the mixes.
		{:else}
			Sends the link to this page. Anyone with it can listen, read the chart and download the mixes.
		{/if}
	</p>
	<form class="grid gap-3" onsubmit={sendShare}>
		<label class="block">
			<span class="text-sm text-dim">To</span>
			<input class="mt-1 field" type="email" bind:value={shareTo} required autocomplete="off" />
		</label>
		<label class="block">
			<span class="text-sm text-dim">Note <span class="opacity-60">(optional)</span></span>
			<textarea class="mt-1 field text-sm" rows="3" bind:value={shareMessage}></textarea>
		</label>
		{#if shareError}<p class="text-sm text-red-400" role="alert">{shareError}</p>{/if}
		<button class="button-accent justify-self-start" disabled={shareBusy}>
			{shareBusy ? "Sending…" : "Send"}
		</button>
	</form>
	<div class="mt-6 border-t border-white/15 pt-4">
		<ShareLinks
			target={{ songId: song.id }}
			links={shareLinks}
			isPrivate={song.isPrivate || song.project.isPrivate}
		/>
	</div>
</div>
