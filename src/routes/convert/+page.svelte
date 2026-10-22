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
	import { STUDIO_SAMPLE_RATES } from "#lib/constants/studio.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { audioSampleRate } from "#lib/utils/audioSampleRate.js";
	import { formatKhz } from "#lib/utils/formatKhz.js";
	import { songSampleRate } from "#lib/utils/songSampleRate.js";
	import { downloadBlob } from "#lib/utils/downloadBlob.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import type { ClipSource } from "#lib/utils/mixClipsToChannels.js";
	import type { DawprojectRead } from "#lib/utils/dawprojectRead.js";

	/**
	 * Convert (docs/dawproject-plan.md "Roadmap", steps 1 to 3): drop a
	 * DAWproject or a Reaper project (with its media beside it), get it back
	 * as stems and MIDI (the session bundle), a mix, a stem per track or
	 * bus, a repacked DAWproject, a Sandyne project or a Reaper project, all
	 * in the browser through Dawn's own readers (utils/unpackProject.ts), a
	 * file-based engine (audio/convertEngine.ts) and the Export panel the
	 * Studio uses. Nothing is uploaded. Everything comes out at one sample
	 * rate (docs/multitrack-recorder.md "Sample rates"): the one most of the
	 * project's files have, or the one chosen here; the files are decoded at
	 * it, and a file at another rate is listed.
	 */
	type Unpacked = import("#lib/utils/unpackProject.js").UnpackedProject;
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
	let unpacked = $state.raw<Unpacked | null>(null);
	/** The output rate: the project's, then the viewer's choice. */
	let rate = $state(songSampleRate({}));
	/** Files at another rate than the output's, resampled on the way in. */
	let odd = $state<string[]>([]);
	/** Files the browser could not decode this time (the reader's own report stays in `read.dropped`). */
	let undecoded = $state<string[]>([]);

	const tracks = $derived(read?.arrangement.tracks ?? []);
	const buses = $derived(read?.arrangement.buses ?? []);
	const clips = $derived(read?.arrangement.clips ?? []);
	const midiClips = $derived(clips.filter((c) => c.notes).length);
	const audioClips = $derived(clips.length - midiClips);
	const seconds = $derived(clips.reduce((m, c) => Math.max(m, c.start + c.duration), 0));
	const mmss = (s: number) =>
		`${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

	/** The project among the files (a `.dawproject`, `.rpp` or zip; else the first), the rest its media by name. */
	async function openFiles(files: File[]) {
		const file = files.find((f) => /\.(dawproject|rpp|zip)$/i.test(f.name)) ?? files[0];
		if (!file) return;
		reading = true;
		results = [];
		read = null;
		engine = null;
		unpacked = null;
		fileName = file.name;
		try {
			const loose = new Map<string, Uint8Array>();
			for (const f of files)
				if (f !== file) loose.set(f.name, new Uint8Array(await f.arrayBuffer()));
			const { unpackProject } = await import("#lib/utils/unpackProject.js");
			unpacked = unpackProject(new Uint8Array(await file.arrayBuffer()), file.name, loose);
			for (const f of unpacked.read.files)
				if (!unpacked.entryOf(f.path))
					unpacked.read.dropped.push(
						unpacked.format === "reaper"
							? `${f.label}: ${f.path.replace(/^.*[\\/]/, "")} was not dropped with the project`
							: `${f.label}: its file is not in the archive`,
					);
			rate = songSampleRate(unpacked.read.arrangement);
			await decodeAll();
		} catch (e) {
			notify(`Could not read ${file.name}: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			reading = false;
		}
	}

	/** The audio decoded by the browser at the output rate (an offline context needs no gesture); again when the rate changes. */
	async function decodeAll() {
		if (!unpacked) return;
		reading = true;
		results = [];
		engine = null;
		decoded = 0;
		odd = [];
		undecoded = [];
		try {
			const sources = new Map<string, ClipSource>();
			const ctx = new OfflineAudioContext(1, 1, rate);
			for (const f of unpacked.read.files) {
				const bytes = unpacked.entryOf(f.path);
				if (!bytes) continue;
				const name = f.path.replace(/^.*\//, "");
				const fileRate = audioSampleRate(bytes) ?? f.sampleRate;
				if (fileRate && fileRate !== rate) odd.push(`${name} (${formatKhz(fileRate)} kHz)`);
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
					undecoded.push(`${f.label}: ${name} could not be decoded`);
				}
			}
			const arrangement = {
				...unpacked.read.arrangement,
				sampleRate: rate as (typeof STUDIO_SAMPLE_RATES)[number],
			};
			engine = convertEngine(arrangement, sources);
			read = { ...unpacked.read, arrangement };
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
		content="Convert a DAWproject (Bitwig Studio, Cubase, Studio One, Nuendo) or a Reaper project (.rpp) to stems and MIDI for Logic Pro, Pro Tools, Ableton Live, Audacity or Reaper, to a mix, to a Reaper project, or to a Sandyne project, free, in your browser. Nothing is uploaded."
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
				const files = Array.from(e.dataTransfer?.files ?? []);
				if (files.length) void openFiles(files);
			}}
		>
			<input
				bind:this={input}
				type="file"
				accept=".dawproject,.rpp,.zip,.wav,.flac,.mp3,.aif,.aiff,.ogg,.m4a,application/vnd.bitwig.dawproject,application/zip"
				multiple
				class="sr-only"
				aria-label="Project file"
				onchange={(e) => {
					const files = Array.from((e.currentTarget as HTMLInputElement).files ?? []);
					if (files.length) void openFiles(files);
				}}
			/>
			<p class="mb-3 text-15px text-blue-100/90">
				Drop a <code>.dawproject</code> or a Reaper <code>.rpp</code> here (with its media files beside
				it), or choose them. They are read in your browser and never uploaded.
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
					<dd>{fileName} ({unpacked?.format === "reaper" ? "Reaper project" : "DAWproject"})</dd>
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
					<dt class="opacity-70"><label for="convert-rate">Sample rate</label></dt>
					<dd class="flex flex-wrap items-center gap-x-3 gap-y-1">
						<select
							id="convert-rate"
							class="rounded border border-white/20 bg-transparent px-2 py-0.5 text-13px"
							value={rate}
							disabled={reading || busy}
							onchange={(e) => {
								rate = Number(e.currentTarget.value);
								void decodeAll();
							}}
						>
							{#each STUDIO_SAMPLE_RATES as r (r)}<option value={r}>{formatKhz(r)} kHz</option
								>{/each}
						</select>
						{#if odd.length}
							<span class="text-13px opacity-80">
								{odd.join(", ")}
								{odd.length === 1 ? "is" : "are"} resampled
							</span>
						{/if}
					</dd>
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
				{#if read.fixed.length}
					<details class="text-13px">
						<summary class="cursor-pointer opacity-80">
							Normalized ({read.fixed.length})
						</summary>
						<ul class="mt-1 list-disc pl-5 opacity-80">
							{#each read.fixed as line (line)}
								<li>{line}</li>
							{/each}
						</ul>
					</details>
				{/if}
				{#if read.dropped.length || undecoded.length}
					<details class="text-13px">
						<summary class="cursor-pointer opacity-80">
							Not carried across ({read.dropped.length + undecoded.length})
						</summary>
						<ul class="mt-1 list-disc pl-5 opacity-80">
							{#each [...read.dropped, ...undecoded] as line (line)}
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
