<script lang="ts">
	import type { OnboardingStep } from "#lib/utils/onboardingSteps.js";
	import { plural } from "#lib/utils/plural.js";
	import DashboardChecklist from "./DashboardChecklist.svelte";

	/**
	 * One account's tile on the dashboard: its name (to its projects), the
	 * person's role in it, and its counts of projects, songs, sessions and
	 * members, each a link; a new account's checklist below while it holds
	 * nothing; and a link to the account's page last.
	 */
	interface Props {
		account: {
			slug: string;
			name: string;
			role: string;
			counts: { projects: number; songs: number; sessions: number; members: number };
			steps: OnboardingStep[];
			onboarding: boolean;
		};
	}
	let { account }: Props = $props();

	/** "owner" → "Owner". */
	let role = $derived(account.role.charAt(0).toUpperCase() + account.role.slice(1));
	let stats = $derived([
		{
			id: "projects",
			label: plural(account.counts.projects, "project"),
			href: `/${account.slug}/projects`,
		},
		{ id: "songs", label: plural(account.counts.songs, "song"), href: `/${account.slug}/projects` },
		{
			id: "sessions",
			label: plural(account.counts.sessions, "session"),
			href: `/${account.slug}/sessions`,
		},
		{
			id: "members",
			label: plural(account.counts.members, "member"),
			href: `/${account.slug}/settings`,
		},
	]);
</script>

<section
	class="surface grid content-start gap-3 p-5"
	aria-label={account.name}
	data-dashboard-account={account.slug}
>
	<div class="flex items-baseline justify-between gap-3">
		<h3 class="marketing-section-heading mb-0 min-w-0 truncate">
			<a class="hover:text-accent" href="/{account.slug}/projects">{account.name}</a>
		</h3>
		<span
			class="shrink-0 rounded-full border border-white/20 px-2 py-0.5 text-11px uppercase tracking-wider opacity-80"
			title="Your role in {account.name}">{role}</span
		>
	</div>
	<ul class="grid grid-cols-2 gap-x-4 gap-y-1 text-14px" aria-label="{account.name} at a glance">
		{#each stats as stat (stat.id)}
			<li><a class="link" href={stat.href}>{stat.label}</a></li>
		{/each}
	</ul>
	{#if account.onboarding}
		<DashboardChecklist steps={account.steps} />
	{/if}
	<p class="text-14px">
		<a class="link" href="/{account.slug}/projects">Go to account page</a>
	</p>
</section>
