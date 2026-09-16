<script lang="ts">
	import "uno.css";
	import GlobalFooter from "$lib/components/GlobalFooter.svelte";
	import GlobalNav from "$lib/components/GlobalNav.svelte";
	import Notifications from "$lib/components/Notifications.svelte";
	import { ROBOTS_NOINDEX } from "$lib/constants/securityHeaders";
	import { page } from "$app/state";

	let { children, data } = $props();
</script>

<svelte:head>
	<!-- Only the front page is indexable; the response header says the same. -->
	{#if page.url.pathname !== "/"}
		<meta name="robots" content={ROBOTS_NOINDEX} />
	{/if}
</svelte:head>

<GlobalNav user={data.user} memberships={data.memberships} currentSlug={data.currentSlug} />
<div class="min-w-0">
	{@render children()}
</div>
<GlobalFooter user={data.user} />
<Notifications />
