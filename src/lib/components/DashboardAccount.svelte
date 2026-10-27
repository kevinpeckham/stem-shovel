<script lang="ts">
	import type { ComponentProps } from "svelte";
	import { accountActions } from "#lib/utils/accountActions.js";
	import type { OnboardingStep } from "#lib/utils/onboardingSteps.js";
	import DashboardChecklist from "./DashboardChecklist.svelte";
	import DashboardLinks from "./DashboardLinks.svelte";
	import DashboardProjects from "./DashboardProjects.svelte";
	import DashboardSession from "./DashboardSession.svelte";
	import DashboardSongs from "./DashboardSongs.svelte";

	/**
	 * One account on the dashboard: its name and quick actions when the
	 * person has several, then the checklist while it holds nothing, or its
	 * latest session, recent projects and recent songs.
	 */
	interface Props {
		account: {
			slug: string;
			name: string;
			latestSession: ComponentProps<typeof DashboardSession>["session"];
			projects: ComponentProps<typeof DashboardProjects>["projects"];
			songs: ComponentProps<typeof DashboardSongs>["songs"];
			steps: OnboardingStep[];
			onboarding: boolean;
		};
		several: boolean;
	}
	let { account, several }: Props = $props();
</script>

<section
	class="max-w-article grid gap-6"
	aria-label={account.name}
	data-dashboard-account={account.slug}
>
	{#if several}
		<div class="grid gap-3">
			<h2 class="heading-2 mb-0">
				<a class="hover:text-accent" href="/{account.slug}/projects">{account.name}</a>
			</h2>
			<DashboardLinks
				links={accountActions(account.slug)}
				label="Quick actions for {account.name}"
			/>
		</div>
	{/if}
	{#if account.onboarding}
		<DashboardChecklist steps={account.steps} />
	{:else}
		<DashboardSession slug={account.slug} session={account.latestSession} />
		<DashboardProjects slug={account.slug} projects={account.projects} />
		{#if account.songs.length > 0}
			<DashboardSongs songs={account.songs} />
		{/if}
	{/if}
</section>
