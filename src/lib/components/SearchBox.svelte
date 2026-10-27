<script lang="ts">
	/** A small search field with a magnifying glass inside it (the dashboard's lists, the Songs and Sessions tables). */
	interface Props {
		value: string;
		label: string;
		placeholder?: string;
	}
	let { value = $bindable(), label, placeholder = "Search by title" }: Props = $props();
</script>

<label class="relative w-full sm-w-72">
	<span
		class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
		aria-hidden="true"
	></span>
	<input
		class="field w-full py-1 pl-7 text-13px"
		type="search"
		{placeholder}
		aria-label={label}
		bind:value
	/>
</label>
