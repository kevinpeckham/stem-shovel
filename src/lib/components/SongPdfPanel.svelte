<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import FloatingPanel from "$lib/components/FloatingPanel.svelte";
	import { MAX_PDFS_PER_SONG, PDF_ACCEPT, PDF_MAX_BYTES } from "$lib/constants/pdfFormats";
	import { deletePdf, updatePdf } from "$lib/remote/pdfs.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { postJson, uploadPdfFile, type PdfReservation } from "$lib/upload";

	/**
	 * The PDFs attached to a song (docs/uploads-and-blob.md, "PDFs"), the
	 * Docs panel's PDFs tab (Kevin): a small tile each with its first page,
	 * title, description, pages and size, a ⋯ menu (download, edit, remove)
	 * beside a Share menu (copy the permanent link, share it by email);
	 * editors upload more (one or more at a time) from the button at the
	 * foot, the panel's ⋯ menu or the page's Uploads menu. A tile's page
	 * opens the PDF in a panel of its own (Kevin): floating, dragged and
	 * resized, from lg, docked under the tiles below, Download first in its
	 * header. The page owns the list and reloads it after a change.
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
		/** A score: shown on the Chart tab's notation view as well (Kevin). */
		isNotation: boolean;
	}
	interface Props {
		songId: string;
		/** The song's title, for the email's subject. */
		songTitle: string;
		pdfs: PanelPdf[];
		canEdit: boolean;
	}
	let { songId, songTitle, pdfs, canEdit }: Props = $props();
	/** A PDF marked as notation (or not): it joins or leaves the Chart tab's notation view. */
	async function setNotation(p: PanelPdf, on: boolean) {
		try {
			await updatePdf({ id: p.id, title: p.title, description: p.description, isNotation: on });
			notify(on ? `${nameOf(p)} shows as notation` : `${nameOf(p)} is a plain PDF again`);
			await invalidateAll();
		} catch (e) {
			notify(`Could not change it: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	let ready = $derived(pdfs.filter((p) => p.status === "ready" && p.url));
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	let picker = $state<HTMLInputElement | null>(null);
	let full = $derived(busy || pdfs.length >= MAX_PDFS_PER_SONG);
	/** The page's Uploads menu and the panel's ⋯ menu open the same picker. */
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
	/** The permanent link's download switch: the file streamed as an attachment under its own name (`/f/[code]`). */
	const downloadUrl = (p: PanelPdf) => `/f/${p.shareCode}?download=1`;
	/** The PDF open in its own panel. */
	let viewing = $state<PanelPdf | null>(null);
	const linkOf = (p: PanelPdf) => `${window.location.origin}/f/${p.shareCode}`;
	async function copyLink(p: PanelPdf) {
		const url = linkOf(p);
		try {
			await navigator.clipboard.writeText(url);
			notify("Link copied");
		} catch {
			notify(url);
		}
	}
	/** A mail with the permanent link, in the browser's mail app. */
	function mailLink(p: PanelPdf) {
		const name = p.title || p.filename;
		const subject = `${songTitle}: ${name}`;
		const body = `${name}\n${linkOf(p)}`;
		return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}
	const pagesLabel = (n: number | null) => (n === null ? "" : n === 1 ? "1 page" : `${n} pages`);
	const nameOf = (p: PanelPdf) => p.title || p.filename;
</script>

<section class="flex flex-col gap-3 h-full" aria-label="PDFs">
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
		<ul class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]" aria-label="PDF list">
			{#each ready as p (p.id)}
				<li
					class="rounded-md border border-white/15 bg-black/20 p-2 grid gap-2 content-start"
					aria-label={nameOf(p)}
				>
					<button
						class="block aspect-[1/1.3] w-full overflow-hidden rounded bg-white/90 cursor-pointer"
						type="button"
						title="Open the PDF in a panel"
						aria-label="Open {nameOf(p)}"
						onclick={() => (viewing = p)}
					>
						{#if p.thumbnailUrl}
							<img
								class="w-full h-full object-cover object-top"
								src={p.thumbnailUrl}
								alt="First page of {nameOf(p)}"
								loading="lazy"
							/>
						{:else}
							<span class="flex h-full w-full items-center justify-center text-oxford">
								<span class="i-ph-file-pdf text-40px" aria-hidden="true"></span>
							</span>
						{/if}
					</button>
					{#if editing === p.id}
						<form
							class="grid gap-2 text-13px"
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
								<button class="button button-xs" type="submit" disabled={saving}>
									{saving ? "Saving…" : "Save"}
								</button>
								<button
									class="button button-xs"
									type="button"
									onclick={() => (editing = null)}
									disabled={saving}>Cancel</button
								>
							</div>
						</form>
					{:else}
						<div class="grid gap-0.5 min-w-0">
							<h3 class="font-600 text-13px leading-tight truncate" title={nameOf(p)}>
								{nameOf(p)}
							</h3>
							{#if p.description}
								<p class="text-12px opacity-85 line-clamp-2" title={p.description}>
									{p.description}
								</p>
							{/if}
							<p class="text-11px opacity-60 truncate" title={p.filename}>
								{[pagesLabel(p.pageCount), formatBytes(p.sizeBytes), p.isNotation ? "notation" : ""]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<div class="flex items-center justify-between gap-1">
							<ContextMenu
								ariaLabel="Actions for {nameOf(p)}"
								title="Download, edit, remove"
								buttonBaseClasses="button button-xs"
								position="bottom right"
								items={[
									{
										id: "open",
										label: "Open",
										iconClass: "i-ph-arrows-out-simple",
										title: "Open the PDF in a panel",
										action: () => {
											viewing = p;
										},
									},
									{
										id: "download",
										label: "Download",
										iconClass: "i-ph-download-simple",
										title: "Download the PDF",
										kind: "link",
										href: downloadUrl(p),
									},
									{
										id: "tab",
										label: "Open in a new tab",
										iconClass: "i-ph-arrow-square-out",
										kind: "link",
										href: p.url,
										target: "_blank",
									},
									{
										id: "edit",
										label: "Edit",
										iconClass: "i-ph-pencil-simple",
										title: "Change the title and description",
										condition: canEdit,
										action: () => startEdit(p),
									},
									{
										id: "notation",
										label: "Notation",
										iconClass: p.isNotation ? "i-ph-check" : "i-ph-check invisible",
										title: "A score: shown on the Chart tab's notation view as well",
										condition: canEdit,
										action: () => setNotation(p, !p.isNotation),
									},
									{
										id: "remove",
										label: "Remove",
										iconClass: "i-ph-trash",
										title: "Remove this PDF from the song",
										condition: canEdit,
										action: () => remove(p),
									},
								]}
							/>
							<ContextMenu
								ariaLabel="Share {nameOf(p)}"
								title="Copy the permanent link, or share it by email"
								iconClass="i-ph-share-network"
								buttonBaseClasses="button button-xs"
								position="bottom left"
								items={[
									{
										id: "copy",
										label: "Copy link",
										iconClass: "i-ph-link",
										title: "A permanent link to this PDF",
										action: () => copyLink(p),
									},
									{
										id: "mail",
										label: "Share via email",
										iconClass: "i-ph-envelope-simple",
										title: "A new email with the link, in your mail app",
										kind: "link",
										href: mailLink(p),
									},
								]}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<!-- The viewer: the PDF in the browser's own reader, in a panel dragged and resized from lg, docked here below. -->
	<FloatingPanel
		open={viewing !== null}
		title={viewing ? nameOf(viewing) : ""}
		storageKey="stemshovel.song.pdf-viewer"
		width={760}
		height={860}
		onminimise={() => (viewing = null)}
	>
		{#snippet controls()}
			{#if viewing}
				<a
					class="button button-xs"
					href={downloadUrl(viewing)}
					title="Download the PDF"
					aria-label="Download {nameOf(viewing)}"
				>
					<span class="i-ph-download-simple" aria-hidden="true"></span>
					Download
				</a>
				<a
					class="button button-xs"
					href={viewing.url}
					target="_blank"
					rel="noopener"
					title="Open the PDF in a new tab"
					aria-label="Open {nameOf(viewing)} in a new tab"
				>
					<span class="i-ph-arrow-square-out" aria-hidden="true"></span>
				</a>
				<button
					class="button button-xs"
					type="button"
					title="Copy a permanent link to this PDF"
					aria-label="Copy a link to {nameOf(viewing)}"
					onclick={() => viewing && copyLink(viewing)}
				>
					<span class="i-ph-link" aria-hidden="true"></span>
				</button>
			{/if}
		{/snippet}
		{#if viewing}
			<iframe
				class="w-full h-full min-h-480px rounded bg-white"
				src={viewing.url}
				title={nameOf(viewing)}
			></iframe>
		{/if}
	</FloatingPanel>
	{#if canEdit}
		<div class="flex justify-end mt-auto pt-2">
			<label
				class="button button-sm cursor-pointer {full ? 'opacity-50 pointer-events-none' : ''}"
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
					disabled={full}
					onchange={(e) => uploadPicked(e.currentTarget)}
				/>
			</label>
		</div>
	{/if}
</section>
