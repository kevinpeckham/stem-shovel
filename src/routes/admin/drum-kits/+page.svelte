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
	The site's kits: what every visitor finds in the drum machine's Kit menu. Acoustic and Room are
	the built-in kits: replace any of their drums with a one-shot of your own and the built-in file
	stands in for every other; remove the replacement to go back. Below them, make a kit of your own,
	then give each of its twelve drums a file; a replacement takes over once it is up. Electronic is
	synthesized and has nothing to replace.
</p>
<div class="mt-6 max-w-2xl">
	<DrumKitManager accountId={null} kits={data.kits} onchange={() => invalidateAll()} />
</div>
