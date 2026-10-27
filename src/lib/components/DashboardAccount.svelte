<script lang="ts">
	import type { SessionKind } from "#lib/constants/sessionRecordings.js";
	import type { OnboardingStep } from "#lib/utils/onboardingSteps.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";
	import DashboardChecklist from "./DashboardChecklist.svelte";
	import DashboardTileList from "./DashboardTileList.svelte";

	/**
	 * One account's tile on the dashboard: its name, then its recent
	 * projects, songs and sessions side by side, or the checklist while it
	 * holds nothing.
	 */
	interface Props {
		account: {
			slug: string;
			name: string;
			projects: { id: string; name: string; slug: string; songCount: number }[];
			songs: { id: string; title: string; href: string; project: string }[];
			sessions: {
				id: string;
				name: string;
				place: string;
				kind: SessionKind;
				startsOn: string;
				recordingCount: number;
			}[];
			steps: OnboardingStep[];
			onboarding: boolean;
		};
	}
	let { account }: Props = $props();

	const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

	let projects = $derived(
		account.projects.map((p) => ({
			id: p.id,
			label: p.name,
			href: `/${account.slug}/projects/${p.slug}`,
			detail: plural(p.songCount, "song"),
		})),
	);
	let songs = $derived(
		account.songs.map((s) => ({ id: s.id, label: s.title, href: s.href, detail: s.project })),
	);
	let sessions = $derived(
		account.sessions.map((s) => ({
			id: s.id,
			label: sessionDisplayName(s),
			href: `/${account.slug}/sessions/s/${s.id}`,
			detail: `${dayText(s.startsOn)} · ${plural(s.recordingCount, "recording")}`,
		})),
	);
</script>

<section
	class="surface grid gap-4 p-5"
	aria-label={account.name}
	data-dashboard-account={account.slug}
>
	<h2 class="heading-2 mb-0">
		<a class="hover:text-accent" href="/{account.slug}/projects">{account.name}</a>
	</h2>
	{#if account.onboarding}
		<DashboardChecklist steps={account.steps} />
	{:else}
		<div class="grid gap-4 sm:grid-cols-3">
			<DashboardTileList
				heading="Projects"
				items={projects}
				empty="No projects yet."
				all={{ label: "All projects", href: `/${account.slug}/projects` }}
			/>
			<DashboardTileList
				heading="Songs"
				items={songs}
				empty="No songs yet."
				all={{ label: "All songs", href: `/${account.slug}/projects` }}
			/>
			<DashboardTileList
				heading="Sessions"
				items={sessions}
				empty="No sessions yet."
				all={{ label: "All sessions", href: `/${account.slug}/sessions` }}
			/>
		</div>
	{/if}
</section>
