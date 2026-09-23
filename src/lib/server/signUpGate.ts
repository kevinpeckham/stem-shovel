import * as v from "valibot";
import { InviteCodeSchema } from "$lib/val/InviteCodeSchema";

/**
 * Who may sign up. With sign-up open (the `signUpMode` app setting) anyone
 * can, and an invitation or code offered besides joins that account; with
 * it invite-only a new user needs an invitation link (the token from the
 * email) or an invite code an admin handed out. Every sign-up also accepts
 * the plan terms (/docs/plan-terms). The checks run inside Better Auth's
 * user-create hooks (src/lib/auth.ts); the lookups are passed in so the
 * rule is testable without a database.
 */
export interface SignUpRequest {
	email: string;
	inviteToken?: unknown;
	inviteCode?: unknown;
	/** "yes" from the sign-up form's checkbox. */
	acceptPlanTerms?: unknown;
}

export interface SignUpOptions {
	/** Sign-up is open: no invitation or code needed. */
	open?: boolean;
}

export interface SignUpLookups {
	invitation: (token: string) => Promise<{ status: string; email?: string }>;
	code: (code: string) => Promise<{ status: string }>;
}

export type SignUpPass =
	| { ok: true; via: "invitation"; token: string }
	| { ok: true; via: "code"; code: string }
	| { ok: true; via: "open" }
	| { ok: false; message: string };

export const SIGN_UP_CLOSED =
	"Sign-up needs an invitation link or an invite code from an account admin.";
export const PLAN_TERMS_REQUIRED = "Accept the plan terms to create an account.";

const INVITATION_MESSAGES: Record<string, string> = {
	missing: "That invitation link is not valid.",
	accepted: "That invitation has already been used.",
	revoked: "That invitation was withdrawn.",
	expired: "That invitation has expired. Ask for a new one.",
};

const CODE_MESSAGES: Record<string, string> = {
	missing: "That invite code is not valid.",
	revoked: "That invite code was withdrawn.",
	expired: "That invite code has expired.",
	"used up": "That invite code has no uses left.",
};

export async function checkSignUp(
	req: SignUpRequest,
	lookups: SignUpLookups,
	{ open = false }: SignUpOptions = {},
): Promise<SignUpPass> {
	if (req.acceptPlanTerms !== "yes") return { ok: false, message: PLAN_TERMS_REQUIRED };
	const token = typeof req.inviteToken === "string" ? req.inviteToken.trim() : "";
	const typed = typeof req.inviteCode === "string" ? req.inviteCode : "";
	if (token) {
		const found = await lookups.invitation(token);
		if (found.status !== "open") {
			return { ok: false, message: INVITATION_MESSAGES[found.status] ?? SIGN_UP_CLOSED };
		}
		if ((found.email ?? "").toLowerCase() !== req.email.trim().toLowerCase()) {
			return {
				ok: false,
				message: `That invitation is for a different address. Sign up as ${found.email}.`,
			};
		}
		return { ok: true, via: "invitation", token };
	}
	if (typed.trim()) {
		const parsed = v.safeParse(InviteCodeSchema, typed);
		if (!parsed.success) return { ok: false, message: CODE_MESSAGES.missing };
		const found = await lookups.code(parsed.output);
		if (found.status !== "open") {
			return { ok: false, message: CODE_MESSAGES[found.status] ?? CODE_MESSAGES.missing };
		}
		return { ok: true, via: "code", code: parsed.output };
	}
	if (open) return { ok: true, via: "open" };
	return { ok: false, message: SIGN_UP_CLOSED };
}
