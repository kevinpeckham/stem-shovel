<script lang="ts">
	import "@unocss/reset/tailwind.css";
	import "virtual:uno.css";

	let { children } = $props();
</script>

<div class="min-h-screen bg-panel text-ink antialiased">
	{@render children()}
</div>
