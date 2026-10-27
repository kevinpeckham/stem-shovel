<script lang="ts">
	import DashboardAccount from "#lib/components/DashboardAccount.svelte";
	import DashboardIdeas from "#lib/components/DashboardIdeas.svelte";
	import DashboardNew from "#lib/components/DashboardNew.svelte";
	import DashboardStart from "#lib/components/DashboardStart.svelte";
	import DashboardWidget from "#lib/components/DashboardWidget.svelte";
	import { DASHBOARD_INSTRUMENTS, DASHBOARD_MORE } from "#lib/constants/dashboardLinks.js";
	import { dashboardTools } from "#lib/utils/dashboardTools.js";
	import { onboardingSteps, showOnboarding } from "#lib/utils/onboardingSteps.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	let { data } = $props();

	/** Each account with its checklist, shown in place of its lists while it holds nothing. */
	let accounts = $derived(
		data.accounts.map((a) => {
			const counts = { ...a.counts, ideas: data.ideas.length + data.loops.length };
			const steps = onboardingSteps(counts, a.slug);
			return { ...a, steps, onboarding: showOnboarding(steps, counts) };
		}),
	);
	/** The Session Recorder goes to the current account (the root layout's), when there is one. */
	let tools = $derived(dashboardTools(accounts.length > 0 ? data.currentSlug : null));
</script>

<svelte:head>
	<title>{pageTitle("Dashboard")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<h1 class="app-page-heading">Dashboard</h1>

	<div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
		<div class="grid min-w-0 gap-8">
			{#if accounts.length === 0}
				<DashboardStart />
			{:else}
				{#each accounts as account (account.slug)}
					<DashboardAccount {account} />
				{/each}
			{/if}
			<DashboardIdeas
				id="dashboard-ideas"
				heading="Your ideas"
				ideas={data.ideas}
				href={() => "/idea-recorder"}
				empty="No ideas yet."
				action={{ label: "Record an idea", href: "/idea-recorder" }}
				all={{ label: "All ideas", href: "/idea-recorder" }}
				search="Search ideas"
			/>
			<DashboardIdeas
				id="dashboard-loops"
				heading="Your loops"
				ideas={data.loops}
				href={() => "/looper"}
				empty="No loops yet."
				action={{ label: "Record a loop", href: "/looper" }}
				all={{ label: "All loops", href: "/looper" }}
				search="Search loops"
			/>
			<DashboardIdeas
				id="dashboard-multitracks"
				heading="Your multitrack recordings"
				ideas={data.multitracks}
				href={(id) => `/multitrack-recorder?song=${encodeURIComponent(id)}`}
				empty="No multitrack recordings yet."
				action={{ label: "Record a multitrack", href: "/multitrack-recorder" }}
				all={{ label: "All multitracks", href: "/multitrack-recorder" }}
				search="Search multitracks"
			/>
		</div>

		<aside aria-label="Dashboard sidebar" class="grid gap-6">
			<DashboardNew digest={data.digest} />
			<DashboardWidget heading="Tools" items={tools} />
			<DashboardWidget heading="Instruments" items={DASHBOARD_INSTRUMENTS} />
			<DashboardWidget heading="More" items={DASHBOARD_MORE} />
		</aside>
	</div>
</main>
