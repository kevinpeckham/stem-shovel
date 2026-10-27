<script lang="ts">
	import DashboardAccount from "#lib/components/DashboardAccount.svelte";
	import DashboardIdeas from "#lib/components/DashboardIdeas.svelte";
	import DashboardLinks from "#lib/components/DashboardLinks.svelte";
	import DashboardNew from "#lib/components/DashboardNew.svelte";
	import DashboardStart from "#lib/components/DashboardStart.svelte";
	import { DASHBOARD_TOOLS } from "#lib/constants/dashboardLinks.js";
	import { accountActions } from "#lib/utils/accountActions.js";
	import { onboardingSteps, showOnboarding } from "#lib/utils/onboardingSteps.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	let { data } = $props();

	let several = $derived(data.accounts.length > 1);
	/** Each account with its checklist, shown in place of its sections while it holds nothing. */
	let accounts = $derived(
		data.accounts.map((a) => {
			const counts = { ...a.counts, ideas: data.ideas.length };
			const steps = onboardingSteps(counts, a.slug);
			return { ...a, steps, onboarding: showOnboarding(steps, counts) };
		}),
	);
	/** One account: its actions and the tools in one row; several: the tools here, each account's actions in its section. */
	let quickActions = $derived(
		several ? DASHBOARD_TOOLS : [...accountActions(accounts[0]?.slug ?? ""), ...DASHBOARD_TOOLS],
	);
</script>

<svelte:head>
	<title>{pageTitle("Dashboard")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<h1 class="app-page-heading">Dashboard</h1>

	{#if accounts.length === 0}
		<DashboardStart />
	{:else}
		<DashboardNew digest={data.digest} />
		<section class="max-w-article grid gap-3" aria-labelledby="dashboard-actions">
			<h2 class="heading-2 mb-0" id="dashboard-actions">Quick actions</h2>
			<DashboardLinks links={quickActions} label="Quick actions" />
		</section>
		{#each accounts as account (account.slug)}
			<DashboardAccount {account} {several} />
		{/each}
	{/if}

	{#if data.ideas.length > 0}
		<DashboardIdeas ideas={data.ideas} />
	{/if}
</main>
