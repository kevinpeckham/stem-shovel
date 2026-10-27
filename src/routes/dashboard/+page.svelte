<script lang="ts">
	import DashboardAccount from "#lib/components/DashboardAccount.svelte";
	import DashboardIdeas from "#lib/components/DashboardIdeas.svelte";
	import DashboardNew from "#lib/components/DashboardNew.svelte";
	import DashboardStart from "#lib/components/DashboardStart.svelte";
	import DashboardWidget from "#lib/components/DashboardWidget.svelte";
	import { DASHBOARD_INSTRUMENTS } from "#lib/constants/dashboardLinks.js";
	import { dashboardMore } from "#lib/utils/dashboardMore.js";
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
	/** The Session Recorder and Account settings go to the current account (the root layout's), when there is one. */
	let current = $derived(accounts.length > 0 ? data.currentSlug : null);
	let tools = $derived(dashboardTools(current));
	let more = $derived(dashboardMore(current));
</script>

<svelte:head>
	<title>{pageTitle("User Dashboard")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<h1 class="app-page-heading">User Dashboard</h1>

	<div
		class="grid gap-8 lg-gap-12 xl-gap-16 2xl-gap-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start"
	>
		<div class="grid min-w-0 gap-8">
			{#if accounts.length === 0}
				<DashboardStart />
			{:else}
				<section class="grid gap-3" aria-labelledby="dashboard-accounts">
					<h2 class="marketing-topic-heading mb-0" id="dashboard-accounts">Your Accounts</h2>
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{#each accounts as account (account.slug)}
							<DashboardAccount {account} />
						{/each}
					</div>
				</section>
				<DashboardIdeas
					id="dashboard-projects"
					heading="Your Projects"
					ideas={data.projects}
					empty="No projects yet."
					action={{ label: "Create a project", href: `/${data.currentSlug}/projects` }}
					all={{ label: "All projects", href: "/projects" }}
					search="Search projects"
				/>
				<DashboardIdeas
					id="dashboard-songs"
					heading="Your Songs"
					ideas={data.songs}
					empty="No songs yet."
					action={{ label: "Your projects", href: `/${data.currentSlug}/projects` }}
					all={{ label: "All songs", href: "/songs" }}
					search="Search songs"
				/>
				<DashboardIdeas
					id="dashboard-sessions"
					heading="Your Sessions"
					ideas={data.sessions}
					empty="No sessions yet."
					action={{ label: "Record a session", href: `/${data.currentSlug}/sessions/record` }}
					all={{ label: "All sessions", href: "/sessions" }}
					search="Search sessions"
				/>
			{/if}
			<DashboardIdeas
				id="dashboard-ideas"
				heading="Your Ideas"
				ideas={data.ideas}
				empty="No ideas yet."
				action={{ label: "Record an idea", href: "/idea-recorder" }}
				all={{ label: "All ideas", href: "/idea-recorder" }}
				search="Search ideas"
			/>
			<DashboardIdeas
				id="dashboard-multitracks"
				heading="Your Multitrack Recordings"
				ideas={data.multitracks}
				empty="No multitrack recordings yet."
				action={{ label: "Record a multitrack", href: "/multitrack-recorder" }}
				all={{ label: "All multitracks", href: "/multitrack-recorder" }}
				search="Search multitracks"
			/>
			<DashboardIdeas
				id="dashboard-loops"
				heading="Your Loops"
				ideas={data.loops}
				empty="No loops yet."
				action={{ label: "Record a loop", href: "/looper" }}
				all={{ label: "All loops", href: "/looper" }}
				search="Search loops"
			/>
		</div>

		<aside aria-label="Dashboard sidebar" class="grid gap-6">
			<DashboardNew digest={data.digest} />
			<DashboardWidget heading="Tools" items={tools} />
			<DashboardWidget heading="Instruments" items={DASHBOARD_INSTRUMENTS} />
			<DashboardWidget heading="More" items={more} />
		</aside>
	</div>
</main>
