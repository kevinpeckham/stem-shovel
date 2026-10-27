<script lang="ts">
	import { SESSION_KIND_LABELS, type SessionKind } from "#lib/constants/sessionRecordings.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";

	/** The account's newest session on the dashboard, or a pointer to the Sessions page when it has none. */
	interface Props {
		slug: string;
		session: {
			id: string;
			name: string;
			place: string;
			kind: SessionKind;
			startsOn: string;
			recordingCount: number;
			newestRecording: string | null;
		} | null;
	}
	let { slug, session }: Props = $props();
</script>

<div class="grid gap-3">
	<h3 class="heading-3 mb-0">Latest session</h3>
	{#if session}
		<div class="surface grid gap-1 p-5">
			<p class="font-600 text-white">{sessionDisplayName(session)}</p>
			<p class="text-14px text-dim opacity-80">
				{SESSION_KIND_LABELS[session.kind]} · {dayText(session.startsOn)} · {session.recordingCount}
				{session.recordingCount === 1 ? "recording" : "recordings"}
			</p>
			{#if session.newestRecording}
				<p class="text-14px opacity-90">Newest: {session.newestRecording}</p>
			{/if}
			<p class="mt-2 flex flex-wrap gap-4 text-14px">
				<a class="link" href="/{slug}/sessions/s/{session.id}">Open</a>
				<a class="link-dim" href="/{slug}/sessions">All sessions</a>
			</p>
		</div>
	{:else}
		<p class="text-14px text-dim opacity-80">
			No sessions yet. <a class="link" href="/{slug}/sessions">Add a recording</a>
		</p>
	{/if}
</div>
