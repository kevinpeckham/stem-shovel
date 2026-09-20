<script lang="ts">
	/**
	 * The "midi" chip beside a stem name. With `onclick` it is a toggle for the
	 * piano-roll view of the row; `active` shows which view is on.
	 */
	interface Props {
		active?: boolean;
		onclick?: () => void;
		label?: string;
	}

	let { active = false, onclick, label = "MIDI" }: Props = $props();
</script>

{#if onclick}
	<button
		type="button"
		class="shrink-0 cursor-pointer rounded border px-1 text-9px font-600 uppercase tracking-wider transition-colors {active
			? 'border-accent bg-accent text-oxford'
			: 'border-current/20 opacity-80 hover-text-accent hover-opacity-100'}"
		title={active
			? "Showing MIDI notes — click for the waveform"
			: "MIDI available — click to see the notes"}
		aria-pressed={active}
		{onclick}
	>
		{label}
	</button>
{:else}
	<span
		class="shrink-0 rounded border border-current/20 px-1 text-9px font-600 uppercase tracking-wider opacity-80"
		title="MIDI available"
	>
		{label}
	</span>
{/if}
