<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { deleteEventFile } from "#lib/remote/events.remote.js";
	import type { EventFileRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { uploadEventFile } from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * An event's poster (docs/band-plan.md, "Event"): one PDF or image put up
	 * before the night, shown as the event's picture, with one menu at its
	 * corner: Open, Download and Copy link by its permanent link (`/f/<code>`),
	 * and Replace and Remove for a member. The page's own section heading sits above it; the poster is
	 * the page's local state, kept from what the upload and Remove answer.
	 */
	interface Props {
		eventId: string;
		noun: "show" | "practice";
		/** The event's title (or venue), for the image's alt text. */
		title: string;
		poster: EventFileRow | null;
		canEdit: boolean;
		onchange: (poster: EventFileRow | null) => void;
	}
	let { eventId, noun, title, poster, canEdit, onchange }: Props = $props();

	let uploading = $state(false);
	let dragging = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();

	/** The picture: the thumbnail, else the file itself when it is an image; a PDF without one shows an icon. */
	const src = $derived(
		poster
			? (poster.thumbnailUrl ??
					(poster.contentType.startsWith("image/") && poster.url ? poster.url : null))
			: null,
	);

	async function upload(file: File | undefined) {
		if (!file || uploading) return;
		uploading = true;
		try {
			const row = await uploadEventFile<EventFileRow>(eventId, "poster", file);
			onchange(row);
			notify("Poster uploaded");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			uploading = false;
		}
	}

	function picked(input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		void upload(file);
	}

	async function copyLink(code: string) {
		try {
			await navigator.clipboard.writeText(`${location.origin}/f/${code}`);
			notify("Link copied");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	async function remove(id: string) {
		if (!confirm("Remove the poster?")) return;
		try {
			await deleteEventFile({ id });
			onchange(null);
			notify("Poster removed");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
</script>

{#if poster}
	<div class="grid max-w-64 gap-3">
		<div class="relative">
			<a
				class="surface block overflow-hidden"
				href="/f/{poster.shareCode}"
				target="_blank"
				rel="noopener"
			>
				{#if src}
					<img class="block h-auto w-full" {src} alt="Poster for {title}" />
				{:else}
					<span
						class="flex aspect-[3/4] w-full items-center justify-center text-dim"
						role="img"
						aria-label="Poster for {title}"
					>
						<span class="i-ph-file-pdf text-48px" aria-hidden="true"></span>
					</span>
				{/if}
			</a>
			<div class="absolute right-2 top-2">
				<ContextMenu
					ariaLabel="Poster actions"
					title="Open, download, copy the link, replace, remove"
					position="bottom left"
					buttonBaseClasses="button button-xs"
					items={[
						{
							id: "poster-open",
							label: "Open",
							iconClass: "i-ph-arrows-out-simple",
							kind: "link",
							href: `/f/${poster.shareCode}`,
							target: "_blank",
						},
						{
							id: "poster-download",
							label: "Download",
							iconClass: "i-ph-download-simple",
							kind: "link",
							href: `/f/${poster.shareCode}?download=1`,
						},
						{
							id: "poster-copy",
							label: "Copy link",
							iconClass: "i-ph-link",
							action: () => copyLink(poster.shareCode),
						},
						{ id: "poster-divider", kind: "divider", condition: canEdit },
						{
							id: "poster-replace",
							label: "Replace",
							iconClass: "i-ph-arrows-clockwise",
							condition: canEdit,
							disabled: uploading,
							action: () => fileInput?.click(),
						},
						{
							id: "poster-remove",
							label: "Remove",
							iconClass: "i-ph-trash",
							condition: canEdit,
							disabled: uploading,
							action: () => remove(poster.id),
						},
					]}
				/>
			</div>
		</div>
		{#if canEdit}
			<input
				bind:this={fileInput}
				class="sr-only"
				type="file"
				accept="application/pdf,image/*"
				aria-label="Replace the poster"
				disabled={uploading}
				onchange={(e) => picked(e.currentTarget)}
			/>
		{/if}
		{#if uploading}<p class="text-13px text-dim" role="status">Uploading…</p>{/if}
	</div>
{:else if canEdit}
	<div class="grid gap-2">
		<label
			class="flex max-w-64 cursor-pointer flex-col items-center justify-center gap-2 rounded border-2 border-dashed px-4 py-8 text-center text-14px hover-border-accent {dragging
				? 'border-accent bg-accent/5'
				: 'border-white/25'}"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragging = false;
				void upload(e.dataTransfer?.files[0]);
			}}
		>
			<span class="i-ph-image text-32px opacity-80" aria-hidden="true"></span>
			<span>{uploading ? "Uploading…" : "Upload a poster"}</span>
			<input
				class="sr-only"
				type="file"
				accept="application/pdf,image/*"
				aria-label="Upload a poster"
				disabled={uploading}
				onchange={(e) => picked(e.currentTarget)}
			/>
		</label>
		<p class="text-13px text-dim">
			A PDF or an image, up to 25 MB; the band downloads it for printing and it is the {noun}'s
			picture.
		</p>
	</div>
{:else}
	<p class="text-14px text-dim">No poster yet.</p>
{/if}
