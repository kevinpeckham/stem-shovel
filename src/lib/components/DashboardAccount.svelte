<script lang="ts">
	import type { OnboardingStep } from "#lib/utils/onboardingSteps.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { plural } from "#lib/utils/plural.js";
	import DashboardChecklist from "./DashboardChecklist.svelte";

	/**
	 * One account's tile on the dashboard: its name (to its projects), the
	 * person's role in it, and its counts of projects, songs, sessions and
	 * members, each a link; for an owner or admin, the storage used against
	 * the plan and the seats taken; who has been active lately and, for an
	 * admin, the invitations still open (a link to settings); a new account's
	 * checklist below while it holds nothing; and a link to the account's
	 * page last.
	 */
	interface Props {
		account: {
			slug: string;
			name: string;
			role: string;
			counts: { projects: number; songs: number; sessions: number; members: number };
			/** Storage used against the plan's limit, for an owner or admin; null limits mean unlimited (a founder account). */
			quota: { bytes: number; storageLimit: number | null; memberLimit: number | null } | null;
			/** The members who used Stem Shovel in the last DASHBOARD_ACTIVE_DAYS, by name, and how many members there are. */
			band: { total: number; active: string[] };
			/** For an owner or admin: email invitations pending and invite links open; null for a member. */
			invites: { invitations: number; codes: number } | null;
			steps: OnboardingStep[];
			onboarding: boolean;
		};
	}
	let { account }: Props = $props();

	/** How full the storage is, 0 to 1, when there is a limit. */
	let fill = $derived(
		account.quota?.storageLimit
			? Math.min(1, account.quota.bytes / account.quota.storageLimit)
			: null,
	);
	let storageText = $derived(
		account.quota
			? account.quota.storageLimit === null
				? `${formatBytes(account.quota.bytes)} stored, no limit`
				: `${formatBytes(account.quota.bytes)} of ${formatBytes(account.quota.storageLimit)}`
			: "",
	);
	/** The active members' names, the first five and "and N more" past that. */
	let activeNames = $derived.by(() => {
		const names = account.band.active;
		if (names.length <= 5) return names.join(", ");
		return `${names.slice(0, 5).join(", ")} and ${names.length - 5} more`;
	});
	/** "2 invitations pending · 1 invite link open", whichever are nonzero. */
	let invitesText = $derived(
		[
			account.invites && account.invites.invitations > 0
				? `${plural(account.invites.invitations, "invitation")} pending`
				: "",
			account.invites && account.invites.codes > 0
				? `${plural(account.invites.codes, "invite link")} open`
				: "",
		]
			.filter(Boolean)
			.join(" · "),
	);
	let seatsText = $derived(
		account.quota?.memberLimit != null
			? `${account.counts.members} of ${plural(account.quota.memberLimit, "seat")}`
			: "",
	);

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
	{#if account.quota}
		<div class="grid gap-1 text-12px opacity-80" aria-label="{account.name} plan usage">
			<div class="flex flex-wrap justify-between gap-x-3">
				<span>{storageText}</span>
				{#if seatsText}<span>{seatsText}</span>{/if}
			</div>
			{#if fill !== null}
				<div
					class="h-1 overflow-hidden rounded-full bg-white/10"
					role="meter"
					aria-label="Storage used"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(fill * 100)}
				>
					<div
						class="h-full rounded-full {fill >= 0.9 ? 'bg-red-400' : 'bg-accent'}"
						style:width="{Math.round(fill * 100)}%"
					></div>
				</div>
			{/if}
		</div>
	{/if}
	<p class="text-12px opacity-80" aria-label="{account.name} members active lately">
		{#if account.band.active.length === 0}
			No one active in the last two weeks.
		{:else if account.band.active.length === account.band.total}
			{account.band.total === 1 ? "Just you" : "Everyone"} active in the last two weeks.
		{:else}
			Active in the last two weeks: {activeNames}.
		{/if}
	</p>
	{#if account.invites && (account.invites.invitations > 0 || account.invites.codes > 0)}
		<p class="text-12px">
			<a class="link" href="/{account.slug}/settings">{invitesText}</a>
		</p>
	{/if}
	{#if account.onboarding}
		<DashboardChecklist steps={account.steps} />
	{/if}
	<p class="text-14px">
		<a class="link" href="/{account.slug}/projects">Go to account page</a>
	</p>
</section>
