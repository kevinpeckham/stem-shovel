<script lang="ts">
	import { beforeNavigate } from "$app/navigation";
	import { updated } from "$app/state";
	import "uno.css";
	import GlobalFooter from "$lib/components/GlobalFooter.svelte";
	import GlobalNav from "$lib/components/GlobalNav.svelte";
	import Notifications from "$lib/components/Notifications.svelte";
	import { ROBOTS_NOINDEX } from "$lib/constants/securityHeaders";
	import { isIndexablePath } from "$lib/utils/isIndexablePath";
	import { page } from "$app/state";

	let { children, data } = $props();

	// After a deploy the previous build's assets are gone: once a new version is
	// seen (kit.version.pollInterval), the next navigation loads the page afresh
	// instead of fetching chunks and stylesheets that no longer exist.
	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url) location.href = to.url.href;
	});
</script>

<svelte:head>
	<!-- Only production's front page, docs and Releases page are indexable; the response header says the same. -->
	{#if !isIndexablePath(page.url.pathname) || !data.indexable}
		<meta name="robots" content={ROBOTS_NOINDEX} />
	{/if}
</svelte:head>

<GlobalNav
	user={data.user}
	memberships={data.memberships}
	currentSlug={data.currentSlug}
	unread={data.unread}
/>
<div class="min-w-0">
	{@render children()}
</div>
<GlobalFooter user={data.user} />
<Notifications />
