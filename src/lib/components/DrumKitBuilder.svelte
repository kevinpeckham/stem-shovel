<script lang="ts">
	import {
		DRUM_KIT_LAYER_NAMES,
		DRUM_SAMPLE_MAX_BYTES,
		MAX_DRUM_ROUND_ROBINS,
		MULTISAMPLED_KIT_FORMATS,
		type DrumKitLayer,
		type MultisampledKitFormat,
	} from "#lib/constants/drumKits.js";
	import { DRUM_VOICES, type DrumVoiceId } from "#lib/constants/drumMachine.js";
	import { createDrumKit, deleteDrumKit, deleteDrumSample } from "#lib/remote/drumKits.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, uploadDrumSampleFile, type DrumSampleReservation } from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { hashBytes } from "#lib/utils/hashBytes.js";
	import { maxMomentaryLoudness } from "#lib/utils/maxMomentaryLoudness.js";

	/**
	 * The multisampled kit builder (docs/drum-machine.md, "Multisampled
	 * kits"): a walkthrough, one velocity layer a page, loudest first. Layer 5
	 * lists every drum; a drum needs a file there to be in the kit, and only
	 * such drums take lower layers, which are optional (an empty one plays the
	 * layer above, turned down). Each drum takes 1 to MAX_DRUM_ROUND_ROBINS
	 * round-robin files a layer, dropped or chosen, in the one format picked
	 * at the start. Every file is checked (format, size, a duplicate, that it
	 * decodes and is not silent), measured for loudness, and uploaded as it is
	 * added: the kit is saved as it goes, and named for its place on our side.
	 * A rejected file is listed under its own name with the reason.
	 */
	interface Props {
		accountId: string;
		/** After the builder closes: the parent refreshes its kits; the id is the kit made, null when nothing was kept. */
		onchange: (kitId: string | null) => void | Promise<void>;
	}
	let { accountId, onchange }: Props = $props();

	interface Added {
		id: number;
		original: string;
		hash: string;
		/** The sample's row, once reserved; null while it is checked and reserved. */
		sampleId: string | null;
		/** The name it was given in the kit (`snare V5 RR2.flac`). */
		filename: string | null;
		percent: number;
		uploading: boolean;
		removing: boolean;
	}
	interface Refused {
		original: string;
		reason: string;
	}

	let dialog = $state<HTMLDialogElement | null>(null);
	let page = $state<"intro" | DrumKitLayer>("intro");
	let name = $state("");
	let format = $state<MultisampledKitFormat>(MULTISAMPLED_KIT_FORMATS[0].id);
	let kit = $state<{ id: string; name: string } | null>(null);
	let starting = $state(false);
	let added = $state<Record<string, Added[]>>({});
	let refused = $state<Record<string, Refused[]>>({});
	let dragOver = $state<string | null>(null);
	/** Files being checked or uploaded: the way on waits for them. */
	let busy = $state(0);
	let nextId = 0;

	const slot = (voice: DrumVoiceId, layer: DrumKitLayer) => `${voice}:${layer}`;
	const filesIn = (voice: DrumVoiceId, layer: DrumKitLayer) => added[slot(voice, layer)] ?? [];
	/** A drum is in the kit once a layer 5 file of it is up. */
	const inKit = (voice: DrumVoiceId) => filesIn(voice, 5).some((f) => f.sampleId && !f.uploading);
	const chosen = $derived(MULTISAMPLED_KIT_FORMATS.find((f) => f.id === format)!);
	const accept = $derived(chosen.extensions.map((e) => `.${e}`).join(","));
	const usable = $derived(DRUM_VOICES.filter((v) => inKit(v.id)));
	const unusable = $derived(DRUM_VOICES.filter((v) => !inKit(v.id)));
	const kept = $derived(Object.values(added).reduce((n, list) => n + list.length, 0));
	/** Next and Finish: never while files are on their way; on layer 5, once a drum has a file. */
	const canGoOn = $derived(busy === 0 && (page !== 5 || usable.length > 0));

	export function open() {
		page = "intro";
		name = "";
		format = MULTISAMPLED_KIT_FORMATS[0].id;
		kit = null;
		added = {};
		refused = {};
		busy = 0;
		dialog?.showModal();
	}

	async function start(e: SubmitEvent) {
		e.preventDefault();
		const kitName = name.trim();
		if (!kitName || starting) return;
		starting = true;
		try {
			const row = await createDrumKit({ accountId, name: kitName, multisampled: true });
			kit = { id: row.id, name: row.name };
			page = 5;
		} catch (err) {
			notify(`Could not make the kit: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			starting = false;
		}
	}

	function refuse(key: string, original: string, reason: string) {
		(refused[key] ??= []).push({ original, reason });
	}

	async function addFiles(voice: DrumVoiceId, layer: DrumKitLayer, files: File[]) {
		// One at a time, in the order given: the server numbers the round robins as they come.
		for (const file of files) {
			busy++;
			try {
				await addFile(voice, layer, file);
			} finally {
				busy--;
			}
		}
	}

	async function addFile(voice: DrumVoiceId, layer: DrumKitLayer, file: File) {
		if (!kit) return;
		const key = slot(voice, layer);
		const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase() ?? "";
		if (!(chosen.extensions as readonly string[]).includes(ext))
			return refuse(key, file.name, `not a ${chosen.label} file`);
		if (file.size > DRUM_SAMPLE_MAX_BYTES)
			return refuse(key, file.name, `over ${formatBytes(DRUM_SAMPLE_MAX_BYTES)}`);
		if (filesIn(voice, layer).length >= MAX_DRUM_ROUND_ROBINS)
			return refuse(key, file.name, `a layer holds ${MAX_DRUM_ROUND_ROBINS} files`);
		const bytes = new Uint8Array(await file.arrayBuffer());
		const hash = hashBytes(bytes);
		const twin = filesIn(voice, layer).find((f) => f.hash === hash);
		if (twin) return refuse(key, file.name, `the same file as ${twin.original}`);
		let loudness: number;
		try {
			// Decoded at 48 kHz (the browser resamples), measured, and let go: only the number is kept.
			const audio = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer.slice(0));
			const channels = Array.from({ length: audio.numberOfChannels }, (_, c) =>
				audio.getChannelData(c),
			);
			loudness = maxMomentaryLoudness(channels, audio.sampleRate);
		} catch {
			return refuse(key, file.name, "could not be read as audio");
		}
		if (!Number.isFinite(loudness)) return refuse(key, file.name, "silent");

		const id = nextId++;
		(added[key] ??= []).push({
			id,
			original: file.name,
			hash,
			sampleId: null,
			filename: null,
			percent: 0,
			uploading: true,
			removing: false,
		});
		const live = () => added[key]?.find((f) => f.id === id);
		try {
			const kitId = kit.id;
			const reservation = await uploadDrumSampleFile(
				file,
				() =>
					postJson<DrumSampleReservation>("/api/drum-samples", {
						kitId,
						voice,
						filename: file.name,
						sizeBytes: file.size,
						layer,
						loudness: Math.round(loudness * 100) / 100,
					}),
				(percent) => {
					const f = live();
					if (f) f.percent = percent;
				},
			);
			const f = live();
			if (f) {
				f.sampleId = reservation.sampleId;
				f.filename = reservation.filename ?? null;
				f.uploading = false;
			}
		} catch (err) {
			added[key] = (added[key] ?? []).filter((f) => f.id !== id);
			refuse(key, file.name, errorMessage(err));
		}
	}

	async function removeFile(voice: DrumVoiceId, layer: DrumKitLayer, file: Added) {
		if (!file.sampleId || file.uploading || file.removing) return;
		// The last layer 5 file of a drum takes the drum out of the kit, and its lower layers with it.
		const lastTop = layer === 5 && filesIn(voice, 5).length === 1;
		const lower = lastTop
			? ([4, 3, 2, 1] as const).flatMap((l) => filesIn(voice, l).map((f) => ({ l, f })))
			: [];
		if (
			lower.length &&
			!window.confirm(
				`This is the drum's last layer 5 file. Removing it takes the drum out of the kit, with its ${lower.length} lower-layer file${lower.length === 1 ? "" : "s"}. Remove them all?`,
			)
		)
			return;
		file.removing = true;
		try {
			for (const { l, f } of lower) {
				if (f.sampleId) await deleteDrumSample({ id: f.sampleId });
				added[slot(voice, l)] = filesIn(voice, l).filter((x) => x.id !== f.id);
			}
			await deleteDrumSample({ id: file.sampleId });
			added[slot(voice, layer)] = filesIn(voice, layer).filter((x) => x.id !== file.id);
		} catch (err) {
			file.removing = false;
			notify(`Could not remove ${file.filename ?? file.original}: ${errorMessage(err)}`, {
				kind: "error",
			});
		}
	}

	function onDrop(e: DragEvent, voice: DrumVoiceId, layer: DrumKitLayer) {
		e.preventDefault();
		dragOver = null;
		void addFiles(voice, layer, [...(e.dataTransfer?.files ?? [])]);
	}
	function onPick(e: Event & { currentTarget: HTMLInputElement }, voice: DrumVoiceId, layer: DrumKitLayer) {
		const files = [...(e.currentTarget.files ?? [])];
		e.currentTarget.value = "";
		void addFiles(voice, layer, files);
	}

	/** Escape while files are on their way: stay, so nothing is cut off mid-upload. */
	function onCancel(e: Event) {
		if (busy > 0) {
			e.preventDefault();
			notify("Wait for the files to finish uploading");
		}
	}
	/** However it closes (Finish, ×, Escape): a kit with no files is not kept; the parent refreshes either way. */
	async function onClose() {
		const made = kit;
		kit = null;
		if (!made) return;
		if (kept === 0) {
			try {
				await deleteDrumKit({ id: made.id });
			} catch {
				// An empty kit left behind is harmless; the manager can delete it.
			}
			await onchange(null);
			return;
		}
		await onchange(made.id);
		notify(`Kit “${made.name}” saved`);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialog}
	class="m-auto w-[min(48rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] rounded-md border border-white/15 bg-oxford p-0 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/80"
	aria-label="Build a multisampled kit"
	oncancel={onCancel}
	onclose={() => void onClose()}
	ondragover={(e) => e.preventDefault()}
	ondrop={(e) => e.preventDefault()}
>
	<div class="grid grid-rows-[auto_1fr_auto] max-h-[calc(100dvh-2rem)] text-13px">
		<!-- heading -->
		<div class="flex items-center gap-3 px-4 py-3 border-b border-white/10">
			<h2 class="m-0 text-16px font-500 grow">
				{#if page === "intro"}
					Build a multisampled kit
				{:else}
					{kit?.name} · Layer {page} of 5 <span class="opacity-60">({DRUM_KIT_LAYER_NAMES[page]})</span>
				{/if}
			</h2>
			<button
				class="opacity-70 hover-opacity-100 inline-grid place-items-center w-7 h-7 text-16px disabled-opacity-30"
				type="button"
				title={busy > 0 ? "Wait for the files to finish uploading" : "Close"}
				aria-label="Close"
				disabled={busy > 0}
				onclick={() => dialog?.close()}
			>
				<span class="i-ph-x" aria-hidden="true"></span>
			</button>
		</div>

		<!-- body -->
		<div class="overflow-y-auto px-4 py-3">
			{#if page === "intro"}
				<form id="kit-builder-start" class="grid gap-4" onsubmit={start}>
					<p class="m-0 opacity-90">
						A multisampled kit gives each drum up to five velocity layers, each with several
						round-robin samples, so soft and hard hits sound different and repeated hits do not
						sound identical. For a simple kit with one sample per drum, close this and use
						<strong>Make kit</strong> in the kit manager.
					</p>
					<ul class="m-0 pl-5 grid gap-1 opacity-90">
						<li>
							Velocity layer 5 is the loudest, and comes first. Every drum you want in the kit needs at
							least one layer 5 file: 1 to {MAX_DRUM_ROUND_ROBINS} round-robin samples.
						</li>
						<li>
							Lower layers are optional. Any layer left empty plays the samples of the next layer up,
							turned down by an amount measured from your files.
						</li>
						<li>
							Every file must be in the format you choose below. Their names do not matter: the
							builder names them for you.
						</li>
						<li>
							Mind your account's storage: a kit is many files, and the compressed formats take far
							less room. Each file is at most {formatBytes(DRUM_SAMPLE_MAX_BYTES)}.
						</li>
					</ul>
					<label class="block">
						<span class="device-button-label">Kit name</span>
						<input
							class="device-field w-full"
							type="text"
							maxlength="120"
							placeholder="Kit name"
							autocomplete="off"
							required
							bind:value={name}
						/>
					</label>
					<fieldset class="m-0 p-0 border-0 grid gap-2">
						<legend class="device-button-label mb-1">Format of every file</legend>
						<div class="flex flex-wrap gap-2">
							{#each MULTISAMPLED_KIT_FORMATS as f (f.id)}
								<label
									class="flex items-center gap-2 rounded border px-3 py-1.5 cursor-pointer {format ===
									f.id
										? 'border-accent text-accent'
										: 'border-white/20 hover-border-white/40'}"
								>
									<input class="sr-only" type="radio" name="kit-format" value={f.id} bind:group={format} />
									<span class="font-500">{f.label}</span>
									<span class="text-11px opacity-70">{f.note}</span>
								</label>
							{/each}
						</div>
					</fieldset>
				</form>
			{:else}
				{@const layer = page}
				<p class="m-0 mb-3 opacity-80">
					{#if layer === 5}
						Drop {chosen.label} files on a drum, or click it to choose them: 1 to {MAX_DRUM_ROUND_ROBINS}
						a drum. Only the drums you give a file here will be in the kit.
					{:else}
						Optional. A drum left empty here plays its layer {layer + 1} samples, turned down. Drop up to
						{MAX_DRUM_ROUND_ROBINS} {chosen.label} files on a drum, or click it to choose them.
					{/if}
				</p>
				<ul class="m-0 p-0 list-none grid gap-2">
					{#each layer === 5 ? DRUM_VOICES : usable as v (v.id)}
						{@const key = slot(v.id, layer)}
						{@const files = filesIn(v.id, layer)}
						{@const refusals = refused[key] ?? []}
						<li class="grid grid-cols-[6.5rem_1fr] gap-x-3 gap-y-1 items-start">
							<span class="pt-2 font-500">{v.label}</span>
							<div class="grid gap-1 min-w-0">
								<label
									class="flex items-center justify-between gap-2 rounded border border-dashed px-3 py-2 cursor-pointer text-12px {dragOver ===
									key
										? 'border-accent bg-white/10'
										: 'border-white/25 hover-border-white/50'} {files.length >= MAX_DRUM_ROUND_ROBINS
										? 'opacity-50 pointer-events-none'
										: ''}"
									ondragover={(e) => {
										e.preventDefault();
										dragOver = key;
									}}
									ondragleave={() => {
										if (dragOver === key) dragOver = null;
									}}
									ondrop={(e) => onDrop(e, v.id, layer)}
								>
									<span class="opacity-80">
										{files.length >= MAX_DRUM_ROUND_ROBINS
											? "This layer is full"
											: `Drop ${chosen.label} files here, or click to choose`}
									</span>
									<span class="tabular-nums opacity-60">{files.length} / {MAX_DRUM_ROUND_ROBINS}</span>
									<input
										class="sr-only"
										type="file"
										multiple
										{accept}
										aria-label="Add {chosen.label} files to the {v.label}, layer {layer}"
										onchange={(e) => onPick(e, v.id, layer)}
									/>
								</label>
								{#if files.length}
									<ul class="m-0 p-0 list-none flex flex-wrap gap-1" aria-label="{v.label} layer {layer} files">
										{#each files as f (f.id)}
											<li
												class="flex items-center gap-1 rounded bg-white/10 pl-2 pr-1 py-0.5 text-12px {f.removing
													? 'opacity-50'
													: ''}"
												title={f.original}
											>
												<span class="truncate max-w-56">
													{#if f.uploading}
														{f.original} · {Math.round(f.percent)}%
													{:else}
														{f.filename ?? f.original}
													{/if}
												</span>
												<button
													class="opacity-70 hover-opacity-100 inline-grid place-items-center w-5 h-5 text-12px disabled-opacity-30"
													type="button"
													title="Remove this file"
													aria-label="Remove {f.filename ?? f.original}"
													disabled={f.uploading || f.removing}
													onclick={() => void removeFile(v.id, layer, f)}
												>
													<span class="i-ph-x" aria-hidden="true"></span>
												</button>
											</li>
										{/each}
									</ul>
								{/if}
								{#if refusals.length}
									<ul class="m-0 p-0 list-none grid gap-0.5 text-12px text-red-300" aria-label="Files not accepted">
										{#each refusals as r, i (i)}
											<li class="truncate">Not accepted: {r.original} ({r.reason})</li>
										{/each}
									</ul>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if layer < 5 && unusable.length}
					<div class="mt-4 rounded border border-white/10 px-3 py-2 opacity-70">
						<p class="m-0 mb-1 text-12px">
							These drums are not usable in this kit because all drums must have at least one layer 5
							sample. Lower-layer samples are optional.
						</p>
						<p class="m-0 text-12px">{unusable.map((v) => v.label).join(" · ")}</p>
					</div>
				{/if}
			{/if}
		</div>

		<!-- the way on -->
		<div class="flex items-center gap-2 px-4 py-3 border-t border-white/10">
			{#if page === "intro"}
				<span class="grow"></span>
				<button
					class="device-button-xs px-3 border disabled-opacity-40"
					type="submit"
					form="kit-builder-start"
					disabled={starting || !name.trim()}>{starting ? "Making…" : "Start with layer 5"}</button
				>
			{:else}
				{@const layer = page}
				{#if layer < 5}
					<button
						class="device-button-xs px-3 border disabled-opacity-40"
						type="button"
						disabled={busy > 0}
						onclick={() => (page = (layer + 1) as DrumKitLayer)}
					>
						<span class="i-ph-caret-left" aria-hidden="true"></span> Back
					</button>
				{/if}
				<span class="grow text-12px opacity-70" aria-live="polite">
					{#if busy > 0}Checking and uploading…{:else if layer === 5 && usable.length === 0}Give at least one drum a file to go on.{/if}
				</span>
				{#if layer > 1}
					<button
						class="device-button-xs px-3 border disabled-opacity-40"
						type="button"
						disabled={!canGoOn}
						onclick={() => (page = (layer - 1) as DrumKitLayer)}
					>
						Next layer <span class="i-ph-caret-right" aria-hidden="true"></span>
					</button>
				{/if}
				<button
					class="device-button-xs px-3 border disabled-opacity-40"
					type="button"
					disabled={!canGoOn}
					onclick={() => dialog?.close()}>Finish</button
				>
			{/if}
		</div>
	</div>
</dialog>
