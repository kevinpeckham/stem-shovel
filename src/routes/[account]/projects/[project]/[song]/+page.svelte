<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import StemUploader, { type UploadJob } from "$lib/components/StemUploader.svelte";
	import { barGrid, formatPosition, parsePosition } from "$lib/audio/measures";
	import { bumpVersion } from "$lib/utils/bumpVersion";
	import { formatDate } from "$lib/utils/formatDate";
	import { parseBarsText } from "$lib/utils/parseBarsText";
	import { readout } from "$lib/audio/readout.svelte";
	import { FRAME_RATES } from "$lib/constants/frameRates";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatMonth } from "$lib/utils/formatMonth";
	import { POSITION_MODE_LABELS } from "$lib/constants/positionModes";
	import { toRoman } from "$lib/utils/toRoman";
	import type { SongSection } from "$lib/val/SongSectionSchema";
	import { type SongChange } from "$lib/val/SongChangeSchema";
	import {
		SONG_CHANGE_KINDS,
		SONG_CHANGE_LABELS,
		type SongChangeKind,
	} from "$lib/constants/songChanges";
	import { formatSongChange } from "$lib/utils/formatSongChange";
	import { songChangeValueError } from "$lib/utils/songChangeValueError";
	import type { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemState } from "$lib/audio/types";

	import { DEMO_ACCEPT, DEMO_FORMAT_LIST, MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
	import { demoContentType } from "$lib/utils/demoContentType";
	import { slugify } from "$lib/utils/slugify";
	import { STEM_ACCEPT, STEM_MAX_BYTES } from "$lib/constants/stemFormats";
	import {
		type DemoReservation,
		postJson,
		type Reservation,
		saveAs,
		uploadDemoFile,
		uploadStemFile,
	} from "$lib/upload";
	import {
		deleteDemo,
		deleteSong,
		deleteStem,
		renameStem,
		saveChanges,
		saveSections,
		setSongVersion,
		updateSong,
	} from "$lib/remote/songs.remote";
	import { invalidateAll } from "$app/navigation";
	import { tick, untrack } from "svelte";

	let { data } = $props();

	// Settings form (title, URL, description) on the updateSong remote form.
	let settingsPanel = $state<HTMLDivElement | null>(null);
	let settingsSaved = $state(false);
	const fields = updateSong.fields;
	let title = $derived(fields.title.value() ?? data.song.title);
	let slug = $derived(fields.slug.value() ?? data.song.slug);
	let description = $derived(fields.description.value() ?? data.song.description);
	let songwriter = $derived(fields.songwriter.value() ?? data.song.songwriter);
	let writtenOn = $derived(fields.writtenOn.value() ?? data.song.writtenOn ?? "");
	// Positions read and are typed in the readout's format (time, timecode or bars);
	// the form carries them as seconds, converted on the way in and out.
	let posCtx = $derived({
		fps: data.song.frameRate,
		grid: barGrid(data.song.changes, data.song.startAt),
	});
	const showPos = (seconds: number) => formatPosition(readout.mode, seconds, posCtx);
	// Editors show full precision (milliseconds, beat fractions) so a row that
	// is saved unedited keeps its exact seconds; see rowSeconds.
	const editPos = (seconds: number) =>
		formatPosition(readout.mode, seconds, posCtx, { precise: true });
	/** The exact stored seconds when the text was not touched, else what the text says (null = not a position). */
	const rowSeconds = (row: { time: string; shown: string; seconds: number | null }) =>
		row.seconds !== null && row.time.trim() === row.shown ? row.seconds : readPos(row.time);
	const readPos = (text: string) => parsePosition(text, posCtx);
	/** Why `text` did not parse: bars typed on a song without a tempo and meter get their own message. */
	const positionMessage = (text: string) =>
		parseBarsText(text) && !posCtx.grid
			? `"${text}" is in bars, but bars need a tempo and a time signature — add both under "Tempo, key and time signature" first, or enter the position as time (1:23.4) or timecode (01:23:15.72).`
			: `"${text}" is not a position (time 1:23.4, timecode 01:23:15.72, or bars 12|3).`;
	let startAtText = $derived(data.song.startAt === null ? "" : editPos(data.song.startAt));
	let endAtText = $derived(data.song.endAt === null ? "" : editPos(data.song.endAt));
	let startAtEntry = $state("");
	let endAtEntry = $state("");
	let startAt = $derived(startAtEntry);
	let endAt = $derived(endAtEntry);
	let frameRate = $derived(fields.frameRate.value() ?? String(data.song.frameRate));
	let version = $derived(fields.version.value() ?? data.song.version);

	// After stems change, offer a version bump; the user decides, nothing bumps itself.
	let versionOffer = $state(false);
	let versionBusy = $state(false);
	async function bump(level: "major" | "minor" | "patch") {
		versionBusy = true;
		try {
			await setSongVersion({ id: data.song.id, version: bumpVersion(data.song.version, level) });
			await invalidateAll();
		} finally {
			versionBusy = false;
			versionOffer = false;
		}
	}
	let positionError = $state<string | null>(null);
	const POSITION_PLACEHOLDER = { time: "0:00.0", timecode: "00:00:00.00", bars: "1|1" } as const;
	let settingsDirty = $derived(
		title.trim() !== data.song.title ||
			slug.trim() !== data.song.slug ||
			description.trim() !== data.song.description ||
			songwriter.trim() !== data.song.songwriter ||
			writtenOn !== (data.song.writtenOn ?? "") ||
			startAt.trim() !== startAtText ||
			endAt.trim() !== endAtText ||
			frameRate !== String(data.song.frameRate) ||
			version.trim() !== data.song.version,
	);

	// Demo recordings: uploaded from settings (no decoding, just the file),
	// played and downloaded from the "Demos" popover in the download row.
	let demoJobs = $state<{ name: string; percent: number; error?: string }[]>([]);
	let demoNotice = $state<string | null>(null);
	let demoBusy = $state(false);
	async function uploadDemos(input: HTMLInputElement) {
		const picked = Array.from(input.files ?? []);
		input.value = "";
		if (picked.length === 0) return;
		const unsupported = picked.filter((f) => !demoContentType(f.name));
		const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
		const room = Math.max(0, MAX_DEMOS_PER_SONG - data.song.demos.length);
		if (unsupported.length) {
			demoNotice = `Not a supported format (${DEMO_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`;
			return;
		}
		if (tooBig.length) {
			demoNotice = `Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`;
			return;
		}
		if (picked.length > room) {
			demoNotice = `Only ${room} more ${room === 1 ? "demo" : "demos"} fit on this song (${MAX_DEMOS_PER_SONG} max).`;
			return;
		}
		demoNotice = null;
		demoBusy = true;
		demoJobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		for (const [i, file] of picked.entries()) {
			try {
				await uploadDemoFile(
					file,
					() =>
						postJson<DemoReservation>("/api/demos", {
							songId: data.song.id,
							filename: file.name,
							sizeBytes: file.size,
						}),
					(percent) => (demoJobs[i].percent = percent),
				);
			} catch (e) {
				demoJobs[i].error = e instanceof Error ? e.message : String(e);
			}
		}
		await invalidateAll();
		demoBusy = false;
		if (demoJobs.every((j) => !j.error)) demoJobs = [];
	}

	// The demo player: one audio element, whichever demo was last pressed.
	let demoPlaying = $state<string | null>(null);
	let demoPaused = $state(true);
	let demoTrack = $derived(data.song.demos.find((d) => d.id === demoPlaying) ?? null);
	let demoAudio = $state<HTMLAudioElement | null>(null);
	async function playDemo(id: string) {
		if (demoPlaying === id) {
			demoPaused = !demoPaused;
			return;
		}
		// Swapping `src` fires a pause event that flips the bound state, so start
		// the new track explicitly once the element has it.
		demoPlaying = id;
		demoPaused = false;
		await tick();
		await demoAudio?.play().catch(() => {});
	}
	// "Written by X, first written June 2019" under the title.
	let writtenLine = $derived(
		[
			data.song.songwriter ? `Written by ${data.song.songwriter}` : "",
			data.song.writtenOn ? `first written ${formatMonth(data.song.writtenOn)}` : "",
		]
			.filter(Boolean)
			.join(", "),
	);
	// "v0.0.1 · stems updated Sep 13, 2026" under the title.
	let versionLine = $derived(
		[
			`v${data.song.version}`,
			data.song.stemsUpdatedAt ? `stems updated ${formatDate(data.song.stemsUpdatedAt)}` : "",
		]
			.filter(Boolean)
			.join(" · "),
	);
	// "120 bpm · F#m · 4/4" under the title: the first change of each kind.
	let metaLine = $derived(
		SONG_CHANGE_KINDS.map((kind) => data.song.changes.find((c) => c.kind === kind))
			.filter((c) => c !== undefined)
			.map(formatSongChange)
			.join(" · "),
	);
	let readyDemos = $derived(data.song.demos.filter((d) => d.status === "ready" && d.url));
	let slugTouched = $state(false);

	// Chart / Lyrics / Notes toggle for the read view. Starts on the first with content.
	const DOC_KINDS = ["chart", "lyrics", "notes"] as const;
	const DOC_LABELS = { chart: "Chart", lyrics: "Lyrics", notes: "Notes" } as const;
	let doc = $state<(typeof DOC_KINDS)[number]>(
		untrack(() => DOC_KINDS.find((k) => data.docs[k]) ?? "chart"),
	);

	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
	let uploadJobs = $state<UploadJob[]>([]);
	let uploadNotice = $state<string | null>(null);
	let ready = $derived(data.song.stems.filter((s) => s.status === "ready" && s.url));

	// "Upload new version" for one stem: same pipeline as adding, but the
	// reservation is /api/stems/[id]/replace, which keeps the row and label.
	let replacing = $state<Record<string, { percent: number; stage: string; error?: string }>>({});
	async function replaceStem(stemId: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		const ctx = new AudioContext({ sampleRate: 32_000 });
		replacing[stemId] = { percent: 0, stage: "uploading" };
		try {
			await uploadStemFile(
				file,
				() =>
					postJson<Reservation>(`/api/stems/${stemId}/replace`, {
						filename: file.name,
						sizeBytes: file.size,
					}),
				{
					ctx,
					onProgress: (p) => (replacing[stemId] = { ...replacing[stemId], percent: p }),
					onDecoding: () => (replacing[stemId] = { ...replacing[stemId], stage: "decoding" }),
				},
			);
			delete replacing[stemId];
			await invalidateAll();
			versionOffer = true;
		} catch (err) {
			replacing[stemId] = { ...replacing[stemId], stage: "error", error: (err as Error).message };
		} finally {
			await ctx.close();
		}
	}

	// Rename from the row menu. A prompt keeps this one-click; the load refresh
	// carries the new label into the player without re-decoding (StemPlayer
	// relabels in place).
	async function rename(stemId: string, current: string) {
		const label = prompt("Stem name", current)?.trim();
		if (!label || label === current) return;
		await renameStem({ id: stemId, label });
		await invalidateAll();
	}

	// The database row behind a player stem (filename, size, url).
	let stemRows = $derived(new Map(data.song.stems.map((s) => [s.id, s])));

	// Download every ready stem as one zip, built in the browser from the Blob
	// files (they allow cross-origin reads). Stored, not compressed: audio
	// does not shrink and stored entries stream straight through.
	let zipping = $state<string | null>(null);

	// MP3 mixdown: "original" is every stem at unity (cached on the server);
	// "custom" is what the player has audible right now — mute, solo and faders.
	type MixMode = "original" | "custom";
	// Song sections: the list in settings edits index, name and start. (The player
	// can also offer "Add section at playhead" via its onaddsection prop; off for now.)
	let sectionRows = $state<
		{ index: string; name: string; time: string; shown: string; seconds: number | null }[]
	>([]);
	let sectionError = $state<string | null>(null);
	let sectionsSaving = $state(false);
	function resetSectionRows() {
		sectionRows = data.song.sections.map((s) => ({
			index: s.index ?? "",
			name: s.name,
			time: editPos(s.start),
			shown: editPos(s.start),
			seconds: s.start,
		}));
	}
	async function persistSections(next: SongSection[]) {
		sectionError = null;
		sectionsSaving = true;
		try {
			await saveSections({ id: data.song.id, sections: next });
			await invalidateAll();
			resetSectionRows();
		} catch (e) {
			sectionError = e instanceof Error ? e.message : String(e);
		} finally {
			sectionsSaving = false;
		}
	}
	async function saveSectionRows() {
		const parsed: SongSection[] = [];
		for (const row of sectionRows) {
			const start = rowSeconds(row);
			if (start === null) {
				sectionError = positionMessage(row.time);
				return;
			}
			parsed.push({ index: row.index, name: row.name, start });
		}
		await persistSections(parsed);
	}

	// Tempo / key / time signature changes: rows of time (m:ss.s), kind and value.
	let changeRows = $state<
		{ time: string; shown: string; seconds: number | null; kind: SongChangeKind; value: string }[]
	>([]);
	let changeError = $state<string | null>(null);
	let changesSaving = $state(false);
	function resetChangeRows() {
		changeRows = data.song.changes.map((c) => ({
			time: editPos(c.start),
			shown: editPos(c.start),
			seconds: c.start,
			kind: c.kind,
			value: c.value,
		}));
	}
	async function saveChangeRows() {
		changeError = null;
		const parsed: SongChange[] = [];
		for (const row of changeRows) {
			const start = rowSeconds(row);
			if (start === null) {
				changeError = positionMessage(row.time);
				return;
			}
			const bad = songChangeValueError(row.kind, row.value);
			if (bad) {
				changeError = `${SONG_CHANGE_LABELS[row.kind]} at ${row.time}: ${bad}`;
				return;
			}
			parsed.push({ kind: row.kind, start, value: row.value.trim() });
		}
		changesSaving = true;
		try {
			await saveChanges({ id: data.song.id, changes: parsed });
			await invalidateAll();
			resetChangeRows();
		} catch (e) {
			changeError = e instanceof Error ? e.message : String(e);
		} finally {
			changesSaving = false;
		}
	}

	// A stem row's menu is a <details>; it closes on Escape, on a click outside
	// it, and when another menu opens (that click is outside the first).
	function closeStemMenus(e: Event) {
		for (const menu of document.querySelectorAll<HTMLDetailsElement>(
			"details[data-stem-menu][open]",
		)) {
			if (e.type === "pointerdown" && menu.contains(e.target as Node)) continue;
			menu.open = false;
		}
	}

	// The player's engine, for the custom mix (the download row lives outside the player).
	let playerEngine = $state<StemEngine | null>(null);
	let mixing = $state<MixMode | null>(null);
	let mixError = $state<string | null>(null);
	async function downloadMix(mixMode: MixMode, engine?: StemEngine) {
		if (mixing) return;
		mixError = null;
		const params = new URLSearchParams();
		if (mixMode === "custom") {
			const mix = engine?.mix() ?? { stems: [], master: 1 };
			if (mix.stems.length === 0) {
				mixError = "Nothing is audible — unmute a stem first.";
				return;
			}
			params.set("stems", mix.stems.map((s) => `${s.id}:${s.gain.toFixed(3)}`).join(","));
			params.set("master", mix.master.toFixed(3));
		}
		const query = params.size ? `?${params}` : "";
		mixing = mixMode;
		try {
			await saveAs(
				`/api/songs/${data.song.id}/mix${query}`,
				`${data.song.project.slug}-${data.song.slug}-${mixMode === "custom" ? "custom-mix" : "mix"}.mp3`,
			);
		} catch (e) {
			mixError = e instanceof Error ? e.message : String(e);
		} finally {
			mixing = null;
		}
	}
	async function downloadAll() {
		if (ready.length === 0 || zipping) return;
		zipping = "Preparing…";
		try {
			const { downloadZip } = await import("client-zip");
			const seen = new Set<string>();
			const stems = ready;
			// Fetched lazily as the zip is written, one file at a time.
			async function* entries() {
				for (const s of stems) {
					let name = s.filename;
					if (seen.has(name)) name = `${s.label}-${name}`;
					seen.add(name);
					const res = await fetch(s.url);
					if (!res.ok) throw new Error(`${s.label}: ${res.status} ${res.statusText}`);
					yield { name, input: res };
				}
			}
			const blob = await downloadZip(entries()).blob();
			const a = document.createElement("a");
			a.href = URL.createObjectURL(blob);
			a.download = `${data.song.project.slug}-${data.song.slug}-stems.zip`;
			a.click();
			setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
		} finally {
			zipping = null;
		}
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === "Escape") closeStemMenus(e);
	}}
	onpointerdown={closeStemMenus}
/>

<svelte:head>
	<title>{data.song.title} — Stem Shovel</title>
</svelte:head>

<main
	class="page-x-padding pt-6 mb-2 grid grid-cols-1 xl-grid-cols-2 gap-8"
	data-song-id={data.song.id}
>
	<!-- 1. header: title, description, song settings -->
	<header class="grid gap-3 col-span-full">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<div class="flex flex-wrap items-baseline gap-4">
				<!-- <a class="text-sm link-dim" href="/{data.account.slug}/projects/{data.song.project.slug}"
					>{data.song.project.name}</a
				> -->
				<h1 class="heading-1">{data.song.title}</h1>
				<span class="opacity-90 text-15px"
					>a song in the <a
						class="underline underline-offset-2"
						href="/{data.account.slug}/projects/{data.song.project.slug}"
						>{data.song.project.name}</a
					>
					project from
					<a class="underline underline-offset-2" href="/{data.account.slug}/projects"
						>{data.account.name}</a
					></span
				>
				<p class="w-full text-sm text-dim">
					<span class="text-neutral-100">{versionLine}</span>
					{#if metaLine}<span class="opacity-60"> — </span><span class="text-neutral-100"
							>{metaLine}</span
						>{/if}
					{#if writtenLine}<span class="opacity-60"> — </span>{writtenLine}{/if}
				</p>
				<!-- {#if data.song.description}
					<p class="mt-1 max-w-prose text-sm text-dim">{data.song.description}</p>
				{/if} -->
			</div>
			{#if data.canEdit}
				<button
					class="block hover-text-accent opacity-90 border border-transparent px-1 py-1 rounded hover-opacity-100"
					type="button"
					popovertarget="song-settings"
					title="Song settings"
					aria-label="Song settings"
				>
					<span class="block i-ph-gear"></span>
				</button>
			{/if}
		</div>
		{#if settingsSaved}
			<p class="text-sm text-dim">Saved.</p>
		{/if}
	</header>

	{#if data.canEdit}
		<!-- Settings as a native popover: top layer, light-dismiss, Esc closes. -->
		<div
			id="song-settings"
			popover="auto"
			onbeforetoggle={(e) => {
				if (e.newState === "open") {
					resetSectionRows();
					resetChangeRows();
					startAtEntry = startAtText;
					endAtEntry = endAtText;
				}
			}}
			bind:this={settingsPanel}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(40rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Song settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="song-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateSong.enhance(async ({ submit }) => {
					settingsSaved = false;
					positionError = null;
					for (const [label, text, field, shown, stored] of [
						["Start of bar 1", startAtEntry, fields.startAt, startAtText, data.song.startAt],
						["End", endAtEntry, fields.endAt, endAtText, data.song.endAt],
					] as const) {
						const seconds = !text.trim() ? 0 : rowSeconds({ time: text, shown, seconds: stored });
						if (seconds === null) {
							positionError = `${label}: ${positionMessage(text)}`;
							return;
						}
						field.set(text.trim() ? String(seconds) : "");
					}
					await submit();
					if (!fields.allIssues()) {
						settingsSaved = true;
						settingsPanel?.hidePopover();
					}
				})}
			>
				<input {...fields.id.as("hidden", data.song.id)} />
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm text-dim">Title</span>
						<input
							class="mt-1 field"
							{...fields.title.as("text", data.song.title)}
							oninput={(e) => {
								if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
							}}
							required
						/>
						{#each fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">URL</span>
						<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
							<span class="truncate pl-3 text-sm text-dim">/projects/{data.song.project.slug}/</span
							>
							<input
								class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
								{...fields.slug.as("text", data.song.slug)}
								oninput={() => (slugTouched = true)}
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
						{#if slug !== slugify(title)}
							<button
								class="mt-1 text-xs link-dim"
								type="button"
								onclick={() => {
									fields.slug.set(slugify(title));
									slugTouched = false;
								}}>Use title</button
							>
						{/if}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Songwriter <span class="opacity-60">(optional)</span></span
						>
						<input
							class="mt-1 field"
							{...fields.songwriter.as("text", data.song.songwriter)}
							placeholder="Who wrote it"
						/>
						{#each fields.songwriter.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>First written <span class="opacity-60">(optional)</span></span
						>
						<input
							class="mt-1 field"
							type="date"
							{...fields.writtenOn.as("text", data.song.writtenOn ?? "")}
						/>
						{#each fields.writtenOn.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Start of bar 1 <span class="opacity-60">(optional)</span></span
						>
						<span class="mt-1 flex items-center gap-2">
							<input
								class="field font-mono text-sm"
								placeholder={POSITION_PLACEHOLDER[readout.mode]}
								autocomplete="off"
								bind:value={startAtEntry}
								aria-label="Start of bar 1"
							/>
							<input {...fields.startAt.as("hidden", "")} />
							<button
								class="button button-xs shrink-0"
								type="button"
								title="Use the transport's current position"
								disabled={!playerEngine || playerEngine.status !== "ready"}
								onclick={() => (startAtEntry = editPos(playerEngine?.position ?? 0))}
							>
								Playhead
							</button>
						</span>
						<span class="mt-1 block text-xs text-dim"
							>Leading silence or a count-in: bars are counted from here.</span
						>
						{#each fields.startAt.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">End <span class="opacity-60">(optional)</span></span>
						<span class="mt-1 flex items-center gap-2">
							<input
								class="field font-mono text-sm"
								placeholder={POSITION_PLACEHOLDER[readout.mode]}
								autocomplete="off"
								bind:value={endAtEntry}
								aria-label="End"
							/>
							<input {...fields.endAt.as("hidden", "")} />
							<button
								class="button button-xs shrink-0"
								type="button"
								title="Use the transport's current position"
								disabled={!playerEngine || playerEngine.status !== "ready"}
								onclick={() => (endAtEntry = editPos(playerEngine?.position ?? 0))}
							>
								Playhead
							</button>
						</span>
						<span class="mt-1 block text-xs text-dim">Where the song ends, for the bars total.</span
						>
						{#each fields.endAt.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">Version</span>
						<input
							class="mt-1 field font-mono text-sm"
							placeholder="0.0.1"
							autocomplete="off"
							{...fields.version.as("text", data.song.version)}
						/>
						<span class="mt-1 block text-xs text-dim">
							Yours to manage (major.minor.patch); after stems change you are offered a bump.
						</span>
						{#each fields.version.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim"
							>Frame rate <span class="opacity-60">(timecode)</span></span
						>
						<select
							class="mt-1 field text-sm"
							{...fields.frameRate.as("select", String(data.song.frameRate))}
						>
							{#each FRAME_RATES as rate (rate)}
								<option value={String(rate)}>{rate} fps</option>
							{/each}
						</select>
					</label>
					<p class="text-xs text-dim self-end pb-2">
						Positions read and are typed as {POSITION_MODE_LABELS[readout.mode].toLowerCase()} — the transport's
						readout sets the format. Any of time (1:23.4), timecode (01:23:15.72) or bars (12|3) is accepted
						anywhere.
					</p>
					<label class="block sm:col-span-2">
						<span class="text-sm text-dim"
							>Description <span class="opacity-60">(optional)</span></span
						>
						<textarea
							class="mt-1 field text-sm"
							rows="3"
							{...fields.description.as("text", data.song.description)}></textarea>
						{#each fields.description.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
				</div>
				{#if positionError}
					<p class="mt-2 text-sm text-red-400" role="alert">{positionError}</p>
				{/if}
				{#if slug.trim() !== data.song.slug}
					<p class="mt-2 text-xs text-dim">Changing the URL breaks existing links to this song.</p>
				{/if}
				<div class="mt-4">
					<button
						class="button-accent disabled:opacity-40"
						disabled={!settingsDirty || !!updateSong.pending}
					>
						{updateSong.pending ? "Saving…" : "Save"}
					</button>
				</div>
			</form>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Sections</h3>
					<button
						class="button button-xs"
						type="button"
						onclick={() =>
							(sectionRows = [
								...sectionRows,
								{
									index: toRoman(sectionRows.length + 1),
									name: "",
									time: editPos(0),
									shown: "",
									seconds: null,
								},
							])}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
						Add row
					</button>
				</div>
				<p class="mt-1 text-sm text-dim">
					Song structure for the timeline above the stems: a short index (roman numerals, shown on
					the timeline; the name shows on hover), a name, and where it starts — time, timecode or
					bars.
				</p>
				{#if sectionRows.length > 0}
					<div class="mt-3 grid gap-2">
						{#each sectionRows as row, i (i)}
							<div class="grid grid-cols-[4rem_1fr_7rem_auto] items-center gap-2">
								<input
									class="field font-mono text-sm"
									placeholder="I"
									bind:value={row.index}
									aria-label="Section index"
									title="Short index shown on the timeline (roman numerals); the name shows on hover"
								/>
								<input
									class="field"
									placeholder="Intro"
									bind:value={row.name}
									aria-label="Section name"
								/>
								<input
									class="field font-mono text-sm"
									placeholder={POSITION_PLACEHOLDER[readout.mode]}
									bind:value={row.time}
									aria-label="Start time"
								/>
								<button
									class="link-dim text-xs"
									type="button"
									onclick={() => (sectionRows = sectionRows.filter((_, j) => j !== i))}
									>Remove</button
								>
							</div>
						{/each}
					</div>
				{/if}
				{#if sectionError}
					<p class="mt-2 text-sm text-red-400" role="alert">{sectionError}</p>
				{/if}
				<div class="mt-3 flex items-center gap-3">
					<button
						class="button-accent disabled:opacity-40"
						type="button"
						disabled={sectionsSaving}
						onclick={saveSectionRows}
					>
						{sectionsSaving ? "Saving…" : "Save sections"}
					</button>
					<button class="link-dim text-xs" type="button" onclick={resetSectionRows}
						>Discard changes</button
					>
				</div>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Tempo, key and time signature</h3>
					<button
						class="button button-xs"
						type="button"
						onclick={() =>
							(changeRows = [
								...changeRows,
								{
									time: changeRows.length ? "" : editPos(0),
									shown: "",
									seconds: null,
									kind: "tempo",
									value: "",
								},
							])}
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
						Add change
					</button>
				</div>
				<p class="mt-1 text-sm text-dim">
					Each from the time it starts (0:00.0 for the song's own tempo, key and time signature;
					later rows are changes). They show on the timeline above the stems.
				</p>
				{#if changeRows.length > 0}
					<div class="mt-3 grid gap-2">
						{#each changeRows as row, i (i)}
							<div class="grid grid-cols-[6rem_9rem_1fr_auto] items-center gap-2">
								<input
									class="field font-mono text-sm"
									placeholder={POSITION_PLACEHOLDER[readout.mode]}
									bind:value={row.time}
									aria-label="Change time"
								/>
								<select class="field text-sm" bind:value={row.kind} aria-label="What changes">
									{#each SONG_CHANGE_KINDS as kind (kind)}
										<option value={kind}>{SONG_CHANGE_LABELS[kind]}</option>
									{/each}
								</select>
								<input
									class="field font-mono text-sm"
									placeholder={row.kind === "tempo" ? "120" : row.kind === "key" ? "F#m" : "4/4"}
									list={row.kind === "meter" ? "time-signatures" : undefined}
									autocomplete="off"
									bind:value={row.value}
									aria-label="Value"
								/>
								<button
									class="link-dim text-xs"
									type="button"
									onclick={() => (changeRows = changeRows.filter((_, j) => j !== i))}>Remove</button
								>
							</div>
						{/each}
					</div>
					<datalist id="time-signatures">
						{#each ["4/4", "3/4", "6/8", "2/4", "5/4", "7/8", "12/8"] as ts (ts)}
							<option value={ts}></option>
						{/each}
					</datalist>
				{/if}
				{#if changeError}
					<p class="mt-2 text-sm text-red-400" role="alert">{changeError}</p>
				{/if}
				<div class="mt-3 flex items-center gap-3">
					<button
						class="button-accent disabled:opacity-40"
						type="button"
						disabled={changesSaving}
						onclick={saveChangeRows}
					>
						{changesSaving ? "Saving…" : "Save changes"}
					</button>
					<button class="link-dim text-xs" type="button" onclick={resetChangeRows}
						>Discard edits</button
					>
				</div>
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h3 class="text-15px font-700">Demo recordings</h3>
					<label
						class="button button-xs cursor-pointer {demoBusy
							? 'opacity-50 pointer-events-none'
							: ''}"
					>
						<span class="i-ph-plus" aria-hidden="true"></span>
						{demoBusy ? "Uploading…" : "Upload demo"}
						<input
							class="sr-only"
							type="file"
							accept={DEMO_ACCEPT}
							multiple
							disabled={demoBusy}
							onchange={(e) => uploadDemos(e.currentTarget)}
						/>
					</label>
				</div>
				<p class="mt-1 text-sm text-dim">
					Phone memos, rough takes, the original idea — any audio format; each is converted to MP3
					for listening and download. Up to {MAX_DEMOS_PER_SONG}.
				</p>
				{#if demoNotice}
					<p class="mt-2 text-sm text-red-400" role="alert">{demoNotice}</p>
				{/if}
				{#each demoJobs as job (job.name)}
					<p class="mt-2 text-sm {job.error ? 'text-red-400' : 'text-dim'}">
						{job.name}: {job.error ?? `${job.percent.toFixed(0)}%`}
					</p>
				{/each}
				{#if data.song.demos.length > 0}
					<ul class="mt-3 grid gap-1">
						{#each data.song.demos as d (d.id)}
							{@const remove = deleteDemo.for(d.id)}
							<li
								class="flex items-center justify-between gap-3 rounded border border-white/10 px-3 py-2 text-sm"
							>
								<span class="min-w-0 truncate">
									{d.label}
									<span class="text-dim"
										>· {formatBytes(d.sizeBytes)}{#if d.status !== "ready"}
											· uploading{:else if d.playbackStatus !== "ready"}
											· converting to MP3…{/if}</span
									>
									<form
										{...remove.enhance(async ({ submit }) => {
											if (!confirm(`Remove the demo "${d.label}"?`)) return;
											await submit();
										})}
									>
										<input {...remove.fields.id.as("hidden", d.id)} />
										<button class="link-dim text-xs" disabled={!!remove.pending}>
											{remove.pending ? "Removing…" : "Remove"}
										</button>
									</form>
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			<div class="mt-8 border-t border-white/15 pt-4">
				<h3 class="text-15px font-700 text-red-400">Delete this song</h3>
				<p class="mt-1 text-sm text-dim">
					Removes the song, its chart, lyrics and notes, every stem file and every demo recording.
				</p>
				<form
					class="mt-3"
					{...deleteSong.enhance(async ({ submit }) => {
						if (!confirm(`Delete "${data.song.title}" and all of its stems?`)) return;
						await submit();
					})}
				>
					<input {...deleteSong.fields.id.as("hidden", data.song.id)} />
					<button
						class="button text-red-400 hover-bg-red-400 hover-text-oxford"
						disabled={!!deleteSong.pending}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
						{deleteSong.pending ? "Deleting…" : "Delete song"}
					</button>
				</form>
			</div>
		</div>
	{/if}

	<!-- 2. player: transport + waveforms, with the stem actions -->
	<section class="grid grid-cols-1 place-content-start" aria-label="Player">
		<!-- transport and waveforms -->
		{#if data.manifest.stems.length > 0}
			<div class="mb-5">
				<StemPlayer
					manifest={data.manifest}
					{stemMenu}
					sections={data.song.sections}
					changes={data.song.changes}
					startAt={data.song.startAt}
					endAt={data.song.endAt}
					fps={data.song.frameRate}
					onengine={(e) => (playerEngine = e)}
				>
					{#snippet errorHint()}
						A stem's file is missing from the Blob store. Remove it from its menu and upload it
						again.
					{/snippet}
				</StemPlayer>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-between gap-4">
				<p class="text-sm text-dim">No stems yet.</p>
			</div>
		{/if}

		{@render headerExtras?.(playerEngine ?? undefined)}

		{#if versionOffer && data.canEdit}
			<div
				class="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-current/40 bg-blue-300/5 px-3 py-2 text-sm"
				role="status"
			>
				<span>Stems changed. Bump the song version from v{data.song.version}?</span>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("patch")}
				>
					{bumpVersion(data.song.version, "patch")}
				</button>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("minor")}
				>
					{bumpVersion(data.song.version, "minor")}
				</button>
				<button
					class="button button-xs"
					type="button"
					disabled={versionBusy}
					onclick={() => bump("major")}
				>
					{bumpVersion(data.song.version, "major")}
				</button>
				<button class="link-dim text-xs" type="button" onclick={() => (versionOffer = false)}
					>Keep v{data.song.version}</button
				>
			</div>
		{/if}
		<!-- upload notice -->
		{#if uploadNotice}
			<p class="text-sm px-3 py-2 border border-current/40 rounded-md mb-2 bg-blue-300/5">
				{uploadNotice}
			</p>
		{/if}

		{#if uploadJobs.length > 0}
			<ul class="divide-y divide-white/10" aria-live="polite" aria-label="Uploading">
				{#each uploadJobs as job (job.file.name)}
					<li class="px-4 py-3">
						<div class="flex items-baseline justify-between gap-4 text-sm">
							<span class="truncate">{job.file.name}</span>
							<span class="shrink-0 text-dim">
								{#if job.status === "error"}failed{:else if job.status === "done"}{formatBytes(
										job.file.size,
									)}{:else if job.status === "decoding"}decoding…{:else if job.status === "uploading"}{Math.round(
										job.percent,
									)}%{:else}queued{/if}
							</span>
						</div>
						<div class="mt-2 h-1 overflow-hidden rounded bg-white/10">
							<div
								class="h-full {job.status === 'error' ? 'bg-red-400' : 'bg-maximumYellow'}"
								style:width="{job.percent}%"
							></div>
						</div>
						{#if job.error}<p class="mt-1 text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}

		{#if pending.length > 0}
			<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="Stems not ready">
				{#each pending as stem (stem.id)}
					{@const job = replacing[stem.id]}
					{@const remove = deleteStem.for(stem.id)}
					<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
						<span class="truncate">
							{stem.label}
							<span class="text-dim">
								· {stem.filename} · {job
									? job.stage === "uploading"
										? `${Math.round(job.percent)}%`
										: job.stage
									: "not ready — the upload was interrupted"}
							</span>
						</span>
						<span class="flex items-center gap-3">
							{#if data.canEdit}
								<label class="cursor-pointer link-dim">
									Upload file
									<input
										class="sr-only"
										type="file"
										accept={STEM_ACCEPT}
										disabled={!!job}
										onchange={(e) => replaceStem(stem.id, e.currentTarget)}
									/>
								</label>
								<form {...remove}>
									<input {...remove.fields.id.as("hidden", stem.id)} />
									<button class="link-dim" disabled={!!remove.pending}>Remove</button>
								</form>
							{/if}
						</span>
						{#if job?.error}<p class="w-full text-xs text-red-400">{job.error}</p>{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- 3. chart, lyrics & notes -->
	<section
		class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full max-w-full overflow-hidden grid-rows-1fr relative"
		aria-label="Chart, lyrics and notes"
	>
		<!-- <div class="h-full relative"> -->
		{#if data.docs[doc]}
			<article
				class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
			>
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html data.docs[doc]}
			</article>
		{:else}
			<p
				class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
			>
				No {doc} yet.
			</p>
		{/if}
		<!-- tool bar  -->
		<div class="absolute top-2 right-3 mb-2 grid grid-cols-[auto_auto] place-content-end gap-4">
			<div
				class="flex overflow-hidden rounded border border-white/15 items-center"
				role="tablist"
				aria-label="Document"
			>
				{#each DOC_KINDS as kind, index (kind)}
					<button
						type="button"
						role="tab"
						aria-selected={doc === kind}
						class="{doc === kind
							? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
							: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
							? 'rounded-r-none border-r-none'
							: index === DOC_KINDS.length - 1
								? 'rounded-l-none'
								: 'rounded-none border-r-none'}"
						onclick={() => (doc = kind)}>{DOC_LABELS[kind]}</button
					>
				{/each}
			</div>
			<a
				class="button button-xs h-full {data.canEdit ? '' : 'hidden'}"
				href="/{data.account.slug}/projects/{data.song.project.slug}/{data.song.slug}/{doc}"
			>
				{@html data.docs[doc]
					? `<span class="i-ph-pencil"></span>`
					: `<span class="i-ph-plus"></span>`}
			</a>
		</div>
		<!-- </div> -->
	</section>
</main>

{#if readyDemos.length > 0}
	<div
		id="song-demos"
		popover="auto"
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Demo recordings</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-demos"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if demoTrack}
			<!-- svelte-ignore a11y_media_has_caption -->
			<audio
				bind:this={demoAudio}
				src={demoTrack.playbackUrl ?? demoTrack.url}
				bind:paused={demoPaused}
				preload="auto"
				onended={() => (demoPaused = true)}
			></audio>
		{/if}
		<ul class="grid gap-2">
			{#each readyDemos as d (d.id)}
				<li class="flex items-center gap-3 rounded border border-white/10 px-3 py-2">
					<button
						type="button"
						class="grid h-9 w-9 shrink-0 place-items-center rounded bg-maximumYellow text-oxford active:scale-95"
						aria-label={demoPlaying === d.id && !demoPaused
							? `Pause ${d.label}`
							: `Play ${d.label}`}
						onclick={() => playDemo(d.id)}
					>
						<span
							class={demoPlaying === d.id && !demoPaused ? "i-ph-pause-fill" : "i-ph-play-fill"}
							aria-hidden="true"
						></span>
					</button>
					<span class="min-w-0 grow truncate">
						{d.label}
						<span class="block text-xs text-dim">{formatBytes(d.sizeBytes)}</span>
					</span>
					<button
						type="button"
						class="button button-xs"
						title={d.playbackUrl ? `Download ${d.label}.mp3` : `Download ${d.filename}`}
						onclick={() =>
							d.playbackUrl ? saveAs(d.playbackUrl, `${d.label}.mp3`) : saveAs(d.url, d.filename)}
					>
						<span class="i-ph-download-simple" aria-hidden="true"></span>
						Download
					</button>
				</li>
			{/each}
		</ul>
	</div>
{/if}

{#snippet headerExtras(engine?: StemEngine)}
	<div class="flex flex-wrap items-center gap-2">
		{#if data.canEdit}
			<StemUploader
				songId={data.song.id}
				stemCount={data.song.stems.length}
				bind:jobs={uploadJobs}
				bind:notice={uploadNotice}
				onuploaded={() => (versionOffer = true)}
			/>
		{/if}
		{#if ready.length > 0}
			<button
				class="button button-sm"
				type="button"
				disabled={!!zipping}
				onclick={downloadAll}
				title="Download all stems"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{zipping ?? "Download Stems"}
			</button>
			<button
				class="button button-sm"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("original", engine)}
				title="Download an MP3 of the full mix"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "original" ? "Rendering…" : "Original Mix (MP3)"}
			</button>
			<button
				class="button button-sm"
				type="button"
				disabled={!!mixing}
				onclick={() => downloadMix("custom", engine)}
				title="Download an MP3 of what is audible now (mute, solo, faders)"
			>
				<span class="i-ph-download-simple" aria-hidden="true"></span>
				{mixing === "custom" ? "Rendering…" : "Custom Mix (MP3)"}
			</button>
			{#if mixError}
				<p class="w-full text-sm text-red-400" role="alert">{mixError}</p>
			{/if}
		{/if}
		{#if readyDemos.length > 0}
			<button
				class="button button-sm"
				type="button"
				popovertarget="song-demos"
				title="Listen to or download the demo recordings"
			>
				<span class="i-ph-microphone" aria-hidden="true"></span>
				Demos ({readyDemos.length})
			</button>
		{/if}
	</div>
{/snippet}

{#snippet stemMenu(stem: StemState)}
	{@const row = stemRows.get(stem.id)}
	{@const job = replacing[stem.id]}
	{@const remove = deleteStem.for(stem.id)}
	{#if row}
		<details class="relative" data-stem-menu>
			<summary
				class="grid h-8 w-8 cursor-pointer list-none place-items-center rounded border border-white/25 text-lg leading-none hover:border-white/60 [&::-webkit-details-marker]:hidden"
				title="{stem.label}: options"
				aria-label="{stem.label}: options"
				><span class="i-ph-dots-three-bold" aria-hidden="true"></span></summary
			>
			<div
				class="absolute right-0 z-20 mt-1 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
			>
				<div class="truncate px-3 py-1.5 text-xs text-dim">
					{row.filename} · {formatBytes(row.sizeBytes)}
				</div>
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => saveAs(row.url, row.filename)}
				>
					<span class="i-ph-download-simple mr-2" aria-hidden="true"></span>Download
				</button>
				{#if data.canEdit}
					<button
						class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
						type="button"
						onclick={() => rename(stem.id, stem.label)}
					>
						<span class="i-ph-pencil-simple mr-2" aria-hidden="true"></span>Rename
					</button>
					<label
						class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10"
					>
						<span class="i-ph-upload-simple mr-2" aria-hidden="true"></span>{job
							? job.stage === "uploading"
								? `Uploading ${Math.round(job.percent)}%`
								: job.stage
							: "Upload new version"}
						<input
							class="sr-only"
							type="file"
							accept={STEM_ACCEPT}
							disabled={!!job}
							onchange={(e) => replaceStem(stem.id, e.currentTarget)}
						/>
					</label>
					<form
						{...remove.enhance(async ({ submit }) => {
							if (!confirm(`Remove "${stem.label}" and its file?`)) return;
							await submit();
						})}
					>
						<input {...remove.fields.id.as("hidden", stem.id)} />
						<button
							class="block w-full rounded px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
							disabled={!!remove.pending}
						>
							<span class="i-ph-trash mr-2" aria-hidden="true"></span>{remove.pending
								? "Removing…"
								: "Remove"}
						</button>
					</form>
				{/if}
				{#if job?.error}<p class="px-3 py-1 text-xs text-red-400">{job.error}</p>{/if}
			</div>
		</details>
	{/if}
{/snippet}
