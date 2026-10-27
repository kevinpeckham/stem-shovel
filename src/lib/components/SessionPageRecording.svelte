<script lang="ts">
	import { SESSION_DEVICE_LABELS } from "#lib/constants/sessionRecordings.js";
	import type { SessionDevice } from "#lib/val/SessionRecordingSchema.js";
	import { saveAs } from "#lib/upload.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { recordingDownloadName } from "#lib/utils/recordingDownloadName.js";
	import { recordingInputText } from "#lib/utils/recordingInputText.js";
	import { dayText } from "#lib/utils/sessionName.js";

	/**
	 * One recording's row on a session's own page (src/routes/[account]/sessions/s/[session]):
	 * play or pause, the title linking to the recording's page, its day when
	 * past the session's first, input, length and size, the downloads and
	 * its notes.
	 */
	interface Props {
		recording: {
			id: string;
			title: string;
			filename: string;
			source: string;
			device: SessionDevice;
			recordedOn: string;
			notes: string;
			durationSeconds: number | null;
			sizeBytes: number;
			url: string;
			playbackUrl: string | null;
			playbackStatus: string | null;
		};
		/** The recording's own page. */
		href: string;
		/** The session's first day: a recording of another day says which. */
		startsOn: string;
		current: boolean;
		playing: boolean;
		ontoggle: () => void;
	}
	let { recording: r, href, startsOn, current, playing, ontoggle }: Props = $props();
	const inputText = $derived(recordingInputText(r.device, r.source));
	const mp3 = $derived(r.playbackStatus === "ready" ? r.playbackUrl : null);
	const downloadName = (ext?: string) =>
		recordingDownloadName(r.title, r.filename, ext, r.source, SESSION_DEVICE_LABELS[r.device]);
	const details = $derived(
		[
			r.recordedOn !== startsOn ? dayText(r.recordedOn) : "",
			inputText,
			r.durationSeconds ? formatTime(r.durationSeconds) : "",
			formatBytes(r.sizeBytes),
		]
			.filter(Boolean)
			.join(" · "),
	);
	const fileLabel = $derived(r.playbackUrl ? "Original" : "File");
</script>

<li class="grid gap-1 py-2 {current ? 'bg-white/5' : ''}">
	<div class="flex items-start gap-3">
		<button
			class="button button-sm shrink-0"
			type="button"
			aria-label="{playing ? 'Pause' : 'Play'} {r.title}"
			onclick={ontoggle}
		>
			<span class={playing ? "i-ph-pause-fill" : "i-ph-play-fill"} aria-hidden="true"></span>
		</button>
		<span class="min-w-0 flex-1">
			<a class="block truncate font-600 link" {href}>{r.title}</a>
			<span class="block text-14px text-dim">{details}</span>
			{#if r.notes}
				<span class="mt-1 block whitespace-pre-wrap text-14px opacity-85">{r.notes}</span>
			{/if}
		</span>
		<span class="flex shrink-0 flex-wrap justify-end gap-1">
			{#if mp3}
				<button
					class="button button-sm"
					type="button"
					title="Download the MP3"
					aria-label="Download {r.title} as MP3"
					onclick={() => saveAs(mp3, downloadName("mp3"))}
				>
					<span class="i-ph-download-simple" aria-hidden="true"></span> MP3
				</button>
			{/if}
			<button
				class="button button-sm"
				type="button"
				title={r.filename}
				aria-label="Download {r.title}, the {fileLabel.toLowerCase()}"
				onclick={() => saveAs(r.url, downloadName())}
			>
				<span class="i-ph-file-audio" aria-hidden="true"></span>
				{fileLabel}
			</button>
		</span>
	</div>
</li>
