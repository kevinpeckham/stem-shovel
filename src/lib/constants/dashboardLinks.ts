/** A link on the dashboard: a button row (the no-account start) or a sidebar widget's list. */
export interface DashboardLink {
	label: string;
	href: string;
}

/** A sidebar entry that is a button rather than a link: the bug report popover, or sharing the site. */
export interface DashboardAction {
	label: string;
	action: "report" | "share";
}

/** The free tools offered to someone with no account yet. */
export const DASHBOARD_FREE_TOOLS: DashboardLink[] = [
	{ label: "Idea Recorder", href: "/idea-recorder" },
	{ label: "Drum Machine", href: "/drum-machine" },
	{ label: "Piano", href: "/piano" },
	{ label: "Chord Player", href: "/chord-player" },
	{ label: "Tuner", href: "/tuner" },
	{ label: "Metronome", href: "/metronome" },
];

/** The sidebar's Tools, as the footer names them; the Session Recorder joins after Dawn when there is an account (utils/dashboardTools.ts). */
export const DASHBOARD_TOOLS: DashboardLink[] = [
	{ label: "Lark Idea Recorder", href: "/idea-recorder" },
	{ label: "Whirl Looper", href: "/looper" },
	{ label: "Ember Practice Amp", href: "/practice-amp" },
	{ label: "Dawn Multitrack Studio", href: "/multitrack-recorder" },
	{ label: "Tuner", href: "/tuner" },
	{ label: "Metronome", href: "/metronome" },
	{ label: "Convert", href: "/convert" },
];

/** The sidebar's Instruments, as the footer names them. */
export const DASHBOARD_INSTRUMENTS: DashboardLink[] = [
	{ label: "Drum Machine", href: "/drum-machine" },
	{ label: "Piano", href: "/piano" },
	{ label: "Palette", href: "/chord-player" },
];

/** The sidebar's More: the footer's links, the bug report and sharing the site. */
export const DASHBOARD_MORE: (DashboardLink | DashboardAction)[] = [
	{ label: "Docs", href: "/docs" },
	{ label: "Feature Requests", href: "/feature-requests" },
	{ label: "Report a bug", action: "report" },
	{ label: "Help", href: "/support" },
	{ label: "Share Stem Shovel", action: "share" },
	{ label: "Stem Shovel Blog", href: "/blog" },
];

/** Ideas, loops or multitracks a dashboard section shows at first, and how many more each "Show more" reveals. */
export const DASHBOARD_IDEAS_PAGE = 10;
