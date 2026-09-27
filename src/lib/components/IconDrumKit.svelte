<script lang="ts">
	/** Kevin's drum-kit glyph (from Hugeicons), the drum machine's icon wherever it appears; sized by the font like a Phosphor icon. */
	interface Props {
		class?: string;
	}
	let { class: className = "" }: Props = $props();
</script>

<!-- source hugeicons -->
<svg
	xmlns="http://www.w3.org/2000/svg"
	width="14"
	height="14"
	viewBox="0 0 24 24"
	class="w-1em h-1em aspect-square {className}"
>
	<path d="M0 0h24v24H0z" fill="none" />
	<g
		fill="none"
		stroke="currentColor"
		stroke-linecap="round"
		stroke-linejoin="round"
		stroke-width="1.5"
	>
		<path
			d="M14 4.124A16 16 0 0 0 12 4C7.03 4 3 6.239 3 9s4.03 5 9 5s9-2.239 9-5a2.9 2.9 0 0 0-.18-1"
		/>
		<path d="M21 9v7c0 2.761-4.03 5-9 5s-9-2.239-9-5V9m5 5v6m8-6v6M12 9.5L21 3" />
	</g>
</svg>
