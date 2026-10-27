/** What an account holds (and the person's own ideas), for the dashboard's checklist. */
export interface OnboardingCounts {
	projects: number;
	songs: number;
	recordings: number;
	members: number;
	ideas: number;
}

export interface OnboardingStep {
	id: "recording" | "song" | "band" | "idea";
	label: string;
	href: string;
	done: boolean;
}

/** The checklist for a new account, computed from counts and never stored (docs/dashboard-plan.md). */
export function onboardingSteps(c: OnboardingCounts, slug: string): OnboardingStep[] {
	return [
		{
			id: "recording",
			label: "Add a recording",
			href: `/${slug}/sessions`,
			done: c.recordings > 0,
		},
		{ id: "song", label: "Create a song", href: `/${slug}/projects`, done: c.songs > 0 },
		{ id: "band", label: "Invite the band", href: `/${slug}/settings`, done: c.members > 1 },
		{ id: "idea", label: "Try the Idea Recorder", href: "/idea-recorder", done: c.ideas > 0 },
	];
}

/** An account with no projects, songs or recordings shows the checklist until three steps are done. */
export function showOnboarding(steps: OnboardingStep[], c: OnboardingCounts): boolean {
	const empty = c.projects === 0 && c.songs === 0 && c.recordings === 0;
	return empty && steps.filter((s) => s.done).length < 3;
}
