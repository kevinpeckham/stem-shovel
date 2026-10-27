<script lang="ts">
	import { DASHBOARD_FREE_TOOLS } from "#lib/constants/dashboardLinks.js";
	import DashboardLinks from "./DashboardLinks.svelte";
</script>

<!-- No account yet: the dashboard's first tier (docs/dashboard-plan.md). -->
<section class="surface max-w-article grid gap-4 p-5" aria-label="Start your band">
	<h2 class="heading-2 mb-0">Start your band</h2>
	<p class="opacity-90">Create an account for your band, or ask a bandmate for an invite.</p>
	<p><a class="button-accent button-sm" href="/accounts">Create an account</a></p>
	<div class="grid gap-2">
		<p class="text-14px text-dim opacity-80">Or try the free tools:</p>
		<DashboardLinks links={DASHBOARD_FREE_TOOLS} label="Free tools" />
	</div>
</section>
