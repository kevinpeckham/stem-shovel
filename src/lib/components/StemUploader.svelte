<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { formatBytes } from "$lib/utils/formatBytes";
	import {
		MAX_STEMS_PER_SONG,
		STEM_ACCEPT,
		STEM_FORMAT_LIST,
		STEM_MAX_BYTES,
	} from "$lib/constants/stemFormats";
	import { stemContentType } from "$lib/utils/stemContentType";
	import { postJson, type Reservation, uploadStemFile } from "$lib/upload";

	export interface UploadJob {
		file: File;
		percent: number;
		status: "queued" | "uploading" | "decoding" | "done" | "error";
		error?: string;
	}

	interface Props {
		songId: string;
		/** Stems the song already has, in-flight ones included. */
		stemCount: number;
		/** Progress of the current batch, for the parent to render where it likes. */
		jobs?: UploadJob[];
		/** Why a pick was refused (format, size, cap), or null. */
		notice?: string | null;
		/** Called once a batch finishes with at least one stem uploaded. */
		onuploaded?: () => void;
	}

	/**
	 * "Add New Stems": one button that opens the file picker and starts
	 * uploading on pick — reserve the row, send the bytes browser → Blob,
	 * decode locally and report peaks (see $lib/upload). Sequential keeps the
	 * progress readable and avoids saturating the uplink.
	 */
	let {
		songId,
		stemCount,
		jobs = $bindable([]),
		notice = $bindable(null),
		onuploaded,
	}: Props = $props();

	let busy = $state(false);
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
			notice = `Only ${room} more ${room === 1 ? "stem" : "stems"} fit in this song (${MAX_STEMS_PER_SONG} max).`;
			return;
		}
		notice = null;
		busy = true;
		jobs = picked.map((file) => ({ file, percent: 0, status: "queued" }));

		const ctx = new AudioContext({ sampleRate: 32_000 });
		let failed = 0;
		for (const job of jobs) {
			try {
				job.status = "uploading";
				await uploadStemFile(
					job.file,
					() =>
						postJson<Reservation>("/api/stems", {
							songId,
							filename: job.file.name,
							sizeBytes: job.file.size,
						}),
					{
						ctx,
						onProgress: (p) => (job.percent = p),
						onDecoding: () => (job.status = "decoding"),
					},
				);
				job.status = "done";
				job.percent = 100;
			} catch (err) {
				failed++;
				job.status = "error";
				job.error = (err as Error).message;
			}
		}
		await ctx.close();
		busy = false;
		if (failed === 0) jobs = [];
		await invalidateAll();
		if (failed < jobs.length || jobs.length === 0) onuploaded?.();
	}
</script>

<label
	class="button button-accent button-sm cursor-pointer {busy
		? 'pointer-events-none opacity-60'
		: ''}"
	title="Upload new stems to this song."
>
	<!-- WAV or FLAC is best; MP3 and AAC play fine but are lossy. {stemCount} of {MAX_STEMS_PER_SONG} stems -->
	<span class="i-ph-plus" aria-hidden="true"></span>
	{busy ? "Uploading…" : "Add Stems"}
	<input
		class="sr-only"
		type="file"
		accept={STEM_ACCEPT}
		multiple
		disabled={busy || room === 0}
		onchange={(e) => onpick(e.currentTarget)}
	/>
</label>
