<script lang="ts">
	import { page } from "$app/state";
	import { invalidateAll } from "$app/navigation";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import FloatingPanel from "$lib/components/FloatingPanel.svelte";
	import {
		FILE_ACCEPT,
		FILE_KIND_LABELS,
		FILE_MAX_BYTES,
		MAX_FILES_PER_SONG,
		fileKindOf,
		type FileKind,
	} from "$lib/constants/fileFormats";
	import { notationFormatOf } from "$lib/constants/notationFormats";
	import { attachFile, deleteFile, updateFile, useAsDemo } from "$lib/remote/files.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { postJson, uploadFile, type FileReservation } from "$lib/upload";
	import { shortenShareLink } from "$lib/utils/shortenShareLink";

	/**
	 * The files attached to a song (docs/uploads-and-blob.md, "Attachments"),
	 * the Docs panel's Attachments tab (Kevin): PDFs, images, audio scraps for
	 * discussion, text, MIDI, anything else, each a tile with a ⋯ menu (open,
	 * download, edit, a Notation switch for a PDF or image, Use as demo for
	 * audio, remove) and a Share menu (the permanent link, a mention for the
	 * notes, email). Audio plays in the tile. The scores (MusicXML on the
	 * Chart tab) are listed here too, so the tab is the song's whole
	 * inventory. The page owns the lists and reloads them after a change.
	 */
	export interface PanelFile {
		id: string;
		kind: FileKind;
		title: string;
		description: string;
		filename: string;
		sizeBytes: number;
		pageCount: number | null;
		url: string;
		thumbnailUrl: string | null;
		shareCode: string;
		status: string;
		/** A score: shown on the Chart tab's notation view as well. */
		isNotation: boolean;
		/** The song it belongs to, null for a project-level file (the project view says which). */
		songId?: string | null;
		song?: { id: string; title: string; slug: string } | null;
	}
	/** A MusicXML file (the Chart tab's), listed here as a score. */
	export interface PanelScore {
		id: string;
		title: string;
		filename: string;
		sizeBytes: number;
		shareCode: string;
		status: string;
		pdfStatus?: "pending" | "ready" | "failed" | null;
		song?: { id: string; title: string; slug: string } | null;
	}
	interface Props {
		/** The song the panel belongs to, or the project when it is the project's library (Kevin: "Attachments & Downloads"). */
		songId?: string;
		projectId?: string;
		/** The song's (or project's) title, for the email's subject. */
		songTitle: string;
		files: PanelFile[];
		scores?: PanelScore[];
		canEdit: boolean;
		/** The project's songs, for Attach (the project view). */
		songs?: { id: string; title: string; slug: string }[];
		/** Links a tile to its song (the project view). */
		songHref?: (song: { slug: string }) => string;
		/** A MusicXML file dropped here goes to the Chart tab's flow (the song view). */
		onnotation?: (files: File[]) => Promise<void>;
	}
	let {
		songId,
		projectId,
		songTitle,
		files,
		scores = [],
		canEdit,
		songs = [],
		songHref,
		onnotation,
	}: Props = $props();
	/** The project view lists across songs: tiles name their song and can move. */
	let projectView = $derived(!songId && !!projectId);

	let ready = $derived(files.filter((f) => f.status === "ready" && f.url));
	let readyScores = $derived(scores.filter((s) => s.status === "ready"));
	type Filter = "all" | "scores" | FileKind;
	let filter = $state<Filter>("all");
	let shown = $derived(
		filter === "all"
			? ready
			: filter === "scores"
				? ready.filter((f) => f.isNotation)
				: ready.filter((f) => f.kind === filter),
	);
	/** The filter chips, only for kinds the song has (and only once it has a few files). */
	let filters = $derived.by((): { id: Filter; label: string; count: number }[] => {
		const chips: { id: Filter; label: string; count: number }[] = [
			{ id: "all", label: "All", count: ready.length + readyScores.length },
		];
		const scoreCount = ready.filter((f) => f.isNotation).length + readyScores.length;
		if (scoreCount) chips.push({ id: "scores", label: "Scores", count: scoreCount });
		for (const kind of ["audio", "pdf", "image", "text", "midi", "other"] as FileKind[]) {
			const count = ready.filter((f) => f.kind === kind).length;
			if (count) chips.push({ id: kind, label: FILE_KIND_LABELS[kind], count });
		}
		return chips;
	});
	let jobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let busy = $state(false);
	let picker = $state<HTMLInputElement | null>(null);
	let full = $derived(busy || (!projectView && files.length >= MAX_FILES_PER_SONG));
	const ACCEPT = projectView ? FILE_ACCEPT : `${FILE_ACCEPT},.mxl,.musicxml`;
	/** The page's Uploads menu and the panel's ⋯ menu open the same picker. */
	export function pick() {
		picker?.click();
	}

	async function uploadPicked(input: HTMLInputElement) {
		const all = [...(input.files ?? [])];
		input.value = "";
		if (all.length === 0) return;
		// MusicXML belongs to the Chart tab's flow.
		const xml = all.filter((f) => notationFormatOf(f.name) && !/\.xml$/i.test(f.name));
		const picked = all.filter((f) => !xml.includes(f));
		if (xml.length && onnotation) void onnotation(xml);
		const room = projectView ? picked.length : Math.max(0, MAX_FILES_PER_SONG - files.length);
		if (picked.length > room)
			notify(
				`A song can have at most ${MAX_FILES_PER_SONG} attachments; the first ${room} were taken`,
				{
					kind: "error",
				},
			);
		const taken = picked.slice(0, room);
		if (taken.length === 0) return;
		busy = true;
		jobs = taken.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of taken.entries()) {
			const kind = fileKindOf(file.name, file.type);
			if (file.size > FILE_MAX_BYTES[kind]) {
				jobs[i].error =
					`Over ${formatBytes(FILE_MAX_BYTES[kind])} for ${FILE_KIND_LABELS[kind].toLowerCase()} files`;
				continue;
			}
			try {
				await uploadFile(
					file,
					() =>
						postJson<FileReservation>("/api/files", {
							...(projectView ? { projectId } : { songId }),
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
	function startEdit(f: PanelFile) {
		editing = f.id;
		draftTitle = f.title;
		draftDescription = f.description;
	}
	async function saveEdit(id: string) {
		saving = true;
		try {
			await updateFile({ id, title: draftTitle, description: draftDescription });
			editing = null;
			await invalidateAll();
		} catch (e) {
			notify(`Could not save: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	async function remove(f: PanelFile) {
		if (!confirm(`Remove "${nameOf(f)}" from this song? The file is deleted.`)) return;
		try {
			await deleteFile({ id: f.id });
			notify(`${nameOf(f)} removed`);
			if (viewing?.id === f.id) viewing = null;
			await invalidateAll();
		} catch (e) {
			notify(`Could not remove it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A PDF or image marked as notation (or not): it joins or leaves the Chart tab's notation view. */
	async function setNotation(f: PanelFile, on: boolean) {
		try {
			await updateFile({ id: f.id, title: f.title, description: f.description, isNotation: on });
			notify(on ? `${nameOf(f)} shows as notation` : `${nameOf(f)} is a plain file again`);
			await invalidateAll();
		} catch (e) {
			notify(`Could not change it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** A file moved to one of the project's songs, or back to the project itself (the project view). */
	let attaching = $state<string | null>(null);
	async function attach(f: PanelFile, to: string) {
		attaching = null;
		const target = to === "" ? null : to;
		if ((f.songId ?? null) === target) return;
		try {
			await attachFile({ id: f.id, songId: target });
			const song = target ? songs.find((x) => x.id === target) : null;
			notify(
				song ? `${nameOf(f)} is on “${song.title}” now` : `${nameOf(f)} belongs to the project now`,
			);
			await invalidateAll();
		} catch (e) {
			notify(`Could not move it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** An audio attachment copied into the song's demos, so it plays in the player with the rest. */
	async function makeDemo(f: PanelFile) {
		try {
			await useAsDemo({ id: f.id });
			notify(`${nameOf(f)} is a demo now: find it on the player's Demos tab`);
			await invalidateAll();
		} catch (e) {
			notify(`Could not make a demo of it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	/** The permanent link's download switch: the file streamed as an attachment under its own name (`/f/[code]`). */
	const downloadUrl = (code: string) => `/f/${code}?download=1`;
	const linkOf = (code: string) => `${page.url.origin}/f/${code}`;
	/** Copy link: the permanent link in its short form by default (Kevin), the permanent one itself when no code can be had. */
	async function copyShort(code: string) {
		await copy(await shortenShareLink(linkOf(code), "other"), "Link copied");
	}
	async function copy(text: string, said: string) {
		try {
			await navigator.clipboard.writeText(text);
			notify(said);
		} catch {
			notify(text);
		}
	}
	/** A mention: `@Title` in a note links to the file when the note is shown (docs/uploads-and-blob.md, "Mentions"). */
	const mentionOf = (name: string) => `@${name}`;
	function mailLink(name: string, code: string) {
		const subject = `${songTitle}: ${name}`;
		const body = `${name}\n${linkOf(code)}`;
		return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
	}
	const pagesLabel = (n: number | null) => (n === null ? "" : n === 1 ? "1 page" : `${n} pages`);
	const nameOf = (f: { title: string; filename: string }) => f.title || f.filename;
	const iconOf = (kind: FileKind) =>
		kind === "pdf"
			? "i-ph-file-pdf"
			: kind === "image"
				? "i-ph-image"
				: kind === "audio"
					? "i-ph-waveform"
					: kind === "text"
						? "i-ph-file-text"
						: kind === "midi"
							? "i-ph-piano-keys"
							: "i-ph-file";

	/** The file open in its own panel: a PDF or text in the browser's reader, an image, or audio with its player. */
	let viewing = $state<PanelFile | null>(null);
</script>

<section class="flex flex-col gap-3 h-full" aria-label="Attachments">
	{#if filters.length > 2}
		<div class="flex flex-wrap gap-1" role="group" aria-label="Show">
			{#each filters as chip (chip.id)}
				<button
					type="button"
					class="button button-xs {filter === chip.id
						? 'bg-blue-300 text-oxford border-blue-300'
						: 'opacity-80'}"
					aria-pressed={filter === chip.id}
					onclick={() => (filter = chip.id)}>{chip.label} ({chip.count})</button
				>
			{/each}
		</div>
	{/if}
	{#if jobs.length > 0}
		<ul class="grid gap-1 text-13px" aria-label="Attachment uploads">
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
	{#if ready.length === 0 && readyScores.length === 0 && jobs.length === 0}
		<p class="opacity-70 text-14px">
			No attachments yet.{#if canEdit}
				Upload a chart, a photo, a scrap of audio for the band to hear, a text file, a MIDI file{projectView
					? ", for the project or to attach to a song later"
					: ""}.{/if}
		</p>
	{:else}
		<ul
			class="grid gap-3 grid-cols-[repeat(auto-fill,minmax(150px,1fr))]"
			aria-label="Attachment list"
		>
			{#if filter === "all" || filter === "scores"}
				{#each readyScores as s (s.id)}
					<!-- A MusicXML score lives on the Chart tab; listed here so the inventory is whole. -->
					<li
						class="rounded-md border border-white/15 bg-black/20 p-2 grid gap-2 content-start"
						aria-label={nameOf(s)}
					>
						<span
							class="flex aspect-[1/1.3] w-full items-center justify-center rounded bg-white/90 text-oxford"
						>
							<span class="i-ph-music-notes-simple text-40px" aria-hidden="true"></span>
						</span>
						<div class="grid gap-0.5 min-w-0">
							<h3 class="font-600 text-13px leading-tight truncate" title={nameOf(s)}>
								{nameOf(s)}
							</h3>
							{#if projectView && s.song}
								<a class="text-12px link-dim truncate" href={songHref?.(s.song) ?? "#"}
									>{s.song.title}</a
								>
							{/if}
							<p class="text-11px opacity-60 truncate">
								{formatBytes(s.sizeBytes)} · score{projectView ? "" : ", on the Chart tab"}
							</p>
						</div>
						<div class="flex items-center justify-between gap-1">
							<a
								class="button button-xs"
								href={downloadUrl(s.shareCode)}
								title="Download the MusicXML file"
							>
								<span class="i-ph-download-simple" aria-hidden="true"></span>
							</a>
							<button
								class="button button-xs"
								type="button"
								title="Copy a mention for the notes"
								onclick={() => copy(mentionOf(nameOf(s)), "Mention copied")}
							>
								<span class="i-ph-at" aria-hidden="true"></span>
							</button>
						</div>
					</li>
				{/each}
			{/if}
			{#each shown as f (f.id)}
				<li
					class="rounded-md border border-white/15 bg-black/20 p-2 grid gap-2 content-start"
					aria-label={nameOf(f)}
				>
					{#if f.kind === "audio"}
						<div class="grid gap-1 rounded bg-white/5 p-2">
							<span class="flex items-center gap-2 text-12px opacity-70">
								<span class="i-ph-waveform" aria-hidden="true"></span>Audio
							</span>
							<!-- svelte-ignore a11y_media_has_caption -->
							<audio class="w-full h-8" controls preload="none" src={f.url}></audio>
						</div>
					{:else}
						<button
							class="block aspect-[1/1.3] w-full overflow-hidden rounded bg-white/90 cursor-pointer"
							type="button"
							title="Open in a panel"
							aria-label="Open {nameOf(f)}"
							onclick={() => (viewing = f)}
						>
							{#if f.kind === "image"}
								<img
									class="w-full h-full object-cover object-top"
									src={f.url}
									alt={nameOf(f)}
									loading="lazy"
								/>
							{:else if f.thumbnailUrl}
								<img
									class="w-full h-full object-cover object-top"
									src={f.thumbnailUrl}
									alt="First page of {nameOf(f)}"
									loading="lazy"
								/>
							{:else}
								<span class="flex h-full w-full items-center justify-center text-oxford">
									<span class="{iconOf(f.kind)} text-40px" aria-hidden="true"></span>
								</span>
							{/if}
						</button>
					{/if}
					{#if attaching === f.id}
						<h3 class="font-600 text-13px leading-tight truncate" title={nameOf(f)}>{nameOf(f)}</h3>
						<label class="grid gap-1 text-13px">
							<span class="opacity-80">Attach to</span>
							<select
								class="field"
								value={f.songId ?? ""}
								onchange={(e) => attach(f, e.currentTarget.value)}
								aria-label="Attach {nameOf(f)} to"
							>
								<option value="">The project (no song)</option>
								{#each songs as sg (sg.id)}<option value={sg.id}>{sg.title}</option>{/each}
							</select>
							<button
								class="button button-xs justify-self-start"
								type="button"
								onclick={() => (attaching = null)}>Cancel</button
							>
						</label>
					{:else if editing === f.id}
						<form
							class="grid gap-2 text-13px"
							onsubmit={(e) => {
								e.preventDefault();
								void saveEdit(f.id);
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
								<button class="button button-xs" type="submit" disabled={saving}
									>{saving ? "Saving…" : "Save"}</button
								>
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
							<h3 class="font-600 text-13px leading-tight truncate" title={nameOf(f)}>
								{nameOf(f)}
							</h3>
							{#if projectView}
								{#if f.song}
									<a class="text-12px link-dim truncate" href={songHref?.(f.song) ?? "#"}
										>{f.song.title}</a
									>
								{:else}
									<span class="text-12px opacity-60">the project</span>
								{/if}
							{/if}
							{#if f.description}
								<p class="text-12px opacity-85 line-clamp-2" title={f.description}>
									{f.description}
								</p>
							{/if}
							<p class="text-11px opacity-60 truncate" title={f.filename}>
								{[
									FILE_KIND_LABELS[f.kind],
									pagesLabel(f.pageCount),
									formatBytes(f.sizeBytes),
									f.isNotation ? "notation" : "",
								]
									.filter(Boolean)
									.join(" · ")}
							</p>
						</div>
						<div class="flex items-center justify-between gap-1">
							<ContextMenu
								ariaLabel="Actions for {nameOf(f)}"
								title="Open, download, edit, remove"
								buttonBaseClasses="button button-xs"
								position="bottom right"
								items={[
									{
										id: "open",
										label: "Open",
										iconClass: "i-ph-arrows-out-simple",
										title: "Open in a panel",
										action: () => {
											viewing = f;
										},
									},
									{
										id: "download",
										label: "Download",
										iconClass: "i-ph-download-simple",
										title: "Download the file",
										kind: "link",
										href: downloadUrl(f.shareCode),
									},
									{
										id: "tab",
										label: "Open in a new tab",
										iconClass: "i-ph-arrow-square-out",
										kind: "link",
										href: f.url,
										target: "_blank",
									},
									{
										id: "edit",
										label: "Edit",
										iconClass: "i-ph-pencil-simple",
										title: "Change the title and description",
										condition: canEdit,
										action: () => startEdit(f),
									},
									{
										id: "notation",
										label: "Notation",
										iconClass: f.isNotation ? "i-ph-check" : "i-ph-check invisible",
										title: "A score: shown on the Chart tab's notation view as well",
										condition:
											canEdit &&
											(f.kind === "pdf" || f.kind === "image") &&
											(!projectView || !!f.songId),
										action: () => setNotation(f, !f.isNotation),
									},
									{
										id: "demo",
										label: "Use as demo",
										iconClass: "i-ph-microphone",
										title: "A copy becomes a demo of the song, played in the player",
										condition: canEdit && f.kind === "audio" && (!projectView || !!f.songId),
										action: () => makeDemo(f),
									},
									{
										id: "attach",
										label: f.songId ? "Move to another song…" : "Attach to a song…",
										iconClass: "i-ph-arrow-bend-up-right",
										title: "Move this file to one of the project's songs, or back to the project",
										condition: canEdit && projectView,
										action: () => {
											attaching = f.id;
										},
									},
									{
										id: "remove",
										label: "Remove",
										iconClass: "i-ph-trash",
										title: "Remove this file from the song",
										condition: canEdit,
										action: () => remove(f),
									},
								]}
							/>
							<ContextMenu
								ariaLabel="Share {nameOf(f)}"
								title="Copy the permanent link, a mention, or share it by email"
								iconClass="i-ph-share-network"
								buttonBaseClasses="button button-xs"
								position="bottom left"
								items={[
									{
										id: "copy",
										label: "Copy link",
										iconClass: "i-ph-link",
										title: "A permanent link to this file",
										action: () => copyShort(f.shareCode),
									},
									{
										id: "mention",
										label: "Copy mention",
										iconClass: "i-ph-at",
										title: "Paste it in a note: @Title links to the file",
										action: () => copy(mentionOf(nameOf(f)), "Mention copied"),
									},
									{
										id: "mail",
										label: "Share via email",
										iconClass: "i-ph-envelope-simple",
										title: "A new email with the link, in your mail app",
										kind: "link",
										href: mailLink(nameOf(f), f.shareCode),
									},
								]}
							/>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
	<!-- The viewer: a PDF or text in the browser's reader, an image, or audio with its player, in a panel dragged and resized from lg, docked here below. -->
	<FloatingPanel
		open={viewing !== null}
		title={viewing ? nameOf(viewing) : ""}
		storageKey="stemshovel.song.file-viewer"
		width={760}
		height={860}
		onminimise={() => (viewing = null)}
	>
		{#snippet controls()}
			{#if viewing}
				<a
					class="button button-xs"
					href={downloadUrl(viewing.shareCode)}
					title="Download the file"
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
					title="Open in a new tab"
					aria-label="Open {nameOf(viewing)} in a new tab"
				>
					<span class="i-ph-arrow-square-out" aria-hidden="true"></span>
				</a>
				<button
					class="button button-xs"
					type="button"
					title="Copy a permanent link to this file"
					aria-label="Copy a link to {nameOf(viewing)}"
					onclick={() => viewing && copyShort(viewing.shareCode)}
				>
					<span class="i-ph-link" aria-hidden="true"></span>
				</button>
			{/if}
		{/snippet}
		{#if viewing?.kind === "image"}
			<img class="max-w-full h-auto rounded bg-white" src={viewing.url} alt={nameOf(viewing)} />
		{:else if viewing?.kind === "audio"}
			<!-- svelte-ignore a11y_media_has_caption -->
			<audio class="w-full" controls src={viewing.url}></audio>
		{:else if viewing}
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
				title="PDFs, images, audio, text, MIDI; MusicXML goes to the Chart tab"
			>
				<span class="i-ph-paperclip" aria-hidden="true"></span>
				{busy ? "Uploading…" : "Upload Attachments"}
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
