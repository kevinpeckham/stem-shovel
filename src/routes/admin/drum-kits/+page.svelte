<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import DrumKitManager from "$lib/components/DrumKitManager.svelte";
	import { pageTitle } from "$lib/utils/pageTitle";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Drum kits")}</title>
</svelte:head>

<h1 class="display">Drum kits</h1>
<p class="mt-2 max-w-prose opacity-90">
	The site's kits: what every visitor finds in the drum machine's Kit menu beside the built-in
	Acoustic, Electronic and Room. Make a kit, then give each of its twelve drums a one-shot; a
	replacement takes over once it is up. The built-in kits live in the code and are not listed here.
</p>
<div class="mt-6 max-w-2xl">
	<DrumKitManager accountId={null} kits={data.kits} onchange={() => invalidateAll()} />
</div>
