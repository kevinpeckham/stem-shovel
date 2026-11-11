import { sessionDisplayName } from "./sessionName";
import type { SessionKind } from "#lib/constants/sessionRecordings.js";

/** What a viewing link opens. */
type ShareLinkKind = "song" | "mix" | "demo" | "project" | "session" | "recording" | "set list";

/** A share_link row with what it opens joined (listAccountShareLinks in src/lib/server/data.ts); a target that was deleted comes back null. */
interface AccountShareLinkRow {
	id: string;
	code: string;
	note: string;
	uses: number;
	maxUses: number | null;
	expiresAt: Date | null;
	createdAt: Date;
	revokedAt: Date | null;
	songId: string | null;
	mixId: string | null;
	demoId: string | null;
	projectId: string | null;
	recordingId: string | null;
	sessionId: string | null;
	setListId: string | null;
	creator: { name: string } | null;
	song: { title: string; slug: string; project: { name: string; slug: string } } | null;
	project: { name: string; slug: string } | null;
	recording: { id: string; title: string } | null;
	session: { id: string; name: string; place: string; kind: SessionKind; startsOn: string } | null;
	setList: { id: string; title: string } | null;
}

/** One row of the account's Viewing links page (/[account]/links). */
export interface AccountShareLink {
	id: string;
	code: string;
	note: string;
	uses: number;
	maxUses: number | null;
	expiresAt: Date | null;
	createdAt: Date;
	revokedAt: Date | null;
	createdByName: string | null;
	state: "open" | "revoked" | "expired" | "used up";
	kind: ShareLinkKind;
	/** The song's title (a mix: "<title> · mix", a demo: "<title> · demo"), the project's name, the recording's, the session's or the set list's; "(deleted)" when the target is gone. */
	title: string;
	/** The page it opens, as shareLinkTarget() in data.ts builds it; null when the target is gone. */
	path: string | null;
}

/** What a link opens, read from the ids, so a deleted target keeps its kind. */
function kindOf(r: AccountShareLinkRow): ShareLinkKind {
	if (r.recordingId) return "recording";
	if (r.sessionId) return "session";
	if (r.setListId) return "set list";
	if (r.songId && r.mixId) return "mix";
	if (r.songId && r.demoId) return "demo";
	if (r.songId) return "song";
	return "project";
}

type Target = { title: string; path: string } | null;

/** Each kind's title and page, from the joined row; null when the target is gone. */
const TARGETS: Record<ShareLinkKind, (r: AccountShareLinkRow, account: string) => Target> = {
	recording: ({ recording: rec }, a) =>
		rec && { title: rec.title.trim() || "Recording", path: `/${a}/sessions/r/${rec.id}` },
	session: ({ session: s }, a) =>
		s && { title: sessionDisplayName(s), path: `/${a}/sessions/s/${s.id}` },
	"set list": ({ setList: l }, a) => l && { title: l.title, path: `/${a}/set-lists/${l.id}/show` },
	song: ({ song: s }, a) =>
		s && { title: s.title, path: `/${a}/projects/${s.project.slug}/${s.slug}` },
	mix: ({ song: s, mixId }, a) =>
		s && {
			title: `${s.title} · mix`,
			path: `/${a}/projects/${s.project.slug}/${s.slug}/mixes/${mixId}`,
		},
	demo: ({ song: s, demoId }, a) =>
		s && {
			title: `${s.title} · demo`,
			path: `/${a}/projects/${s.project.slug}/${s.slug}/demos/${demoId}`,
		},
	project: ({ project: p }, a) => p && { title: p.name, path: `/${a}/projects/${p.slug}` },
};

/** A share link of the account, flattened for the Viewing links page; data.ts adds `state`. */
export function accountShareLinkOf(
	r: AccountShareLinkRow,
	accountSlug: string,
): Omit<AccountShareLink, "state"> {
	const kind = kindOf(r);
	return {
		id: r.id,
		code: r.code,
		note: r.note,
		uses: r.uses,
		maxUses: r.maxUses,
		expiresAt: r.expiresAt,
		createdAt: r.createdAt,
		revokedAt: r.revokedAt,
		createdByName: r.creator?.name ?? null,
		kind,
		...(TARGETS[kind](r, accountSlug) ?? { title: "(deleted)", path: null }),
	};
}
