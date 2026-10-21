<script lang="ts">
	import ExportPanel from "#lib/components/ExportPanel.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import PageCopySection from "#lib/components/PageCopySection.svelte";
	import { convertEngine } from "#lib/audio/convertEngine.js";
	import {
		bundleExport,
		exportSong,
		type ExportEngine,
		type ExportFile,
		type ExportOptions,
	} from "#lib/audio/studioExport.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { downloadBlob } from "#lib/utils/downloadBlob.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import type { ClipSource } from "#lib/utils/mixClipsToChannels.js";
	import type { DawprojectRead } from "#lib/utils/dawprojectRead.js";

	/**
	 * Convert (docs/dawproject-plan.md "Roadmap", step 1): drop a DAWproject,
	 * get it back as stems and MIDI (the session bundle), a mix, a stem per
	 * track or bus, a repacked DAWproject or a Sandyne project, all in the
	 * browser through Dawn's own reader (utils/unpackDawproject.ts), a
	 * file-based engine (audio/convertEngine.ts) and the Export panel the
	 * Studio uses. Nothing is uploaded.
	 */
	let { data } = $props();

	let fileName = $state("");
	let reading = $state(false);
	let read = $state<DawprojectRead | null>(null);
	let engine = $state<ExportEngine | null>(null);
	let decoded = $state(0);
	let busy = $state(false);
	let step = $state<string | null>(null);
	let results = $state<ExportFile[]>([]);
	let dragging = $state(false);
	let input = $state<HTMLInputElement | null>(null);

	const tracks = $derived(read?.arrangement.tracks ?? []);
	const buses = $derived(read?.arrangement.buses ?? []);
	const clips = $derived(read?.arrangement.clips ?? []);
	const midiClips = $derived(clips.filter((c) => c.notes).length);
	const audioClips = $derived(clips.length - midiClips);
	const seconds = $derived(clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
	const mmss = (s: number) =>
		`${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

	async function openFile(file: File) {
		reading = true;
		results = [];
		read = null;
		engine = null;
		decoded = 0;
		fileName = file.name;
		try {
			const { unpackDawproject } = await import("#lib/utils/unpackDawproject.js");
			const unpacked = unpackDawproject(new Uint8Array(await file.arrayBuffer()), file.name);
			// The audio, decoded by the browser (an offline context needs no gesture).
			const sources = new Map<string, ClipSource>();
			const ctx = new OfflineAudioContext(1, 1, 48000);
			for (const f of unpacked.read.files) {
				const bytes = unpacked.entryOf(f.path);
				if (!bytes) {
					unpacked.read.dropped.push(`${f.label}: its file is not in the archive`);
					continue;
				}
				try {
					const buffer = await ctx.decodeAudioData(
						bytes.buffer.slice(
							bytes.byteOffset,
							bytes.byteOffset + bytes.byteLength,
						) as ArrayBuffer,
					);
					sources.set(f.sourceId, {
						channels: Array.from({ length: buffer.numberOfChannels }, (_, c) =>
							buffer.getChannelData(c),
						),
						sampleRate: buffer.sampleRate,
					});
					decoded += 1;
				} catch {
					unpacked.read.dropped.push(
						`${f.label}: ${f.path.replace(/^.*\//, "")} could not be decoded`,
					);
				}
			}
			engine = convertEngine(unpacked.read.arrangement, sources);
			read = unpacked.read;
		} catch (e) {
			notify(`Could not read ${file.name}: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			reading = false;
		}
	}

	async function runExport(options: ExportOptions, zip: boolean) {
		if (!engine || !read) return;
		busy = true;
		results = [];
		try {
			const files = await exportSong(
				engine,
				read.title || "project",
				options,
				{ name: "Stem Shovel Convert", version: __APP_VERSION__ },
				(s) => (step = s),
			);
			results = files;
			if (files.length === 0) return;
			if (zip && files.length > 1) {
				step = "Zipping…";
				const all = await bundleExport(read.title || "project", files);
				downloadBlob(all.blob, all.name);
			} else for (const f of files) downloadBlob(f.blob, f.name);
			notify(`Converted to ${files.length} ${files.length === 1 ? "file" : "files"}`);
		} catch (e) {
			notify(`Could not convert: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			step = null;
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{data.copy.title || "Convert"} | Free Online DAW Project Converter</title>
	<meta
		name="description"
		content="Convert a DAWproject (Bitwig Studio, Cubase, Studio One, Nuendo) to stems and MIDI for Logic Pro, Pro Tools, Ableton Live, Audacity or Reaper, to a mix, or to a Sandyne project, free, in your browser. Nothing is uploaded."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<PageCopyHeader copy={data.copy} />
	<div class="max-w-article grid gap-6" data-convert>
		<!-- The drop zone: a button for the keyboard and the file dialog, a target for a dragged file. -->
		<div
			class="rounded-lg border-2 border-dashed p-6 text-center transition-colors {dragging
				? 'border-maximumYellow bg-white/5'
				: 'border-white/25'}"
			role="region"
			aria-label="Drop a project file"
			ondragover={(e) => {
				e.preventDefault();
				dragging = true;
			}}
			ondragleave={() => (dragging = false)}
			ondrop={(e) => {
				e.preventDefault();
				dragging = false;
				const file = e.dataTransfer?.files[0];
				if (file) void openFile(file);
			}}
		>
			<input
				bind:this={input}
				type="file"
				accept=".dawproject,.zip,application/vnd.bitwig.dawproject,application/zip"
				class="sr-only"
				aria-label="Project file"
				onchange={(e) => {
					const file = (e.currentTarget as HTMLInputElement).files?.[0];
					if (file) void openFile(file);
				}}
			/>
			<p class="mb-3 text-15px text-blue-100/90">
				Drop a <code>.dawproject</code> here, or choose one. It is read in your browser and never uploaded.
			</p>
			<button
				type="button"
				class="button button-sm"
				disabled={reading}
				onclick={() => input?.click()}
			>
				<span class="i-ph-folder-open" aria-hidden="true"></span>
				{reading ? "Reading…" : read ? "Choose another file" : "Choose a file"}
			</button>
		</div>

		{#if read}
			<section
				class="grid gap-3 rounded-lg border border-white/15 bg-white/3 p-4"
				aria-live="polite"
			>
				<h2 class="heading-2 text-18px">{read.title || fileName}</h2>
				<dl
					class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-14px"
					aria-label="What the file holds"
				>
					<dt class="opacity-70">File</dt>
					<dd>{fileName}</dd>
					<dt class="opacity-70">Tracks</dt>
					<dd>
						{tracks.length}{buses.length
							? `, ${buses.length} ${buses.length === 1 ? "bus" : "buses"}`
							: ""}: {tracks.map((t) => t.name).join(", ")}
					</dd>
					<dt class="opacity-70">Clips</dt>
					<dd>
						{audioClips} audio{midiClips ? `, ${midiClips} MIDI` : ""}, over {mmss(seconds)}
					</dd>
					<dt class="opacity-70">Audio files</dt>
					<dd>{decoded} of {read.files.length} decoded</dd>
					<dt class="opacity-70">Tempo</dt>
					<dd>
						{read.arrangement.bpm} bpm, {read.arrangement.beatsPerBar}/4{read.arrangement.key
							? `, ${read.arrangement.key}`
							: ""}{read.arrangement.tempoChanges?.length
							? `, ${read.arrangement.tempoChanges.length} tempo ${read.arrangement.tempoChanges.length === 1 ? "change" : "changes"}`
							: ""}{read.arrangement.markers?.length
							? `, ${read.arrangement.markers.length} ${read.arrangement.markers.length === 1 ? "marker" : "markers"}`
							: ""}
					</dd>
				</dl>
				{#if read.dropped.length}
					<details class="text-13px">
						<summary class="cursor-pointer opacity-80">
							Not carried across ({read.dropped.length})
						</summary>
						<ul class="mt-1 list-disc pl-5 opacity-80">
							{#each read.dropped as line (line)}
								<li>{line}</li>
							{/each}
						</ul>
					</details>
				{/if}
			</section>
			<section class="rounded-lg border border-white/15 bg-white/3 p-4">
				<h2 class="heading-2 mb-3 text-18px">Convert to</h2>
				<ExportPanel
					trackCount={tracks.filter((t) => engine?.renders?.(t.id) !== false).length}
					busCount={buses.length}
					{busy}
					{step}
					{results}
					onexport={(o, zip) => void runExport(o, zip)}
				/>
			</section>
		{/if}
	</div>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/studio"
		docsLabel="Dawn docs"
		docsLead="The formats are described in Dawn's user docs, under Export."
	/>
</main>
