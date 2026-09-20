<script lang="ts">
	import { removeImage, setImage } from "$lib/remote/images.remote";
	import { resizeImage } from "$lib/utils/resizeImage";
	import { IMAGE_ACCEPT } from "$lib/constants/images";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { ImageKind } from "$lib/val/ImageSchema";

	/**
	 * The picture of an account, an artist or a song: the current one (or a
	 * placeholder), a button to choose another, and Remove. The chosen file
	 * is shrunk in the browser before the form sends it.
	 */
	interface Props {
		kind: ImageKind;
		id: string;
		/** The current image, presented (a private song's is a signed URL). */
		url: string | null;
		/** What the picture is of, for the alt text and the buttons. */
		label: string;
		round?: boolean;
		/** Tailwind size classes for the picture box. */
		size?: string;
	}
	let { kind, id, url, label, round = false, size = "h-32 w-32" }: Props = $props();

	const set = $derived(setImage.for(`${kind}:${id}`));
	const remove = $derived(removeImage.for(`${kind}:${id}`));
	let busy = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	/** Shrink the picked file, put it back in the input, and let the form send it. */
	async function picked(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		const file = el.files?.[0];
		if (!file) return;
		busy = true;
		try {
			const small = await resizeImage(file);
			const dt = new DataTransfer();
			dt.items.add(small);
			el.files = dt.files;
			el.form?.requestSubmit();
		} catch (err) {
			busy = false;
			notify(errorMessage(err), { kind: "error" });
		}
	}
</script>

<div class="flex flex-wrap items-center gap-4">
	<div
		class="{size} shrink-0 overflow-hidden {round
			? 'rounded-full'
			: 'rounded-md'} border border-white/15 bg-black/20 grid place-items-center"
	>
		{#if url}
			<img class="h-full w-full object-cover" src={url} alt={label} />
		{:else}
			<span class="i-ph-image text-3xl opacity-40" aria-hidden="true"></span>
		{/if}
	</div>
	<div class="grid gap-2 text-sm">
		<form
			enctype="multipart/form-data"
			{...set.enhance(async ({ submit }) => {
				try {
					await submit();
					if (set.result?.url) notify(`${label} image saved`);
				} catch (err) {
					notify(errorMessage(err), { kind: "error" });
				} finally {
					busy = false;
					if (input) input.value = "";
				}
			})}
		>
			<input {...set.fields.kind.as("hidden", kind)} />
			<input {...set.fields.id.as("hidden", id)} />
			<label class="button button-sm cursor-pointer {busy ? 'pointer-events-none opacity-50' : ''}">
				<span class="i-ph-image" aria-hidden="true"></span>
				{busy ? "Saving…" : url ? "Change image" : "Add image"}
				<!-- The field's own spread carries its listeners; ours is attached beside them rather than in their place. -->
				<input
					bind:this={input}
					class="sr-only"
					{...set.fields.image.as("file")}
					accept={IMAGE_ACCEPT}
					{@attach (el) => {
						el.addEventListener("change", picked);
						return () => el.removeEventListener("change", picked);
					}}
				/>
			</label>
			{#each set.fields.image.issues() ?? [] as issue (issue.message)}
				<p class="mt-1 text-red-400">{issue.message}</p>
			{/each}
		</form>
		{#if url}
			<form
				{...remove.enhance(async ({ submit }) => {
					await submit();
					if (remove.result?.removed) notify(`${label} image removed`);
				})}
			>
				<input {...remove.fields.kind.as("hidden", kind)} />
				<input {...remove.fields.id.as("hidden", id)} />
				<button class="link-dim" disabled={!!remove.pending}>Remove image</button>
			</form>
		{/if}
		<span class="text-13px text-dim">JPEG, PNG or WebP; shrunk to 1024 px before upload.</span>
	</div>
</div>
