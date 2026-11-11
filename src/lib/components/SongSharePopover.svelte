<script lang="ts" module>
	/** What a share lands on: a mix (docs/mixes.md) or a demo recording of the song, by its own page. */
	export interface ShareAim {
		kind: "mix" | "demo";
		id: string;
		/** As the heading names it: `mix v3`, `“Phone memo”`. */
		name: string;
		/** The page's address, offered to copy while the song is public. */
		url: string;
	}
</script>

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
		/** A mix's or a demo's page: the email, its link and the links made below land there. */
		aim?: ShareAim | null;
	}
	let { song, shareLinks, aim = null }: Props = $props();

	let isPrivate = $derived(song.isPrivate || song.project.isPrivate);
	/** The aim as the share's ids: `mixId` or `demoId`, none for the song itself. */
	let aimIds = $derived<{ mixId?: string; demoId?: string }>(
		aim ? { [aim.kind === "mix" ? "mixId" : "demoId"]: aim.id } : {},
	);

	// Share by email: the song's public link plus a note, sent through Resend.
	let sharePanel = $state<HTMLDivElement | null>(null);
	let shareTo = $state("");
	let shareMessage = $state("");
	let shareBusy = $state(false);
	let shareError = $state<string | null>(null);
	/** Open the popover (the page's Share button, or its `?open=share`). */
	export function showShare() {
		sharePanel?.showPopover();
	}
	async function sendShare(e: SubmitEvent) {
		e.preventDefault();
		shareError = null;
		shareBusy = true;
		try {
			const { sent } = await shareSong({
				songId: song.id,
				...aimIds,
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
	function copyLink(url: string) {
		navigator.clipboard
			.writeText(url)
			.then(() => notify("Link copied"))
			.catch(() => notify("Could not copy the link", { kind: "error" }));
	}
</script>

<div
	id="song-share"
	popover="auto"
	bind:this={sharePanel}
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">{aim ? `Share ${aim.name}` : "Share by email"}</h2>
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
		{#if aim}
			Sends a link that opens this {aim.kind}{#if isPrivate}, as a viewing link made for the
				recipient (it appears below and can be revoked){/if}. Links made below land on the {aim.kind}
			too.
		{:else if isPrivate}
			Sends a viewing link to this song, made for the recipient (it appears below and can be
			revoked). With it they can listen, read the chart and download the mixes.
		{:else}
			Sends the link to this page. Anyone with it can listen, read the chart and download the mixes.
		{/if}
	</p>
	{#if aim && !isPrivate}
		<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
			<code class="min-w-0 truncate font-mono text-12px opacity-80">{aim.url}</code>
			<button type="button" class="link text-12px" onclick={() => copyLink(aim.url)}
				>Copy link</button
			>
		</div>
	{/if}
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
		<ShareLinks target={{ songId: song.id, ...aimIds }} links={shareLinks} {isPrivate} />
	</div>
</div>
