<script lang="ts">
	import type { SortDir } from "#lib/utils/sortRows.js";

	/**
	 * A sortable table's column header: a button that sorts by the column
	 * (again to flip the direction), a caret showing the direction on the
	 * column sorted by, and `aria-sort` for screen readers.
	 */
	interface Props {
		label: string;
		/** The direction when the table is sorted by this column, else null. */
		dir: SortDir | null;
		onsort: () => void;
		class?: string;
	}
	let { label, dir, onsort, class: cls = "" }: Props = $props();

	let ariaSort: "ascending" | "descending" | "none" = $derived(
		dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none",
	);
	let icon = $derived(
		dir === "asc" ? "i-ph-caret-up" : dir === "desc" ? "i-ph-caret-down" : "i-ph-caret-up-down",
	);
</script>

<th scope="col" aria-sort={ariaSort} class="px-3 py-2 text-left font-600 {cls}">
	<button
		type="button"
		class="inline-flex items-center gap-1 text-nowrap hover-text-accent {dir ? '' : 'opacity-80'}"
		onclick={onsort}
	>
		{label}
		<span class="{icon} text-12px {dir ? '' : 'opacity-50'}" aria-hidden="true"></span>
	</button>
</th>
