<script lang="ts">
	import ReportList from "$lib/components/ReportList.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>Feature requests · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Feature requests</h1>
	<p class="mt-1 mb-4 text-sm opacity-90">
		What signed-in users asked for from the footer's Request a feature, newest first, open ones
		before closed.
	</p>
	<ReportList items={data.reports} />
</section>
