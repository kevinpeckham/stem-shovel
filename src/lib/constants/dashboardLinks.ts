/** A button-row link on the dashboard. */
export interface DashboardLink {
	label: string;
	href: string;
}

/** The tools every quick-actions row offers once, whatever the account. */
export const DASHBOARD_TOOLS: DashboardLink[] = [
	{ label: "Tuner", href: "/tuner" },
	{ label: "Metronome", href: "/metronome" },
];

/** The free tools offered to someone with no account yet. */
export const DASHBOARD_FREE_TOOLS: DashboardLink[] = [
	{ label: "Idea Recorder", href: "/idea-recorder" },
	{ label: "Drum Machine", href: "/drum-machine" },
	{ label: "Piano", href: "/piano" },
	{ label: "Chord Player", href: "/chord-player" },
	...DASHBOARD_TOOLS,
];
