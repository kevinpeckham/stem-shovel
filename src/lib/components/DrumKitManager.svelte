<script lang="ts">
	import { DEMO_ACCEPT } from "#lib/constants/demoFormats.js";
	import { DRUM_SAMPLE_MAX_BYTES, MAX_DRUM_KITS_PER_ACCOUNT } from "#lib/constants/drumKits.js";
	import { DRUM_VOICES, type DrumVoiceId } from "#lib/constants/drumMachine.js";
	import {
		createDrumKit,
		deleteDrumKit,
		deleteDrumSample,
		renameDrumKit,
		setDrumSampleSource,
	} from "#lib/remote/drumKits.remote.js";
	import {
		BUILTIN_SAMPLE_FILES,
		BUILTIN_SAMPLES_SOURCE,
		isOverridableKit,
	} from "#lib/constants/drumKits.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, uploadDrumSampleFile } from "#lib/upload.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * Custom drum kits, made and kept here (docs/drum-machine.md, "Custom
	 * kits"): the account's in the drum machine's Kits menu for its editors,
	 * the site's on /admin/drum-kits. A kit is a name over twelve voices;
	 * each voice takes one audio file (uploaded through /api/drum-samples), a
	 * new file replacing the old once it is up. The parent owns the rows and
	 * refreshes them through `onchange`.
	 */
	export interface KitSample {
		id: string;
		voice: DrumVoiceId;
		status: string;
		filename: string;
		contentType: string;
		sizeBytes: number;
		url: string;
		/** Where the file came from, as written by whoever uploaded it (provenance). */
		source: string;
		uploadedBy: string | null;
		createdAt: Date;
	}
	export interface KitRow {
		id: string;
		name: string;
		scope: "site" | "account";
		/** A built-in kit (Acoustic, Room): its own files unless a drum was replaced; never renamed or deleted. */
		builtin?: boolean;
		samples: KitSample[];
	}
	interface Props {
		/** The account whose kits these are; null for the site's (a system admin). */
		accountId: string | null;
		kits: KitRow[];
		onchange: () => void | Promise<void>;
	}
	let { accountId, kits, onchange }: Props = $props();

	let newName = $state("");
	let creating = $state(false);
	/** The kit unfolded to its voices. */
	let openKit = $state<string | null>(null);
	/** Uploads under way, by kit and voice, as a percentage. */
	let progress = $state<Record<string, number>>({});
	const key = (kitId: string, voice: DrumVoiceId) => `${kitId}:${voice}`;
	const ready = (k: KitRow, voice: DrumVoiceId) =>
		k.samples.find((s) => s.voice === voice && s.status === "ready") ?? null;
	const voicesFilled = (k: KitRow) => DRUM_VOICES.filter((v) => ready(k, v.id)).length;
	const full = $derived(accountId !== null && kits.length >= MAX_DRUM_KITS_PER_ACCOUNT);

	async function create(e: SubmitEvent) {
		e.preventDefault();
		const name = newName.trim();
		if (!name || creating) return;
		creating = true;
		try {
			const row = await createDrumKit({ accountId: accountId ?? undefined, name });
			newName = "";
			await onchange();
			openKit = row.id;
			notify(`Kit “${row.name}” made: give each drum a file`);
		} catch (err) {
			notify(`Could not make the kit: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			creating = false;
		}
	}
	async function rename(k: KitRow) {
		const name = window.prompt("Rename the kit", k.name)?.trim();
		if (!name || name === k.name) return;
		try {
			await renameDrumKit({ id: k.id, name });
			await onchange();
		} catch (err) {
			notify(`Could not rename it: ${errorMessage(err)}`, { kind: "error" });
		}
	}
	async function remove(k: KitRow) {
		if (!window.confirm(`Delete the kit “${k.name}” and its files?`)) return;
		try {
			await deleteDrumKit({ id: k.id });
			await onchange();
			notify(`Kit “${k.name}” deleted`);
		} catch (err) {
			notify(`Could not delete it: ${errorMessage(err)}`, { kind: "error" });
		}
	}
	async function upload(k: KitRow, voice: DrumVoiceId, input: HTMLInputElement) {
		const file = input.files?.[0];
		input.value = "";
		if (!file) return;
		if (file.size > DRUM_SAMPLE_MAX_BYTES) {
			notify(`A sample is at most ${formatBytes(DRUM_SAMPLE_MAX_BYTES)}`, { kind: "error" });
			return;
		}
		const id = key(k.id, voice);
		progress[id] = 0;
		try {
			await uploadDrumSampleFile(
				file,
				() =>
					postJson("/api/drum-samples", {
						kitId: k.id,
						voice,
						filename: file.name,
						sizeBytes: file.size,
					}),
				(pct) => (progress[id] = pct),
			);
			await onchange();
		} catch (err) {
			notify(`Could not upload “${file.name}”: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			delete progress[id];
		}
	}
	async function removeSample(k: KitRow, s: KitSample) {
		try {
			await deleteDrumSample({ id: s.id });
			await onchange();
		} catch (err) {
			notify(`Could not remove it: ${errorMessage(err)}`, { kind: "error" });
		}
	}
	/** The file's format for the eye: the extension, or the type's subtype. */
	const formatOf = (s: KitSample) =>
		(s.filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? s.contentType.split("/")[1] ?? "").toUpperCase();
	async function editSource(s: KitSample) {
		const source = window.prompt(
			"Where did this file come from? A URL, a pack's name, a licence…",
			s.source,
		);
		if (source === null || source.trim() === s.source) return;
		try {
			await setDrumSampleSource({ id: s.id, source: source.trim() });
			await onchange();
		} catch (err) {
			notify(`Could not save the source: ${errorMessage(err)}`, { kind: "error" });
		}
	}
	/** A listen: the file as it is, once. */
	function audition(url: string) {
		const a = new Audio(url);
		void a.play().catch(() => {});
	}
</script>

<div class="grid gap-4 text-13px">
	<form class="flex items-end gap-2" onsubmit={create}>
		<label class="block grow">
			<span class="device-button-label">New kit</span>
			<input
				class="device-field w-full"
				type="text"
				maxlength="120"
				placeholder="Kit name"
				autocomplete="off"
				disabled={full}
				bind:value={newName}
			/>
		</label>
		<button
			class="device-button-xs px-3 border shrink-0"
			type="submit"
			disabled={creating || full || !newName.trim()}>{creating ? "Making…" : "Make kit"}</button
		>
	</form>
	{#if full}
		<p class="text-12px opacity-70">
			This account has {MAX_DRUM_KITS_PER_ACCOUNT} kits, as many as it can hold; delete one to make another.
		</p>
	{/if}
	{#if kits.length === 0}
		<p class="text-12px opacity-70">
			No kits yet. Make one, then give each of its twelve drums a file: WAV, FLAC, MP3, M4A or AIFF,
			up to {formatBytes(DRUM_SAMPLE_MAX_BYTES)} each. A drum without a file is silent.
		</p>
	{/if}
	<ul class="m-0 p-0 list-none grid gap-2" aria-label="Kits">
		{#each kits as k (k.id)}
			<li class="rounded border border-current/15">
				<div class="flex items-center gap-2 px-3 py-2">
					<button
						class="flex-1 min-w-0 text-left truncate font-500 hover-text-accent"
						type="button"
						aria-expanded={openKit === k.id}
						onclick={() => (openKit = openKit === k.id ? null : k.id)}
					>
						<span
							class="{openKit === k.id
								? 'i-ph-caret-down'
								: 'i-ph-caret-right'} inline-block text-12px opacity-70 mr-1"
							aria-hidden="true"
						></span>
						{k.name}
					</button>
					<span class="text-12px opacity-60 tabular-nums"
						>{#if k.builtin}built in · {voicesFilled(k)} replaced{:else}{voicesFilled(k)} of {DRUM_VOICES.length}
							drums{/if}</span
					>
					{#if !k.builtin}
						<button
							class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
							type="button"
							title="Rename the kit"
							aria-label="Rename {k.name}"
							onclick={() => void rename(k)}
						>
							<span class="i-ph-pencil-simple" aria-hidden="true"></span>
						</button>
						<button
							class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px shrink-0"
							type="button"
							title="Delete the kit and its files"
							aria-label="Delete {k.name}"
							onclick={() => void remove(k)}
						>
							<span class="i-ph-trash" aria-hidden="true"></span>
						</button>
					{/if}
				</div>
				{#if openKit === k.id}
					<ul class="m-0 p-0 list-none border-t border-current/10 divide-y divide-current/10">
						{#each DRUM_VOICES as v (v.id)}
							{@const s = ready(k, v.id)}
							{@const pct = progress[key(k.id, v.id)]}
							<li class="grid grid-cols-[6rem_1fr_auto] items-center gap-2 px-3 py-1.5">
								<span class="opacity-90">{v.label}</span>
								<span class="min-w-0 text-12px opacity-70 grid gap-0.5">
									{#if pct !== undefined}
										<span>Uploading… {Math.round(pct)}%</span>
									{:else if s}
										<span class="truncate">{s.filename}</span>
										<!-- the file's facts and its provenance (docs/drum-machine.md, "Custom kits") -->
										<span class="truncate opacity-80"
											>{formatOf(s)} · {formatBytes(s.sizeBytes)} · {formatDate(
												s.createdAt,
											)}{s.uploadedBy ? ` by ${s.uploadedBy}` : ""}</span
										>
										<span class="flex items-center gap-1 min-w-0">
											<span class="truncate {s.source ? '' : 'opacity-60'}"
												>Source: {s.source || "not noted"}</span
											>
											<button
												class="opacity-70 hover-opacity-100 inline-grid place-items-center w-5 h-5 text-12px shrink-0"
												type="button"
												title="Note where the file came from"
												aria-label="Edit the source of the {v.label} of {k.name}"
												onclick={() => void editSource(s)}
											>
												<span class="i-ph-pencil-simple" aria-hidden="true"></span>
											</button>
										</span>
									{:else if k.builtin && isOverridableKit(k.id)}
										<span>the built-in file</span>
										<span class="truncate opacity-80"
											>WAV · {BUILTIN_SAMPLE_FILES[k.id][v.id]}.wav · Source: {BUILTIN_SAMPLES_SOURCE}</span
										>
									{:else}
										<span>no file (silent)</span>
									{/if}
								</span>
								<span class="flex items-center gap-1">
									{#if s || k.builtin}
										<button
											class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px"
											type="button"
											title="Listen"
											aria-label="Listen to the {v.label} of {k.name}"
											onclick={() => audition(s ? s.url : `/kits/${k.id}/${v.id}.wav`)}
										>
											<span class="i-ph-play" aria-hidden="true"></span>
										</button>
									{/if}
									<label
										class="device-button-xs px-2 border cursor-pointer {pct !== undefined
											? 'opacity-50 pointer-events-none'
											: ''}"
									>
										{s ? "Replace" : "Upload"}
										<input
											class="sr-only"
											type="file"
											accept={DEMO_ACCEPT}
											aria-label="{s ? 'Replace' : 'Upload'} the {v.label} of {k.name}"
											onchange={(e) => void upload(k, v.id, e.currentTarget)}
										/>
									</label>
									{#if s}
										<button
											class="opacity-70 hover-opacity-100 inline-grid place-items-center w-6 h-6 text-14px"
											type="button"
											title={k.builtin
												? "Remove the replacement (back to the built-in file)"
												: "Remove the file (the drum goes silent)"}
											aria-label="Remove the {v.label} of {k.name}"
											onclick={() => void removeSample(k, s)}
										>
											<span class="i-ph-x" aria-hidden="true"></span>
										</button>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</div>
