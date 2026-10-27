<script lang="ts">
	import DashboardAccount from "#lib/components/DashboardAccount.svelte";
	import DashboardConversations from "#lib/components/DashboardConversations.svelte";
	import DashboardIdeas from "#lib/components/DashboardIdeas.svelte";
	import DashboardNew from "#lib/components/DashboardNew.svelte";
	import DashboardPending from "#lib/components/DashboardPending.svelte";
	import DashboardStart from "#lib/components/DashboardStart.svelte";
	import DashboardWidget from "#lib/components/DashboardWidget.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
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
	/** The Session Recorder, Account settings and the sections' calls to action go to the current account (the root layout's), when there is one. */
	let current = $derived(accounts.length > 0 ? data.currentSlug : null);
	/** A path inside the current account, or the accounts page when there is none to go to. */
	const at = (path: string) => (current ? `/${current}${path}` : "/accounts");
	let tools = $derived(dashboardTools(current));
	let more = $derived(dashboardMore(current));
</script>

<svelte:head>
	<title>{pageTitle("User Dashboard")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<h1 class="app-page-heading">User Dashboard</h1>

	<!-- Three grid children: Latest, the content, the widgets. One column on a phone in that order, so what is new comes first; from lg the content takes the left column over two rows and Latest sits above the widgets on the right. The rows are auto then 1fr: the content's height goes to the second row alone, so the widgets sit right under Latest instead of halfway down (the spanning column would otherwise be shared into both rows). -->
	<div
		class="grid gap-8 lg-gap-x-12 xl-gap-x-16 2xl-gap-x-20 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:gap-y-6 lg:items-start"
	>
		<aside aria-label="Latest" class="grid gap-6 lg:col-start-2 lg:row-start-1">
			<DashboardNew digest={data.digest} />
			<DashboardConversations chats={data.chats} comments={data.comments} />
			<DashboardPending items={data.pending} />
		</aside>
		<div class="grid min-w-0 gap-8 lg:col-start-1 lg:row-start-1 lg:row-span-2">
			{#if accounts.length === 0}
				<DashboardStart />
			{:else}
				<section class="grid gap-3" aria-labelledby="dashboard-accounts">
					<h2 class="marketing-topic-heading mb-0 flex items-center gap-2" id="dashboard-accounts">
						Your Accounts
						<InfoTip
							text="An account is a band or a group with its own projects, songs, sessions and members. You can belong to several, and the tile shows your role in each."
							label="About Your Accounts"
							class="text-16px"
						/>
					</h2>
					<div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{#each accounts as account (account.slug)}
							<DashboardAccount {account} />
						{/each}
					</div>
				</section>
				<DashboardIdeas
					id="dashboard-activity"
					heading="Activity"
					accounts={data.accounts}
					tip="What happened in your accounts over the last seven days: stems, demos, mixes and recordings added, charts and lyrics edited, chat messages and comments posted, songs and projects created."
					ideas={data.activity}
					empty="Nothing in the last seven days."
					search="Search activity"
				/>
				<DashboardIdeas
					id="dashboard-projects"
					heading="Your Projects"
					accounts={data.accounts}
					tip="A project is a collection of songs: an album, a set, or a batch of works in progress. Every song lives in one project."
					ideas={data.projects}
					empty="No projects yet."
					action={{ label: "Create a project", href: at("/projects") }}
					all={{ label: "All projects", href: "/projects" }}
					search="Search projects"
				/>
				<DashboardIdeas
					id="dashboard-songs"
					heading="Your Songs"
					accounts={data.accounts}
					tip="A song holds its stems (the separate tracks), demos, lyrics, charts and notes, and moves through the writing, arranging, mixing and finished stages."
					ideas={data.songs}
					empty="No songs yet."
					action={{ label: "Your projects", href: at("/projects") }}
					all={{ label: "All songs", href: "/songs" }}
					search="Search songs"
				/>
				<DashboardIdeas
					id="dashboard-sessions"
					heading="Your Sessions"
					accounts={data.accounts}
					tip="Sessions are live recordings of shows or practices, captured with the Session Recorder."
					ideas={data.sessions}
					empty="No sessions yet."
					action={{ label: "Record a session", href: at("/sessions/record") }}
					all={{ label: "All sessions", href: "/sessions" }}
					search="Search sessions"
				/>
			{/if}
			<DashboardIdeas
				id="dashboard-ideas"
				heading="Your Ideas"
				tip="Ideas are quick recordings from the Lark Idea Recorder: a riff, a melody or a verse caught before it is a song. They are yours, not an account's."
				ideas={data.ideas}
				empty="No ideas yet."
				action={{ label: "Record an idea", href: "/idea-recorder" }}
				all={{ label: "All ideas", href: "/idea-recorder" }}
				search="Search ideas"
			/>
			<DashboardIdeas
				id="dashboard-multitracks"
				heading="Your Multitrack Recordings"
				tip="Multitrack recordings are made in the Dawn Multitrack Studio, each instrument on its own track, ready to mix."
				ideas={data.multitracks}
				empty="No multitrack recordings yet."
				action={{ label: "Record a multitrack", href: "/multitrack-recorder" }}
				all={{ label: "All multitracks", href: "/multitrack-recorder" }}
				search="Search multitracks"
			/>
			<DashboardIdeas
				id="dashboard-loops"
				heading="Your Loops"
				tip="Loops are recordings from the Whirl Looper: layers played over a repeating stretch of bars."
				ideas={data.loops}
				empty="No loops yet."
				action={{ label: "Record a loop", href: "/looper" }}
				all={{ label: "All loops", href: "/looper" }}
				search="Search loops"
			/>
		</div>

		<aside aria-label="Dashboard sidebar" class="grid gap-6 lg:col-start-2 lg:row-start-2">
			<DashboardWidget heading="Tools" items={tools} />
			<DashboardWidget heading="Instruments" items={DASHBOARD_INSTRUMENTS} />
			<DashboardWidget heading="More" items={more} />
		</aside>
	</div>
</main>
