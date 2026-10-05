<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { MAX_PDFS_PER_SONG, PDF_ACCEPT, PDF_MAX_BYTES } from "$lib/constants/pdfFormats";
	import { deletePdf, updatePdf } from "$lib/remote/pdfs.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { postJson, uploadPdfFile, type PdfReservation } from "$lib/upload";

	/**
	 * The PDFs attached to a song (docs/uploads-and-blob.md, "PDFs"): a
	 * tile each with its first page, title, description, pages and size, a
	 * download and its permanent link; editors upload more (one or more at
	 * a time), edit the words and remove. The page owns the list and
	 * reloads it after a change.
	 */
	export interface PanelPdf {
		id: string;
		title: string;
		description: string;
		filename: string;
		sizeBytes: number;
		pageCount: number | null;
		url: string;
		thumbnailUrl: string | null;
		shareCode: string;
		status: string;
	}
	interface Props {
		songId: string;
		pdfs: PanelPdf[];
		canEdit: boolean;
	}
	let { songId, pdfs, canEdit }: Props = $props();

	let ready = $derived(pdfs.filter((p) => p.status === "ready" && p.url));
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	let picker = $state<HTMLInputElement | null>(null);
	/** The page's Uploads menu opens the same picker. */
	export function pick() {
		picker?.click();
	}

	async function uploadPicked(input: HTMLInputElement) {
		const files = [...(input.files ?? [])];
		input.value = "";
		if (files.length === 0) return;
		const room = Math.max(0, MAX_PDFS_PER_SONG - pdfs.length);
		const picked = files.slice(0, room);
		if (picked.length < files.length)
			notify(`A song can have at most ${MAX_PDFS_PER_SONG} PDFs; the first ${room} were taken`, {
				kind: "error",
			});
		busy = true;
		jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of picked.entries()) {
			if (file.size > PDF_MAX_BYTES) {
				jobs[i].error = `Over ${formatBytes(PDF_MAX_BYTES)}`;
				continue;
			}
			try {
				await uploadPdfFile(
					file,
					() =>
						postJson<PdfReservation>("/api/pdfs", {
							songId,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (jobs[i].percent = percent),
				);
			} catch (e) {
				jobs[i].error = errorMessage(e);
			}
		}
		await invalidateAll();
		busy = false;
		if (jobs.every((j) => !j.error)) jobs = [];
	}

	// ---- editing a tile's words ----
	let editing = $state<string | null>(null);
	let draftTitle = $state("");
	let draftDescription = $state("");
	let saving = $state(false);
	function startEdit(p: PanelPdf) {
		editing = p.id;
		draftTitle = p.title;
		draftDescription = p.description;
	}
	async function saveEdit(id: string) {
		saving = true;
		try {
			await updatePdf({ id, title: draftTitle, description: draftDescription });
			editing = null;
			await invalidateAll();
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function remove(p: PanelPdf) {
		if (!confirm(`Remove "${p.title || p.filename}" from this song? The file is deleted.`)) return;
		try {
			await deletePdf({ id: p.id });
			notify(`${p.title || p.filename} removed`);
			await invalidateAll();
		} catch (e) {
			notify(`Could not remove it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function copyLink(p: PanelPdf) {
		const url = `${window.location.origin}/f/${p.shareCode}`;
		try {
			await navigator.clipboard.writeText(url);
			notify("Link copied");
		} catch {
			notify(url);
		}
	}
	const pagesLabel = (n: number | null) => (n === null ? "" : n === 1 ? "1 page" : `${n} pages`);
</script>

<section class="grid gap-3" aria-label="PDFs">
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h2 class="heading-2 mb-0">PDFs</h2>
		{#if canEdit}
			<label
				class="button button-sm cursor-pointer {busy || pdfs.length >= MAX_PDFS_PER_SONG
					? 'opacity-50 pointer-events-none'
					: ''}"
				title="Charts, lead sheets, notation: one or more PDFs, up to {formatBytes(
					PDF_MAX_BYTES,
				)} each"
			>
				<span class="i-ph-file-pdf" aria-hidden="true"></span>
				{busy ? "Uploading…" : "Upload PDFs"}
				<input
					class="sr-only"
					type="file"
					accept={PDF_ACCEPT}
					multiple
					bind:this={picker}
					disabled={busy || pdfs.length >= MAX_PDFS_PER_SONG}
					onchange={(e) => uploadPicked(e.currentTarget)}
				/>
			</label>
		{/if}
	</div>
	{#if jobs.length > 0}
		<ul class="grid gap-1 text-13px" aria-label="PDF uploads">
			{#each jobs as job (job.name)}
				<li class="flex items-center gap-3">
					<span class="truncate">{job.name}</span>
					{#if job.error}
						<span class="text-red-300">{job.error}</span>
					{:else}
						<progress class="w-32 h-2" max="100" value={job.percent}></progress>
						<span class="tabular-nums opacity-70">{Math.round(job.percent)}%</span>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if ready.length === 0 && jobs.length === 0}
		<p class="opacity-70 text-14px">
			No PDFs yet.{#if canEdit}
				Upload a chart, a lead sheet or notation for the band to download.{/if}
		</p>
	{:else}
		<ul class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]" aria-label="PDF list">
			{#each ready as p (p.id)}
				<li class="rounded-md border border-white/15 bg-black/20 p-3 grid gap-3 content-start">
					<a
						class="block aspect-[1/1.3] w-full overflow-hidden rounded bg-white/90"
						href={p.url}
						target="_blank"
						rel="noopener"
						title="Open the PDF"
					>
						{#if p.thumbnailUrl}
							<img
								class="w-full h-full object-cover object-top"
								src={p.thumbnailUrl}
								alt="First page of {p.title || p.filename}"
								loading="lazy"
							/>
						{:else}
							<span class="flex h-full w-full items-center justify-center text-oxford">
								<span class="i-ph-file-pdf text-48px" aria-hidden="true"></span>
							</span>
						{/if}
					</a>
					{#if editing === p.id}
						<form
							class="grid gap-2 text-14px"
							onsubmit={(e) => {
								e.preventDefault();
								void saveEdit(p.id);
							}}
						>
							<input
								class="field"
								type="text"
								maxlength="120"
								placeholder="Title"
								aria-label="Title"
								bind:value={draftTitle}
							/>
							<textarea
								class="field min-h-16 resize-y"
								maxlength="1000"
								placeholder="Description (optional)"
								aria-label="Description"
								bind:value={draftDescription}></textarea>
							<div class="flex gap-2">
								<button class="button button-sm" type="submit" disabled={saving}>
									{saving ? "Saving…" : "Save"}
								</button>
								<button
									class="button button-sm"
									type="button"
									onclick={() => (editing = null)}
									disabled={saving}>Cancel</button
								>
							</div>
						</form>
					{:else}
						<div class="grid gap-1">
							<h3 class="font-600 leading-tight">{p.title || p.filename}</h3>
							{#if p.description}
								<p class="text-13px opacity-85 whitespace-pre-line">{p.description}</p>
							{/if}
							<p class="text-12px opacity-60">
								{[pagesLabel(p.pageCount), formatBytes(p.sizeBytes), p.filename]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<div class="flex flex-wrap gap-2 text-13px">
							<a
								class="button button-sm"
								href={p.url}
								download={p.filename}
								title="Download the PDF"
							>
								<span class="i-ph-download-simple" aria-hidden="true"></span>
								Download
							</a>
							<button
								class="button button-sm"
								type="button"
								title="Copy a permanent link to this PDF"
								onclick={() => copyLink(p)}
							>
								<span class="i-ph-link" aria-hidden="true"></span>
								Copy link
							</button>
							{#if canEdit}
								<button
									class="button button-sm"
									type="button"
									title="Change the title and description"
									onclick={() => startEdit(p)}
								>
									<span class="i-ph-pencil-simple" aria-hidden="true"></span>
									Edit
								</button>
								<button
									class="button button-sm"
									type="button"
									title="Remove this PDF from the song"
									onclick={() => remove(p)}
								>
									<span class="i-ph-trash" aria-hidden="true"></span>
									Remove
								</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>
