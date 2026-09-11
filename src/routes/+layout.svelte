<script lang="ts">
	import "uno.css";
	import "$lib/styles/chart.css";
	import GlobalFooter from "$lib/components/GlobalFooter.svelte";
	import GlobalNav from "$lib/components/GlobalNav.svelte";

	let { children, data } = $props();
</script>

<GlobalNav account={data.account} />
<div class="min-w-0">
	{@render children()}
</div>
<GlobalFooter />
