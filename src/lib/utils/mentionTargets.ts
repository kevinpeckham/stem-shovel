import type { MentionTarget } from "./linkMentions";

/** What a song's documents can point at by `@name`: its ready attachments and notation files by their permanent links, its demos by an anchor on the page. */
export function mentionTargets(song: {
	files: { status: string; title: string; filename: string; shareCode: string }[];
	notation: { status: string; title: string; filename: string; shareCode: string }[];
	demos: { id: string; label: string }[];
}): MentionTarget[] {
	const ready = (rows: { status: string; title: string; filename: string; shareCode: string }[]) =>
		rows
			.filter((r) => r.status === "ready")
			.map((r) => ({ label: r.title || r.filename, href: `/f/${r.shareCode}` }));
	return [
		...ready(song.files),
		...ready(song.notation),
		...song.demos.map((d) => ({ label: d.label, href: `#demo-${d.id}` })),
	];
}
