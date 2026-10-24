<script lang="ts">
	import { page } from "$app/state";
	import { refreshAll } from "$app/navigation";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import {
		MAX_NOTATION_PER_SONG,
		NOTATION_ACCEPT,
		NOTATION_EXTENSIONS,
		NOTATION_MAX_BYTES,
		notationFormatOf,
	} from "#lib/constants/notationFormats.js";
	import { FILE_MAX_BYTES, MAX_FILES_PER_SONG } from "#lib/constants/fileFormats.js";
	import { deleteNotation, updateNotation } from "#lib/remote/notation.remote.js";
	import {
		clearChartReadOfFile,
		deleteFile,
		readChartOfFile,
		saveChartReadOfFile,
		updateFile,
	} from "#lib/remote/files.remote.js";
	import { chartReadWarnings } from "#lib/utils/chartReadWarnings.js";
	import type { PanelFile } from "#lib/components/SongFilesPanel.svelte";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { notationThumbnail } from "#lib/utils/notationThumbnail.js";
	import { renderNotation } from "#lib/utils/renderNotation.js";
	import { sanitizeSvg } from "#lib/utils/sanitizeSvg.js";
	import { shortenShareLink } from "#lib/utils/shortenShareLink.js";
	import {
		postJson,
		uploadFile,
		uploadNotationFile,
		type FileReservation,
		type NotationReservation,
	} from "#lib/upload.js";
	import type { Attachment } from "svelte/attachments";

	/**
	 * The notation files attached to a song (docs/uploads-and-blob.md,
	 * "Notation"), the Chart tab's notation mode (Kevin): MusicXML, as
	 * Dorico and the rest export it, compressed or not, and the song's PDFs
	 * marked as notation (uploaded here, or flagged on the PDFs tab). Tiles
	 * as the PDFs', with the first page Verovio drew at upload time, a ⋯
	 * menu (open, download, the rendered PDF, edit, remove) and a Share
	 * menu; a tile's page opens the score in a panel, every page engraved
	 * for the panel's width by Verovio in a worker (the engine loads only
	 * then), a PDF in the browser's reader. The page owns the lists and
	 * reloads them after a change.
	 */
	export interface PanelNotation {
		id: string;
		title: string;
		description: string;
		filename: string;
		format: "mxl" | "musicxml";
		sizeBytes: number;
		pageCount: number | null;
		url: string;
		thumbnailUrl: string | null;
		shareCode: string;
		status: string;
		/** The PDF the server rendered from it (docs/uploads-and-blob.md, "Notation"). */
		pdfStatus: "pending" | "ready" | "failed" | null;
	}
	/** A tile: a MusicXML file, or a PDF marked as notation. */
	type Tile = { kind: "xml"; row: PanelNotation } | { kind: "pdf"; row: PanelFile };
	interface Props {
		songId: string;
		/** The song's title, for the email's subject. */
		songTitle: string;
		notation: PanelNotation[];
		/** The song's PDFs marked as notation. */
		pdfs?: PanelFile[];
		canEdit: boolean;
		/** The AI is configured and allowed for this song: a PDF or image score has "What the AI read" (docs/audio-engine.md, "The chart read is stored"). */
		aiAvailable?: boolean;
		/** Run the song-check with the (corrected) read: the page asks the AI and shows its card. */
		oncheck?: () => void;
	}
	let {
		songId,
		songTitle,
		notation,
		pdfs = [],
		canEdit,
		aiAvailable = false,
		oncheck,
	}: Props = $props();

	// ── What the AI read (docs/audio-engine.md, "The chart read is stored"): the per-measure summary of a PDF or image score, shown for correction before it anchors the song-check ──
	interface Reading {
		file: PanelFile;
		text: string;
		/** The text as stored; `text` differs while an edit is unsaved. */
		stored: string;
		edited: boolean;
		busy: boolean;
		error: string | null;
	}
	let reading = $state<Reading | null>(null);
	let readWarnings = $derived(reading ? chartReadWarnings(reading.text) : []);
	let readDirty = $derived(!!reading && reading.text !== reading.stored);
	/** Open the read of a score file (the ⋯ menu, or the page's card when a check's read looked wrong). */
	export async function showRead(fileId: string) {
		const file = pdfs.find((p) => p.id === fileId);
		if (!file) return;
		reading = { file, text: "", stored: "", edited: false, busy: true, error: null };
		try {
			const r = await readChartOfFile({ id: fileId });
			if (reading?.file.id !== fileId) return;
			reading = { ...reading, text: r.text, stored: r.text, edited: r.edited, busy: false };
			if (r.fromModel)
				notify(`The AI read ${nameOf({ kind: "pdf", row: file })}`, { kind: "info" });
		} catch (e) {
			if (reading?.file.id !== fileId) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}
	async function saveRead() {
		if (!reading || reading.busy) return;
		const id = reading.file.id;
		reading = { ...reading, busy: true, error: null };
		try {
			const r = await saveChartReadOfFile({ id, text: reading.text });
			if (reading?.file.id !== id) return;
			reading = { ...reading, text: r.text, stored: r.text, edited: true, busy: false };
			notify("Your corrected read is saved; the AI checks the song against it from now on");
		} catch (e) {
			if (reading?.file.id !== id) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}
	/** The stored read gone, the model reads the file again (a correction is lost; the button says so). */
	async function readAgain() {
		if (!reading || reading.busy) return;
		if (reading.edited && !confirm("Drop your corrected read and let the AI read the file again?"))
			return;
		const id = reading.file.id;
		reading = { ...reading, busy: true, error: null };
		try {
			await clearChartReadOfFile({ id });
			await showRead(id);
		} catch (e) {
			if (reading?.file.id !== id) return;
			reading = { ...reading, busy: false, error: errorMessage(e) };
		}
	}

	let ready = $derived<Tile[]>([
		...notation
			.filter((n) => n.status === "ready" && n.url)
			.map((row) => ({ kind: "xml" as const, row })),
		...pdfs
			.filter((p) => p.status === "ready" && p.url)
			.map((row) => ({ kind: "pdf" as const, row })),
	]);
	/** Files handed over by the Attachments tab (MusicXML dropped there). */
	export async function upload(files: File[]) {
		await uploadFiles(files);
	}
	const isPdfName = (name: string) => /\.pdf$/i.test(name);
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	let picker = $state<HTMLInputElement | null>(null);
	let full = $derived(busy || notation.length >= MAX_NOTATION_PER_SONG);
	const ACCEPT = `${NOTATION_ACCEPT},.pdf,application/pdf`;
	/** The page's Uploads menu and the panel's ⋯ menu open the same picker. */
	export function pick() {
		picker?.click();
	}

	async function uploadPicked(input: HTMLInputElement) {
		const files = [...(input.files ?? [])];
		input.value = "";
		await uploadFiles(files);
	}
	async function uploadFiles(files: File[]) {
		if (files.length === 0) return;
		const room = Math.max(0, MAX_NOTATION_PER_SONG - notation.length);
		const xmlFiles = files.filter((f) => !isPdfName(f.name));
		if (xmlFiles.length > room)
			notify(
				`A song can have at most ${MAX_NOTATION_PER_SONG} notation files; the first ${room} were taken`,
				{ kind: "error" },
			);
		const picked = files.filter((f) => isPdfName(f.name) || xmlFiles.indexOf(f) < room);
		busy = true;
		jobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		let pdfRoom = Math.max(0, MAX_FILES_PER_SONG - pdfs.length);
		for (const [i, file] of picked.entries()) {
			if (isPdfName(file.name)) {
				// A PDF of a score: the PDFs' flow, flagged as notation, so it shows on both views.
				if (file.size > FILE_MAX_BYTES.pdf) {
					jobs[i].error = `Over ${formatBytes(FILE_MAX_BYTES.pdf)}`;
					continue;
				}
				if (pdfRoom <= 0) {
					jobs[i].error = `A song can have at most ${MAX_FILES_PER_SONG} attachments`;
					continue;
				}
				try {
					await uploadFile(
						file,
						() =>
							postJson<FileReservation>("/api/files", {
								songId,
								filename: file.name,
								sizeBytes: file.size,
								notation: true,
							}),
						(percent) => (jobs[i].percent = percent),
					);
					pdfRoom--;
				} catch (e) {
					jobs[i].error = errorMessage(e);
				}
				continue;
			}
			if (!notationFormatOf(file.name)) {
				jobs[i].error = `Not MusicXML (${NOTATION_EXTENSIONS.map((e) => `.${e}`).join(", ")})`;
				continue;
			}
			if (file.size > NOTATION_MAX_BYTES) {
				jobs[i].error = `Over ${formatBytes(NOTATION_MAX_BYTES)}`;
				continue;
			}
			try {
				await uploadNotationFile(
					file,
					() =>
						postJson<NotationReservation>("/api/notation", {
							songId,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (jobs[i].percent = percent),
					() => notationThumbnail(file),
				);
			} catch (e) {
				jobs[i].error = errorMessage(e);
			}
		}
		await refreshAll();
		busy = false;
		if (jobs.every((j) => !j.error)) jobs = [];
	}

	// ---- editing a tile's words ----
	let editing = $state<string | null>(null);
	let draftTitle = $state("");
	let draftDescription = $state("");
	let saving = $state(false);
	function startEdit(t: Tile) {
		editing = t.row.id;
		draftTitle = t.row.title;
		draftDescription = t.row.description;
	}
	async function saveEdit(t: Tile) {
		saving = true;
		try {
			const words = { id: t.row.id, title: draftTitle, description: draftDescription };
			if (t.kind === "xml") await updateNotation(words);
			else await updateFile(words);
			editing = null;
			await refreshAll();
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function remove(t: Tile) {
		if (!confirm(`Remove "${nameOf(t)}" from this song? The file is deleted.`)) return;
		try {
			if (t.kind === "xml") await deleteNotation({ id: t.row.id });
			else await deleteFile({ id: t.row.id });
			notify(`${nameOf(t)} removed`);
			if (viewing?.row.id === t.row.id) viewing = null;
			await refreshAll();
		} catch (e) {
			notify(`Could not remove it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A PDF unmarked as notation leaves this view (it stays on the PDFs tab). */
	async function unmark(p: PanelFile) {
		try {
			await updateFile({ id: p.id, title: p.title, description: p.description, isNotation: false });
			notify(`${p.title || p.filename} is a plain PDF again`);
			await refreshAll();
		} catch (e) {
			notify(`Could not change it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** The permanent link's download switch: the file streamed as an attachment under its own name (`/f/[code]`); `pdf` for the PDF the server rendered. */
	const downloadUrl = (t: Tile, pdf = false) =>
		`/f/${t.row.shareCode}?download=${pdf && t.kind === "xml" ? "pdf" : "1"}`;
	const linkOf = (t: Tile) => `${page.url.origin}/f/${t.row.shareCode}`;
	async function copyLink(t: Tile) {
		// The permanent link in its short form by default (Kevin); the permanent one when no code can be had.
		const url = await shortenShareLink(linkOf(t), "other");
		try {
			await navigator.clipboard.writeText(url);
			notify("Link copied");
		} catch {
			notify(url);
		}
	}
	function mailLink(t: Tile) {
		const name = nameOf(t);
		const subject = `${songTitle}: ${name}`;
		const body = `${name}\n${linkOf(t)}`;
		return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}
	const nameOf = (t: Tile) => t.row.title || t.row.filename;
	const kindLabel = (t: Tile) =>
		t.kind === "pdf"
			? t.row.kind === "image"
				? "Image"
				: "PDF"
			: t.row.format === "mxl"
				? "MXL"
				: "MusicXML";

	// ---- the viewer: the score engraved for the panel's width ----
	let viewing = $state<Tile | null>(null);
	let pages = $state<string[]>([]);
	let rendering = $state(false);
	let renderError = $state<string | null>(null);
	let width = $state(0);
	let bytes: { id: string; data: ArrayBuffer } | null = null;
	let renderTimer: ReturnType<typeof setTimeout> | null = null;
	let renderRun = 0;
	async function fileBytes(t: Tile): Promise<ArrayBuffer> {
		if (bytes?.id === t.row.id) return bytes.data;
		// Through the permanent link, same origin, so a private song's file comes too.
		const res = await fetch(downloadUrl(t));
		if (!res.ok) throw new Error(`The file did not load (${res.status})`);
		const data = await res.arrayBuffer();
		bytes = { id: t.row.id, data };
		return data;
	}
	async function render() {
		const t = viewing;
		if (!t || t.kind !== "xml" || width < 100) return;
		const run = ++renderRun;
		rendering = true;
		renderError = null;
		try {
			const data = await fileBytes(t);
			const out = await renderNotation(data, t.row.filename, { width, scale: 40 });
			if (run !== renderRun) return;
			pages = out.svgs.map(sanitizeSvg);
		} catch (e) {
			if (run !== renderRun) return;
			pages = [];
			renderError = errorMessage(e);
		} finally {
			if (run === renderRun) rendering = false;
		}
	}
	function open(t: Tile) {
		if (viewing?.row.id !== t.row.id) pages = [];
		viewing = t;
		void render();
	}
	/** The score follows the panel's width: measured here, re-engraved as it settles. */
	const measured: Attachment<HTMLElement> = (node) => {
		const ro = new ResizeObserver(() => {
			const next = Math.round(node.clientWidth);
			if (!next || next === width) return;
			width = next;
			if (renderTimer) clearTimeout(renderTimer);
			renderTimer = setTimeout(() => void render(), 250);
		});
		ro.observe(node);
		return () => {
			ro.disconnect();
			if (renderTimer) clearTimeout(renderTimer);
		};
	};
</script>

<section class="flex flex-col gap-3 h-full" aria-label="Notation">
	{#if jobs.length > 0}
		<ul class="grid gap-1 text-13px" aria-label="Notation uploads">
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
		<!-- Short, and kept clear of the Text / Notation toggle beside it; the how goes in the tip (Kevin). -->
		<p class="flex max-w-xs items-center gap-1.5 opacity-70 text-14px">
			{#if canEdit}
				<InfoTip
					label="How to add notation"
					text="Upload MusicXML (.mxl or .musicxml, as Dorico, MuseScore and Sibelius export it) and the score is engraved here, or a PDF of the score."
				/>
			{/if}
			No notation yet.
		</p>
	{:else}
		<ul
			class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
			aria-label="Notation list"
		>
			{#each ready as t (t.row.id)}
				{@const n = t.row}
				<li
					class="rounded-md border border-white/15 bg-black/20 p-2 grid gap-2 content-start"
					aria-label={nameOf(t)}
				>
					<button
						class="block aspect-[1/1.3] w-full overflow-hidden rounded bg-white/90 cursor-pointer"
						type="button"
						title="Open the score in a panel"
						aria-label="Open {nameOf(t)}"
						onclick={() => open(t)}
					>
						{#if t.kind === "pdf" && t.row.kind === "image"}
							<img
								class="w-full h-full object-cover object-top"
								src={n.url}
								alt={nameOf(t)}
								loading="lazy"
							/>
						{:else if n.thumbnailUrl}
							<img
								class="w-full h-full object-cover object-top"
								src={n.thumbnailUrl}
								alt="First page of {nameOf(t)}"
								loading="lazy"
							/>
						{:else}
							<span class="flex h-full w-full items-center justify-center text-oxford">
								<span
									class="{t.kind === 'pdf' ? 'i-ph-file-pdf' : 'i-ph-music-notes-simple'} text-40px"
									aria-hidden="true"
								></span>
							</span>
						{/if}
					</button>
					{#if editing === n.id}
						<form
							class="grid gap-2 text-13px"
							onsubmit={(e) => {
								e.preventDefault();
								void saveEdit(t);
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
							<h3 class="font-600 text-13px leading-tight truncate" title={nameOf(t)}>
								{nameOf(t)}
							</h3>
							{#if n.description}
								<p class="text-12px opacity-85 line-clamp-2" title={n.description}>
									{n.description}
								</p>
							{/if}
							<p class="text-11px opacity-60 truncate" title={n.filename}>
								{[formatBytes(n.sizeBytes), kindLabel(t)].join(" · ")}
							</p>
						</div>
						<div class="flex items-center justify-between gap-1">
							<ContextMenu
								ariaLabel="Actions for {nameOf(t)}"
								title="Open, download, edit, remove"
								buttonBaseClasses="button button-xs"
								position="bottom right"
								items={[
									{
										id: "open",
										label: "Open",
										iconClass: "i-ph-arrows-out-simple",
										title: "Open the score in a panel",
										action: () => open(t),
									},
									{
										id: "download",
										label: t.kind === "pdf" ? "Download" : "Download MusicXML",
										iconClass: "i-ph-download-simple",
										title: t.kind === "pdf" ? "Download the PDF" : "Download the MusicXML file",
										kind: "link",
										href: downloadUrl(t),
									},
									{
										id: "download-pdf",
										label: "Download as PDF",
										iconClass: "i-ph-file-pdf",
										title: "The score as a PDF, rendered when it was uploaded",
										condition: t.kind === "xml" && t.row.pdfStatus === "ready",
										kind: "link",
										href: downloadUrl(t, true),
									},
									{
										id: "edit",
										label: "Edit",
										iconClass: "i-ph-pencil-simple",
										title: "Change the title and description",
										condition: canEdit,
										action: () => startEdit(t),
									},
									{
										id: "read",
										label: "What the AI read",
										iconClass: "i-ph-text-align-left",
										title:
											"The chart as the AI read it, one line per measure: check and correct it before the AI checks the song against it",
										condition: canEdit && aiAvailable && t.kind === "pdf",
										action: () => (t.kind === "pdf" ? void showRead(t.row.id) : undefined),
									},
									{
										id: "unmark",
										label: "Not notation",
										iconClass: "i-ph-file",
										title: "A plain PDF: off this view, still on the PDFs tab",
										condition: canEdit && t.kind === "pdf",
										action: () => (t.kind === "pdf" ? unmark(t.row) : undefined),
									},
									{
										id: "remove",
										label: "Remove",
										iconClass: "i-ph-trash",
										title: "Remove this file from the song",
										condition: canEdit,
										action: () => remove(t),
									},
								]}
							/>
							<ContextMenu
								ariaLabel="Share {nameOf(t)}"
								title="Copy the permanent link, or share it by email"
								iconClass="i-ph-share-network"
								buttonBaseClasses="button button-xs"
								position="bottom left"
								items={[
									{
										id: "copy",
										label: "Copy link",
										iconClass: "i-ph-link",
										title: "A permanent link to this file",
										action: () => copyLink(t),
									},
									{
										id: "mail",
										label: "Share via email",
										iconClass: "i-ph-envelope-simple",
										title: "A new email with the link, in your mail app",
										kind: "link",
										href: mailLink(t),
									},
								]}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<!-- The viewer: a score's pages engraved for the panel's width, or a PDF in the browser's reader, in a panel dragged and resized from lg, docked here below. -->
	<FloatingPanel
		open={viewing !== null}
		title={viewing ? nameOf(viewing) : ""}
		storageKey="stemshovel.song.notation-viewer"
		width={860}
		height={900}
		onminimise={() => (viewing = null)}
	>
		{#snippet controls()}
			{#if viewing}
				<a
					class="button button-xs"
					href={downloadUrl(viewing)}
					title={viewing.kind === "pdf" ? "Download the PDF" : "Download the MusicXML file"}
					aria-label="Download {nameOf(viewing)}"
				>
					<span class="i-ph-download-simple" aria-hidden="true"></span>
					Download
				</a>
				{#if viewing.kind === "xml" && viewing.row.pdfStatus === "ready"}
					<a
						class="button button-xs"
						href={downloadUrl(viewing, true)}
						title="The score as a PDF, rendered when it was uploaded"
						aria-label="Download {nameOf(viewing)} as PDF"
					>
						<span class="i-ph-file-pdf" aria-hidden="true"></span>
						PDF
					</a>
				{/if}
				<button
					class="button button-xs"
					type="button"
					title="Copy a permanent link to this file"
					aria-label="Copy a link to {nameOf(viewing)}"
					onclick={() => viewing && copyLink(viewing)}
				>
					<span class="i-ph-link" aria-hidden="true"></span>
				</button>
			{/if}
		{/snippet}
		<!-- A PDF fills the panel's height (the reader scrolls inside); pages and images grow with their content. A min-height alone left the reader at its minimum over a white box (Kevin, 2026-10-09). -->
		<div
			class="{viewing?.kind === 'pdf' && viewing.row.kind !== 'image'
				? 'h-full flex flex-col'
				: 'min-h-full'} bg-white text-black rounded"
			{@attach measured}
			aria-live="polite"
		>
			{#if viewing?.kind === "pdf" && viewing.row.kind === "image"}
				<img
					class="max-w-full h-auto rounded bg-white"
					src={viewing.row.url}
					alt={nameOf(viewing)}
				/>
			{:else if viewing?.kind === "pdf"}
				<iframe
					class="w-full flex-1 min-h-480px rounded bg-white"
					src={viewing.row.url}
					title={nameOf(viewing)}
				></iframe>
			{:else if renderError}
				<p class="p-4 text-14px text-red-700">Could not engrave this file: {renderError}</p>
			{:else if pages.length === 0}
				<p class="p-4 text-14px opacity-60">{rendering ? "Engraving…" : "Loading…"}</p>
			{:else}
				<div class="grid gap-2 p-2 [&_svg]-(w-full h-auto)" aria-label="Score pages">
					{#each pages as svg, i (i)}
						<div class="notation-page">{@html svg}</div>
					{/each}
				</div>
			{/if}
		</div>
	</FloatingPanel>
	<!-- What the AI read: the per-measure text in an editor, what looks wrong in amber (utils/chartReadWarnings.ts), saved as the read the song-check uses. -->
	<FloatingPanel
		open={reading !== null}
		title={reading ? `What the AI read of ${nameOf({ kind: "pdf", row: reading.file })}` : ""}
		storageKey="stemshovel.song.chart-read"
		width={720}
		height={640}
		onminimise={() => (reading = null)}
	>
		{#snippet controls()}
			{#if reading}
				<button
					class="button button-xs"
					type="button"
					disabled={reading.busy || !readDirty}
					title="Keep this text as the chart the AI checks the song against"
					onclick={saveRead}
				>
					<span class="i-ph-floppy-disk" aria-hidden="true"></span>
					Save
				</button>
				<button
					class="button button-xs"
					type="button"
					disabled={reading.busy}
					title={reading.edited
						? "Drop the corrected read and let the AI read the file again"
						: "Let the AI read the file again"}
					onclick={readAgain}
				>
					<span class="i-ph-arrow-clockwise" aria-hidden="true"></span>
					Read again
				</button>
				{#if oncheck}
					<button
						class="button button-xs"
						type="button"
						disabled={reading.busy || readDirty}
						title={readDirty
							? "Save the read first"
							: "Ask the AI to check the song's key, tempo and meter against this read"}
						onclick={() => {
							reading = null;
							oncheck?.();
						}}
					>
						<span class="i-ph-sparkle" aria-hidden="true"></span>
						Check the song
					</button>
				{/if}
			{/if}
		{/snippet}
		<div class="min-h-full flex flex-col gap-2 p-2" aria-live="polite">
			{#if reading?.busy && !reading.text}
				<p class="p-2 text-14px opacity-60">Reading the chart…</p>
			{:else if reading}
				<p class="text-12px opacity-70">
					One line per measure, as the AI read the file{reading.edited
						? "; corrected by the band"
						: ""}. Fix a wrong key, chord or measure number here and save: the song-check reads this
					text, not the file.
				</p>
				{#if readWarnings.length > 0}
					<ul class="text-13px text-amber-300 grid gap-1" role="alert">
						{#each readWarnings as w (w)}
							<li>
								<span class="i-ph-warning align-text-bottom" aria-hidden="true"></span>
								{w}
							</li>
						{/each}
					</ul>
				{/if}
				{#if reading.error}
					<p class="text-13px text-red-400" role="alert">{reading.error}</p>
				{/if}
				<textarea
					class="field font-mono text-12px leading-snug flex-1 min-h-320px w-full resize-y"
					spellcheck="false"
					aria-label="What the AI read, one line per measure"
					disabled={reading.busy}
					bind:value={reading.text}></textarea>
			{/if}
		</div>
	</FloatingPanel>
	{#if canEdit}
		<div class="flex justify-end mt-auto pt-2">
			<label
				class="button button-sm cursor-pointer {full ? 'opacity-50 pointer-events-none' : ''}"
				title="MusicXML (.mxl or .musicxml, up to {formatBytes(
					NOTATION_MAX_BYTES,
				)} each) or a PDF of the score (up to {formatBytes(FILE_MAX_BYTES.pdf)})"
			>
				<span class="i-ph-music-notes-simple" aria-hidden="true"></span>
				{busy ? "Uploading…" : "Upload Notation"}
				<input
					class="sr-only"
					type="file"
					accept={ACCEPT}
					multiple
					bind:this={picker}
					disabled={full}
					onchange={(e) => uploadPicked(e.currentTarget)}
				/>
			</label>
		</div>
	{/if}
</section>
