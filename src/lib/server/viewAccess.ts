import type { Cookies } from "@sveltejs/kit";
import type { ProjectRole } from "$lib/val/ProjectRoleSchema";

/**
 * Who may view, edit or comment on a project or song. The decision is pure
 * so pages, the mix endpoint, the mutation gate (access.ts memberOf) and
 * tests share it; the database lookups live in data.ts.
 *
 * - The account's owners and admins see and edit everything in it.
 * - A member of the account edits every project except a **restricted**
 *   one they were not added to, which they cannot open at all.
 * - A **project viewer** (added to the project from outside the account)
 *   sees its private work and comments, edits nothing, takes no seat.
 * - A visitor holding an open share code sees what the code opens.
 * - Public projects and songs are open to everyone by URL.
 */
export interface ShareGrant {
	code: string;
	projectId: string | null;
	songId: string | null;
}

export interface Viewer {
	/** Role in the account (a super admin acts as owner), or null. */
	accountRole: string | null;
	/** Role on each project the person was added to. */
	projectRoles: Record<string, ProjectRole>;
}

export const NOBODY: Viewer = { accountRole: null, projectRoles: {} };

export const isAccountAdmin = (role: string | null | undefined) =>
	role === "owner" || role === "admin";

export const SHARE_COOKIE = "share";
const MAX_REMEMBERED = 10;

/** Codes the visitor carries: `?share=` first, then the cookie. */
export function shareCodesFrom(url: URL, cookies: Pick<Cookies, "get">): string[] {
	const fromUrl = url.searchParams.get("share")?.trim() ?? "";
	const fromCookie = (cookies.get(SHARE_COOKIE) ?? "").split(",").filter(Boolean);
	return [...new Set([fromUrl, ...fromCookie].filter(Boolean))].slice(0, MAX_REMEMBERED);
}

/** Keeps the (validated) codes for the rest of the visit, newest first. */
export function rememberShareCodes(cookies: Pick<Cookies, "set">, codes: string[]): void {
	cookies.set(SHARE_COOKIE, codes.slice(0, MAX_REMEMBERED).join(","), {
		path: "/",
		httpOnly: true,
		sameSite: "lax",
		secure: true,
		maxAge: 30 * 24 * 60 * 60,
	});
}

export function canViewProject(
	project: { id: string; isPrivate: boolean; isRestricted: boolean },
	who: Viewer,
	grants: ShareGrant[],
): boolean {
	if (isAccountAdmin(who.accountRole)) return true;
	const onProject = who.projectRoles[project.id] !== undefined;
	const granted = grants.some((g) => g.projectId === project.id);
	if (project.isRestricted) return onProject || granted;
	if (!project.isPrivate) return true;
	return who.accountRole !== null || onProject || granted;
}

export function canViewSong(
	song: {
		id: string;
		projectId: string;
		isPrivate: boolean;
		project: { isPrivate: boolean; isRestricted: boolean };
	},
	who: Viewer,
	grants: ShareGrant[],
): boolean {
	if (isAccountAdmin(who.accountRole)) return true;
	const onProject = who.projectRoles[song.projectId] !== undefined;
	const granted = grants.some((g) => g.songId === song.id || g.projectId === song.projectId);
	if (song.project.isRestricted) return onProject || granted;
	if (!song.isPrivate && !song.project.isPrivate) return true;
	return who.accountRole !== null || onProject || granted;
}

/** Who may change a project and what is in it. */
export function canEditProject(
	project: { id: string; isRestricted: boolean },
	who: Viewer,
): boolean {
	if (isAccountAdmin(who.accountRole)) return true;
	if (who.accountRole !== "member") return false;
	return !project.isRestricted || who.projectRoles[project.id] === "member";
}

/** Who may comment: everyone who may edit, and the project's viewers. */
export function canCommentProject(
	project: { id: string; isRestricted: boolean },
	who: Viewer,
): boolean {
	return canEditProject(project, who) || who.projectRoles[project.id] === "viewer";
}
