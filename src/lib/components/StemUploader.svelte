<script lang="ts">
	import {
		type Detection,
		type Features,
		type KeyChange,
		type KeySegment,
		analyse,
		combineFeatures,
		combineKeySegments,
		detectKeys,
		extractFeatures,
		extractKeySegments,
	} from "#lib/audio/analysis.js";
	import { keyWindows } from "#lib/utils/keyWindows.js";
	import { refreshAll } from "$app/navigation";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import {
		MAX_STEMS_PER_SONG,
		STEM_ACCEPT,
		STEM_CONTEXT_RATE,
		STEM_FORMAT_LIST,
		STEM_MAX_BYTES,
		STEM_MEMORY_SOFT_BYTES,
	} from "#lib/constants/stemFormats.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { stemContentType } from "#lib/utils/stemContentType.js";
	import { postJson, type Reservation, uploadStemFile } from "#lib/upload.js";
	import { looksLikeNetwork } from "#lib/utils/withRetries.js";

	export interface UploadJob {
		file: File;
		percent: number;
		status: "queued" | "uploading" | "decoding" | "done" | "error";
		error?: string;
		/** The row and pathname reserved for it, kept so "Retry failed" uploads to the same stem. */
		reservation?: Reservation;
	}

	interface Props {
		songId: string;
		/** Stems the song already has, in-flight ones included. */
		stemCount: number;
		/** What those stems take once decoded (utils/decodedStemBytes), for the memory warning after the upload. */
		decodedBytes?: number;
		/** Progress of the current batch, for the parent to render where it likes. */
		jobs?: UploadJob[];
		/** Why a pick was refused (format, size, cap), or null. */
		notice?: string | null;
		/** Called once a batch finishes with at least one stem uploaded. */
		onuploaded?: () => void;
		/** Tempo, key and time signature detected from the batch, once every stem in it has decoded. */
		/** What the batch sounds like: tempo, meter and key, and the keys through the song where it moves (docs/audio-engine.md, "Several keys"). */
		onanalysis?: (detection: Detection, keys: KeyChange[]) => void;
		/** Rendered as an item inside a menu instead of a button. */
		menu?: boolean;
		/** The button's text ("Add Stems" unless given); the menu item keeps its own. */
		label?: string;
		/** Extra classes on the button (a size, a layout), when not in a menu. */
		class?: string;
	}

	/**
	 * "Add New Stems": one button that opens the file picker and starts
	 * uploading on pick — reserve the row, send the bytes browser → Blob,
	 * decode locally and report peaks (see #lib/upload). Sequential keeps the
	 * progress readable and avoids saturating the uplink.
	 */
	let {
		songId,
		stemCount,
		decodedBytes = 0,
		jobs = $bindable([]),
		notice = $bindable(null),
		onuploaded,
		onanalysis,
		menu = false,
		label = "Add Stems",
		class: cls = "",
	}: Props = $props();

	let busy = $state(false);
	/** Room under the sanity ceiling (constants/stemFormats.ts): never the question in practice; memory is. */
	let room = $derived(Math.max(0, MAX_STEMS_PER_SONG - stemCount));

	async function onpick(input: HTMLInputElement) {
		const picked = Array.from(input.files ?? []);
		input.value = "";
		if (picked.length === 0) return;
		const unsupported = picked.filter((f) => !stemContentType(f.name));
		const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
		if (unsupported.length) {
			notice = `Not a supported format (${STEM_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`;
			return;
		}
		if (tooBig.length) {
			notice = `Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`;
			return;
		}
		if (picked.length > room) {
			notice = `A song holds ${MAX_STEMS_PER_SONG} stems at most; ${room} more would fit.`;
			return;
		}
		notice = null;
		jobs = picked.map((file) => ({ file, percent: 0, status: "queued" }));
		await run(jobs);
	}

	/** The jobs that failed, again: the same reservations, so no row is left behind (docs/uploads-and-blob.md, "Retries"). */
	export async function retryFailed() {
		const failed = jobs.filter((j) => j.status === "error");
		for (const job of failed) {
			job.status = "queued";
			job.percent = 0;
			job.error = undefined;
		}
		await run(failed);
	}

	async function run(batch: UploadJob[]) {
		busy = true;
		const ctx = new AudioContext({ sampleRate: STEM_CONTEXT_RATE });
		// What the batch adds to the song's decoded size, for the memory warning after the upload.
		let addedBytes = 0;
		const features: Features[] = [];
		const keySegments: KeySegment[][] = [];
		const one = async (job: UploadJob) => {
			try {
				job.status = "uploading";
				await uploadStemFile(
					job.file,
					async () =>
						job.reservation ??
						postJson<Reservation>("/api/stems", {
							songId,
							filename: job.file.name,
							sizeBytes: job.file.size,
						}),
					{
						ctx,
						onReserved: (r) => (job.reservation = r),
						onProgress: (p) => (job.percent = p),
						onDecoding: () => (job.status = "decoding"),
						onDecoded: (buffer) => {
							addedBytes += buffer.length * buffer.numberOfChannels * 4;
							// Cheap next to the upload itself; the batch is analyzed as one mix below.
							if (onanalysis) {
								features.push(extractFeatures(buffer));
								keySegments.push(extractKeySegments(buffer, keyWindows(buffer.duration)));
							}
						},
					},
				);
				job.status = "done";
				job.percent = 100;
			} catch (err) {
				job.status = "error";
				job.error = (err as Error).message;
			}
		};
		for (const job of batch) await one(job);
		// A second pass, unasked, for what the network dropped (a batch's first files can fail while a
		// connection settles): the same reservations, once the rest of the batch is through.
		const dropped = batch.filter(
			(j) => j.status === "error" && looksLikeNetwork(new Error(j.error ?? "")),
		);
		for (const job of dropped) {
			job.status = "queued";
			job.percent = 0;
			job.error = undefined;
		}
		for (const job of dropped) await one(job);
		const failed = batch.filter((j) => j.status === "error").length;
		await ctx.close();
		busy = false;
		const combined = combineFeatures(features);
		if (combined && onanalysis)
			onanalysis(analyse(combined), detectKeys(combineKeySegments(keySegments)));
		if (jobs.every((j) => j.status === "done")) jobs = [];
		await refreshAll();
		if (failed < batch.length) onuploaded?.();
		// The soft warning (docs/audio-engine.md, "Memory is the binding limit"): the song is past what a phone holds decoded.
		const total = decodedBytes + addedBytes;
		if (total > STEM_MEMORY_SOFT_BYTES && failed < batch.length)
			notify(
				`This song's ${stemCount + batch.length - failed} stems come to about ${formatBytes(total)} once decoded for playback: a computer will manage, a phone may not.`,
				{ kind: "info", timeout: 15_000 },
			);
	}
</script>

<label
	class="{menu
		? 'block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10'
		: `button button-sm cursor-pointer ${cls || 'lg-button-xs'}`} {busy
		? 'pointer-events-none opacity-60'
		: ''}"
	title="Upload new stems to this song."
>
	<span class="i-ph-plus {menu ? 'mr-2' : ''}" aria-hidden="true"></span>
	{busy ? "Uploading…" : label}
	<input
		class="sr-only"
		type="file"
		accept={STEM_ACCEPT}
		multiple
		disabled={busy || room === 0}
		onchange={(e) => onpick(e.currentTarget)}
	/>
</label>
