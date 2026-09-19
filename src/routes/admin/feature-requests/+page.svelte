<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import ReportList from "$lib/components/ReportList.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Feature requests · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">Feature requests</h1>
	<p class="mt-1 mb-4 text-sm opacity-90">
		What signed-in users asked for on the Feature Requests page, newest first, open ones before
		closed. Mark complete emails the requester when they offered an address for that.
	</p>
	<ReportList items={data.reports} kind="feature" />
</section>
