import type { Cookies } from "@sveltejs/kit";

/**
 * Who may view a private project or song: a member of its account, or a
 * visitor holding an open share code for that song or its project. The
 * decision is pure so pages, the mix endpoint and tests share it; the
 * database lookups live in data.ts (openShareLinks).
 */
export interface ShareGrant {
	code: string;
	projectId: string | null;
	songId: string | null;
}

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
	project: { id: string; accountId: string; isPrivate: boolean },
	isMember: boolean,
	grants: ShareGrant[],
): boolean {
	if (!project.isPrivate || isMember) return true;
	return grants.some((g) => g.projectId === project.id);
}

export function canViewSong(
	song: { id: string; projectId: string; isPrivate: boolean; project: { isPrivate: boolean } },
	isMember: boolean,
	grants: ShareGrant[],
): boolean {
	if (isMember) return true;
	if (!song.isPrivate && !song.project.isPrivate) return true;
	return grants.some((g) => g.songId === song.id || g.projectId === song.projectId);
}
