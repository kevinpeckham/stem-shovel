/** One item of a demo row's ⋯ menu (src/lib/components/DemoPanel.svelte): a link or an action. */
export interface DemoMenuItem {
	label: string;
	icon: string;
	title?: string;
	/** The element it is: a link to `href`, or a button doing `action`. */
	element: "a" | "button";
	/** A button's `type` ("button"); none on a link. */
	type?: "button";
	href?: string;
	action?: () => void;
}

/**
 * A demo row's ⋯ menu: its own page (`hrefOf`; Share… there for an editor),
 * the MP3 when there is one, the original file, and, when the editor's page
 * passes them, Edit notes… (Add notes… while it has none) and Remove.
 */
export function demoMenuItems(
	d: {
		id: string;
		label: string;
		url: string;
		filename: string;
		playbackUrl: string | null;
		notes?: string;
	},
	opts: {
		hrefOf?: (id: string) => string;
		canEdit: boolean;
		save: (url: string, filename: string) => unknown;
		editNotes?: () => void;
		remove?: () => void;
	},
): DemoMenuItem[] {
	const page = opts.hrefOf?.(d.id);
	const items = [
		{
			label: "Open page",
			icon: "i-ph-arrow-square-out",
			title: "The demo on a page of its own, to listen, comment and share",
			href: page,
			when: !!page,
		},
		{
			label: "Share…",
			icon: "i-ph-paper-plane-tilt",
			title: "Share this demo by email or with a viewing link",
			href: `${page}?open=share`,
			when: !!page && opts.canEdit,
		},
		{
			label: "Download MP3",
			icon: "i-ph-download-simple",
			action: () => opts.save(d.playbackUrl ?? "", `${d.label}.mp3`),
			when: !!d.playbackUrl,
		},
		{
			label: d.playbackUrl ? "Download original" : "Download file",
			icon: "i-ph-file-audio",
			title: d.filename,
			action: () => opts.save(d.url, d.filename),
			when: true,
		},
		{
			label: d.notes ? "Edit notes…" : "Add notes…",
			icon: "i-ph-note-pencil",
			title: "What this take is, what to listen for",
			action: opts.editNotes,
			when: opts.canEdit && !!opts.editNotes,
		},
		{
			label: "Remove demo",
			icon: "i-ph-trash",
			title: "Remove this demo from the song; the file is deleted",
			action: opts.remove,
			when: opts.canEdit && !!opts.remove,
		},
	];
	return items
		.filter((item) => item.when)
		.map(({ when: _when, ...item }) =>
			item.href
				? { ...item, element: "a" as const }
				: { ...item, element: "button" as const, type: "button" as const },
		);
}
