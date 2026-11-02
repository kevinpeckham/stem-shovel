<script lang="ts">
	/** Notes | Chart: which of an idea's documents its panel shows (the song page's document tabs, two of them). */
	interface Props {
		doc: "notes" | "chart";
	}
	let { doc = $bindable() }: Props = $props();

	const TABS = [
		["notes", "Notes"],
		["chart", "Chart"],
	] as const;
</script>

<div
	class="flex overflow-hidden rounded border border-white/15 items-center"
	role="tablist"
	aria-label="The idea's documents"
>
	{#each TABS as [value, label], index (value)}
		<button
			type="button"
			role="tab"
			aria-selected={doc === value}
			class="button button-xs {doc === value
				? 'bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
				: 'opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
				? 'rounded-r-none border-r-none'
				: 'rounded-l-none'}"
			onclick={() => (doc = value)}>{label}</button
		>
	{/each}
</div>
