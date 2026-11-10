<script lang="ts">
	import type { DashboardEntry } from "#lib/constants/dashboardLinks.js";

	/** A dashboard row's pin toggle: pins the entry to the person's dashboard, or unpins it. */
	interface Props {
		idea: DashboardEntry;
		pinned: boolean;
		onpin: (idea: DashboardEntry, pinned: boolean) => void;
	}
	let { idea, pinned, onpin }: Props = $props();
</script>

<button
	type="button"
	class="button button-xs px-1.5 {pinned ? 'text-accent' : ''}"
	aria-pressed={pinned}
	aria-label="{pinned ? 'Unpin' : 'Pin'} {idea.title || 'Untitled'}"
	title={pinned ? "Unpin from your dashboard" : "Pin to your dashboard"}
	onclick={() => onpin(idea, !pinned)}
>
	<span class={pinned ? "i-ph-push-pin-fill" : "i-ph-push-pin"} aria-hidden="true"></span>
</button>
