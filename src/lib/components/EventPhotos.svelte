<script lang="ts">
	import { deleteEventFile, updateEventFileCaption } from "#lib/remote/events.remote.js";
	import type { EventFileRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { uploadEventFile } from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import EventPhotoLightbox from "#lib/components/EventPhotoLightbox.svelte";

	/**
	 * An event's photos (docs/band-plan.md, "Event"): a grid of square
	 * thumbnails, each opening a lightbox (a modal `<dialog>`) with the full
	 * picture, its caption, Download and Previous/Next (the arrow keys too);
	 * a member edits the caption there, deletes a photo, and adds photos,
	 * uploaded one after another and appended as each finishes. The list is
	 * the page's local state, kept from what each upload and command answers.
	 */
	interface Props {
		eventId: string;
		/** Unused for now; kept so the page passes the same props to both. */
		noun: "show" | "practice";
		photos: EventFileRow[];
		canEdit: boolean;
		onchange: (photos: EventFileRow[]) => void;
	}
	let { eventId, photos, canEdit, onchange }: Props = $props();

	let lightbox = $state<EventPhotoLightbox | null>(null);
	/** Which photo the lightbox shows; null while it is closed. */
	let index = $state<number | null>(null);
	const current = $derived(index === null ? null : (photos[index] ?? null));
	let progress = $state<{ done: number; total: number } | null>(null);

	function open(i: number) {
		index = i;
		lightbox?.open();
	}
	function step(by: number) {
		if (index === null || photos.length === 0) return;
		index = (index + by + photos.length) % photos.length;
	}

	async function add(input: HTMLInputElement) {
		const files = [...(input.files ?? [])];
		input.value = "";
		if (files.length === 0 || progress) return;
		let list = photos;
		for (const [i, file] of files.entries()) {
			progress = { done: i + 1, total: files.length };
			try {
				const row = await uploadEventFile<EventFileRow>(eventId, "photo", file);
				list = [...list, row];
				onchange(list);
			} catch (e) {
				notify(`${file.name}: ${errorMessage(e)}`, { kind: "error" });
			}
		}
		progress = null;
	}

	async function saveCaption(photo: EventFileRow, caption: string) {
		if (caption === photo.caption) return;
		try {
			await updateEventFileCaption({ id: photo.id, caption });
			onchange(photos.map((p) => (p.id === photo.id ? { ...p, caption } : p)));
			notify("Caption saved");
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	async function remove(photo: EventFileRow) {
		if (!confirm("Delete this photo?")) return;
		try {
			await deleteEventFile({ id: photo.id });
			const rest = photos.filter((p) => p.id !== photo.id);
			onchange(rest);
			notify("Photo deleted");
			if (rest.length === 0) lightbox?.close();
			else if (index !== null && index >= rest.length) index = rest.length - 1;
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}
</script>

<div class="grid gap-3">
	{#if photos.length === 0}
		<p class="text-14px text-dim">No photos yet.</p>
	{:else}
		<ul
			class="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-4 md:grid-cols-5"
			aria-label="Photos"
		>
			{#each photos as photo, i (photo.id)}
				<li>
					<button
						class="block w-full overflow-hidden rounded border-0 bg-transparent p-0 hover-outline outline-2 outline-accent"
						type="button"
						aria-label="Open photo {i + 1}"
						onclick={() => open(i)}
					>
						<img
							class="block aspect-square w-full rounded object-cover"
							src={photo.thumbnailUrl ?? photo.url}
							alt={photo.caption}
							loading="lazy"
						/>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if canEdit}
		<div class="flex flex-wrap items-center gap-3">
			<label class="button button-sm cursor-pointer" aria-disabled={!!progress}>
				<span class="i-ph-images" aria-hidden="true"></span> Add photos
				<input
					class="sr-only"
					type="file"
					accept="image/*"
					multiple
					disabled={!!progress}
					onchange={(e) => add(e.currentTarget)}
				/>
			</label>
			{#if progress}
				<span class="text-13px text-dim" role="status">
					Uploading {progress.done} of {progress.total}…
				</span>
			{/if}
		</div>
	{/if}
</div>

<EventPhotoLightbox
	bind:this={lightbox}
	photo={current}
	{index}
	count={photos.length}
	{canEdit}
	onclose={() => (index = null)}
	onprev={() => step(-1)}
	onnext={() => step(1)}
	oncaption={saveCaption}
	ondelete={remove}
/>
