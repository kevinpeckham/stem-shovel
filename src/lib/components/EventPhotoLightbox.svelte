<script lang="ts">
	import type { EventFileRow } from "#lib/server/data.js";

	/**
	 * The lightbox of an event's photos (EventPhotos.svelte): a modal
	 * `<dialog>` with the full picture, its caption (a field for a member),
	 * Download, Delete for a member and Previous/Next (the arrow keys too).
	 * The parent holds which photo it shows and opens it with `open()`.
	 */
	interface Props {
		/** The photo shown; null while the lightbox is closed. */
		photo: EventFileRow | null;
		/** Its place in the gallery, from zero. */
		index: number | null;
		count: number;
		canEdit: boolean;
		onclose: () => void;
		onprev: () => void;
		onnext: () => void;
		oncaption: (photo: EventFileRow, caption: string) => void;
		ondelete: (photo: EventFileRow) => void;
	}
	let { photo, index, count, canEdit, onclose, onprev, onnext, oncaption, ondelete }: Props =
		$props();

	let dialog = $state<HTMLDialogElement | null>(null);

	export function open() {
		dialog?.showModal();
	}
	export function close() {
		dialog?.close();
	}

	function onkeydown(e: KeyboardEvent) {
		if ((e.target as HTMLElement).tagName === "INPUT") return;
		if (e.key === "ArrowLeft") onprev();
		else if (e.key === "ArrowRight") onnext();
	}
</script>

<dialog
	bind:this={dialog}
	class="m-auto w-[min(56rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-md border border-white/15 bg-oxford p-4 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/80"
	aria-label="Photo"
	{onclose}
	{onkeydown}
>
	{#if photo && index !== null}
		<div class="grid gap-3">
			<div class="flex flex-wrap items-center gap-2">
				<span class="text-13px text-dim">Photo {index + 1} of {count}</span>
				<button class="button button-xs ml-auto" type="button" onclick={close}>
					<span class="i-ph-x" aria-hidden="true"></span> Close
				</button>
			</div>
			<img
				class="mx-auto block max-h-[70dvh] max-w-full rounded object-contain"
				src={photo.url}
				alt={photo.caption || `Photo ${index + 1}`}
			/>
			{#if canEdit}
				{#key photo.id}
					<input
						class="field text-14px"
						aria-label="Caption"
						placeholder="Add a caption"
						maxlength="500"
						value={photo.caption}
						onchange={(e) => oncaption(photo, e.currentTarget.value.trim())}
					/>
				{/key}
			{:else if photo.caption}
				<p class="text-14px">{photo.caption}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-2">
				<button class="button button-sm" type="button" disabled={count < 2} onclick={onprev}>
					<span class="i-ph-caret-left" aria-hidden="true"></span> Previous
				</button>
				<button class="button button-sm" type="button" disabled={count < 2} onclick={onnext}>
					Next <span class="i-ph-caret-right" aria-hidden="true"></span>
				</button>
				<a class="button button-sm ml-auto" href="/f/{photo.shareCode}?download=1">
					<span class="i-ph-download-simple" aria-hidden="true"></span> Download
				</a>
				{#if canEdit}
					<button class="button button-sm" type="button" onclick={() => ondelete(photo)}>
						<span class="i-ph-trash" aria-hidden="true"></span> Delete
					</button>
				{/if}
			</div>
		</div>
	{/if}
</dialog>
