<script lang="ts">
	import "uno.css";
	import GlobalFooter from "$lib/components/GlobalFooter.svelte";
	import GlobalNav from "$lib/components/GlobalNav.svelte";
	import Notifications from "$lib/components/Notifications.svelte";

	let { children, data } = $props();
</script>

<GlobalNav user={data.user} memberships={data.memberships} />
<div class="min-w-0">
	{@render children()}
</div>
<GlobalFooter />
<Notifications />
