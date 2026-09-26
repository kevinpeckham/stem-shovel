<script lang="ts">
	/** Kevin's tuning-fork glyph, the tuner's icon wherever it appears; sized by the font like a Phosphor icon. */
	interface Props {
		class?: string;
	}
	let { class: className = "" }: Props = $props();
</script>

<svg
	xmlns="http://www.w3.org/2000/svg"
	width="14"
	height="14"
	viewBox="0 0 500 500"
	class="w-1em h-1em aspect-square {className}"
	aria-hidden="true"
	><path
		d="M103.383 364.263l32.353 32.353-74.633 74.633c-5.78 5.78-14.204 8.037-22.098 5.921s-14.061-8.281-16.177-16.177.142-16.318 5.921-22.098l74.633-74.633zM337.195 28.748c5.78-5.78 14.202-8.037 22.098-5.921a22.88 22.88 0 0 1 10.255 38.275L234.694 195.881a49.06 49.06 0 0 0 22.035 82.061 49.06 49.06 0 0 0 47.379-12.721l134.779-134.779c4.277-4.289 10.085-6.697 16.141-6.697s11.862 2.409 16.139 6.697a22.78 22.78 0 0 1 6.735 16.173 22.8 22.8 0 0 1-6.735 16.177L336.534 297.571c-14.972 14.966-34.514 24.499-55.525 27.083a94.93 94.93 0 0 1-60.433-12.819l-74.925 74.854-32.353-32.353 74.854-74.925c-10.856-18.138-15.347-39.378-12.764-60.354a94.93 94.93 0 0 1 27.028-55.454z"
		fill="currentColor"
		fill-rule="evenodd"
	/></svg
>
