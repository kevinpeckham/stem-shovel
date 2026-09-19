import { ENV } from "varlock/env";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * The /support line-up as a sealed token: the visitor gets five obscured
 * account names and must pick theirs; the token carries the answer, the
 * account, the email it was issued for and an expiry, encrypted (AES-256-GCM
 * under a key derived from the auth secret) so the page cannot read the
 * answer out of it. Nothing is kept on the server between the two steps.
 */
const KEY = () =>
	createHash("sha256").update(`support-challenge:${ENV.BETTER_AUTH_SECRET}`).digest();
export const CHALLENGE_TTL_MS = 15 * 60 * 1000;

export interface Challenge {
	email: string;
	/** The obscured names, in the order shown. */
	options: string[];
	/** Index of the real account, or -1 when the email has none (every pick fails). */
	correct: number;
	accountId: string | null;
	userId: string | null;
}

export function sealChallenge(c: Challenge, now = Date.now()): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", KEY(), iv);
	const body = Buffer.concat([
		cipher.update(JSON.stringify({ ...c, exp: now + CHALLENGE_TTL_MS }), "utf8"),
		cipher.final(),
	]);
	return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url");
}

/** The challenge back, or null when the token is not ours, tampered with, or expired. */
export function openChallenge(token: string, now = Date.now()): Challenge | null {
	try {
		const raw = Buffer.from(token, "base64url");
		if (raw.length < 12 + 16 + 2) return null;
		const decipher = createDecipheriv("aes-256-gcm", KEY(), raw.subarray(0, 12));
		decipher.setAuthTag(raw.subarray(12, 28));
		const json = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString(
			"utf8",
		);
		const c = JSON.parse(json) as Challenge & { exp: number };
		if (typeof c.exp !== "number" || c.exp < now) return null;
		return c;
	} catch {
		return null;
	}
}
