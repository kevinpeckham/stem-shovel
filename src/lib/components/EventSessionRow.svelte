<script lang="ts">
	import { SESSION_KIND_LABELS, type SessionKind } from "#lib/constants/sessionRecordings.js";
	import { plural } from "#lib/utils/plural.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";

	/**
	 * One session tied to an event (EventSessions): its name linking to its
	 * page, the kind, the day and the recording count (when known) under
	 * it, and for an editor Unlink.
	 */
	interface Props {
		session: {
			id: string;
			name: string;
			kind: SessionKind;
			place: string;
			startsOn: string;
			recordingCount?: number;
		};
		accountSlug: string;
		canEdit: boolean;
		busy: boolean;
		onunlink: () => void;
	}
	let { session: s, accountSlug, canEdit, busy, onunlink }: Props = $props();

	const name = $derived(sessionDisplayName(s));
	const details = $derived(
		[
			SESSION_KIND_LABELS[s.kind],
			dayText(s.startsOn),
			s.recordingCount === undefined ? "" : plural(s.recordingCount, "recording"),
		]
			.filter(Boolean)
			.join(" · "),
	);
</script>

<li class="surface flex items-center gap-3 px-3 py-2">
	<div class="grid min-w-0 flex-1 gap-0.5">
		<a class="link min-w-0 truncate text-14px" href="/{accountSlug}/sessions/s/{s.id}">{name}</a>
		<span class="text-12px text-dim">
			{details}
		</span>
	</div>
	{#if canEdit}
		<button
			class="button button-sm shrink-0"
			type="button"
			aria-label="Unlink {name}"
			title="Untie this session from the event (the session stays)"
			disabled={busy}
			onclick={onunlink}
		>
			Unlink
		</button>
	{/if}
</li>
