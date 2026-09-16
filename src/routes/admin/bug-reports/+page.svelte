<script lang="ts">
	import ReportList from "$lib/components/ReportList.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>Bug reports · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Bug reports</h1>
	<p class="mt-1 mb-4 text-sm opacity-90">
		What signed-in users sent from the footer's Report a bug, newest first, open ones before closed.
	</p>
	<ReportList items={data.reports} />
</section>
