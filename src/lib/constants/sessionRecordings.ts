/**
 * Session recordings (docs/uploads-and-blob.md, "Sessions"): the band's
 * practice and show recordings, uploaded by members and kept on the
 * account for everyone in it to hear and download. One audio file each,
 * whatever a phone or recorder hands over (the demo formats), played in
 * the browser as uploaded.
 */
export const SESSION_KINDS = ["practice", "show"] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

export const SESSION_KIND_LABELS: Record<SessionKind, string> = {
	practice: "Practice",
	show: "Show",
};

/** A session can run an evening: the ceiling is a stem's four times over. */
export const SESSION_MAX_BYTES = 2 * 1024 * 1024 * 1024;
/** Sessions an account keeps at most; a band that records every week is years from it. */
export const MAX_SESSIONS_PER_ACCOUNT = 1000;
