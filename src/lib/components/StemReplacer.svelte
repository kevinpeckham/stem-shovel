<script lang="ts">
	import {
		analyse,
		combineFeatures,
		extractFeatures,
		type Detection,
		type Features,
	} from "$lib/audio/analysis";
	import { invalidateAll } from "$app/navigation";
	import { removeStems } from "$lib/remote/songs.remote";
	import type { UploadJob } from "$lib/components/StemUploader.svelte";
	import { formatBytes } from "$lib/utils/formatBytes";
	import {
		MAX_STEMS_PER_SONG,
		STEM_ACCEPT,
		STEM_FORMAT_LIST,
		STEM_MAX_BYTES,
	} from "$lib/constants/stemFormats";
	import { stemContentType } from "$lib/utils/stemContentType";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { postJson, type Reservation, uploadStemFile } from "$lib/upload";

	/**
	 * "Replace Stems": pick the new set of files for a song. Each file is
	 * matched to an existing stem by filename, else by the stem's name; a
	 * match replaces that stem in place (same row, name, order and MIDI, a
	 * new file), an unmatched file becomes a new stem, and existing stems
	 * with no file in the pick are removed — after one confirmation that
	 * spells all three out. Progress goes through the same `jobs` list as
	 * Add Stems.
	 */
	interface Props {
		songId: string;
		stems: { id: string; label: string; filename: string }[];
		jobs?: UploadJob[];
		notice?: string | null;
		onuploaded?: () => void;
		onanalysis?: (detection: Detection) => void;
	}
	let {
		songId,
		stems,
		jobs = $bindable([]),
		notice = $bindable(null),
		onuploaded,
		onanalysis,
	}: Props = $props();
	let busy = $state(false);

	const stemOf = (name: string) =>
		name
			.replace(/\.[^.]+$/, "")
			.trim()
			.toLowerCase();

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
		if (picked.length > MAX_STEMS_PER_SONG) {
			notice = `A song holds ${MAX_STEMS_PER_SONG} stems at most.`;
			return;
		}
		// Match: exact filename first, then the stem's name against the file's name without its extension.
		const byFilename = new Map(stems.map((s) => [s.filename.toLowerCase(), s]));
		const byLabel = new Map(stems.map((s) => [s.label.trim().toLowerCase(), s]));
		const taken = new Set<string>();
		const plan = picked.map((file) => {
			const match = byFilename.get(file.name.toLowerCase()) ?? byLabel.get(stemOf(file.name));
			const stem = match && !taken.has(match.id) ? match : null;
			if (stem) taken.add(stem.id);
			return { file, stem };
		});
		const removed = stems.filter((s) => !taken.has(s.id));
		const replaced = plan.filter((p) => p.stem);
		const added = plan.filter((p) => !p.stem);
		const lines = [
			replaced.length
				? `Replace ${replaced.length}: ${replaced.map((p) => p.stem?.label).join(", ")}`
				: "",
			added.length ? `Add ${added.length}: ${added.map((p) => p.file.name).join(", ")}` : "",
			removed.length
				? `Remove ${removed.length} (no new file): ${removed.map((s) => s.label).join(", ")}`
				: "",
		].filter(Boolean);
		if (!confirm(`Replace the stems of this song?\n\n${lines.join("\n")}`)) return;

		notice = null;
		busy = true;
		jobs = plan.map(({ file }) => ({ file, percent: 0, status: "queued" }));
		const ctx = new AudioContext({ sampleRate: 32_000 });
		let failed = 0;
		const features: Features[] = [];
		for (const [i, job] of jobs.entries()) {
			const target = plan[i].stem;
			try {
				job.status = "uploading";
				await uploadStemFile(
					job.file,
					() =>
						target
							? postJson<Reservation>(`/api/stems/${target.id}/replace`, {
									filename: job.file.name,
									sizeBytes: job.file.size,
								})
							: postJson<Reservation>("/api/stems", {
									songId,
									filename: job.file.name,
									sizeBytes: job.file.size,
								}),
					{
						ctx,
						onProgress: (p) => (job.percent = p),
						onDecoding: () => (job.status = "decoding"),
						onDecoded: (buffer) => {
							if (onanalysis) features.push(extractFeatures(buffer));
						},
					},
				);
				job.status = "done";
				job.percent = 100;
			} catch (err) {
				failed++;
				job.status = "error";
				job.error = errorMessage(err);
			}
		}
		await ctx.close();
		// Only once every upload landed: a failed batch keeps the old stems in place.
		if (failed === 0 && removed.length > 0) {
			try {
				await removeStems({ ids: removed.map((s) => s.id) });
			} catch (err) {
				notice = `The new stems are in, but removing the old ones failed: ${errorMessage(err)}`;
			}
		}
		busy = false;
		const combined = combineFeatures(features);
		if (combined && onanalysis) onanalysis(analyse(combined));
		if (failed === 0) jobs = [];
		await invalidateAll();
		if (failed < plan.length) onuploaded?.();
	}
</script>

<label
	class="button button-sm lg-button-xs cursor-pointer {busy
		? 'pointer-events-none opacity-60'
		: ''}"
	title="Pick the song's new set of stems: same names replace, new names are added, the rest are removed."
>
	<span class="i-ph-arrows-clockwise" aria-hidden="true"></span>
	{busy ? "Replacing…" : "Replace Stems"}
	<input
		class="sr-only"
		type="file"
		accept={STEM_ACCEPT}
		multiple
		disabled={busy}
		onchange={(e) => onpick(e.currentTarget)}
	/>
</label>
