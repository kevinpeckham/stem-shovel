<script lang="ts">
	import { SESSION_DEVICE_OPTIONS } from "#lib/constants/sessionRecordings.js";
	import type { SessionDevice } from "#lib/val/SessionRecordingSchema.js";

	/** The "Input device" select of a session recording: unset ("—") or one of the device kinds. */
	let {
		value = $bindable(""),
		title,
		class: labelClass = "grid gap-1 text-13px text-dim",
	}: {
		value?: SessionDevice;
		title?: string;
		/** Classes for the wrapping label. */
		class?: string;
	} = $props();
</script>

<label class={labelClass}>
	Input device
	<select class="field" {title} bind:value>
		<option value="">—</option>
		{#each SESSION_DEVICE_OPTIONS as o (o.value)}
			<option value={o.value}>{o.label}</option>
		{/each}
	</select>
</label>
