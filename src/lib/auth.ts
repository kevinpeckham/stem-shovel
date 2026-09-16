import { dev } from "$app/environment";
import { getRequestEvent } from "$app/server";
import { db, schema } from "$lib/server/db";
import {
	acceptInvitation,
	createOwnedAccount,
	inviteCodeByCode,
	invitationByToken,
	redeemInviteCode,
} from "$lib/server/data";
import { sendPasswordResetEmail, sendVerificationEmail } from "$lib/server/email";
import { checkSignUp } from "$lib/server/signUpGate";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { ENV } from "varlock/env";

/**
 * Better Auth, following replicator's setup: email + password with address
 * verification and password reset over Resend (src/lib/server/email.ts). No 2FA.
 *
 * baseURL is Better Auth's identity for path matching: dev is reached from
 * several origins (localhost, the Tailscale name), so dev leaves it unset and
 * each request infers itself; production pins it.
 */
const PRODUCTION_URL = "https://www.stem-shovel.com";
const baseURL = dev ? undefined : PRODUCTION_URL;

const trustedOrigins = [
	PRODUCTION_URL,
	"http://localhost:5173",
	...(dev
		? ["https://stem-shovel.wr.lj.dev", "https://wandering-rodeo.tail59777f.ts.net:8444"]
		: []),
	// Vercel preview deployments
	...(ENV.VERCEL_ENV === "preview" ? ["https://*.vercel.app"] : []),
];

/** A new user gets their own account (tenant) and owns it. */
const createPersonalAccount = (user: { id: string; name: string; email: string }) =>
	createOwnedAccount(user.id, user.name || user.email);

const gateLookups = {
	invitation: async (token: string) => {
		const found = await invitationByToken(token);
		return {
			status: found.status,
			email: "invitation" in found ? found.invitation?.email : undefined,
		};
	},
	code: async (code: string) => ({ status: (await inviteCodeByCode(code)).status }),
};

export const auth = betterAuth({
	baseURL,
	secret: ENV.BETTER_AUTH_SECRET,
	trustedOrigins,
	database: drizzleAdapter(db, { provider: "sqlite", schema }),
	// This app's tenant table is `account`; Better Auth's provider-link model
	// lives in `auth_account` (schema key `authAccount`).
	account: { modelName: "authAccount" },
	emailAndPassword: {
		enabled: true,
		// Sign-in needs a verified address (Resend sends the link, docs/auth.md).
		requireEmailVerification: true,
		sendResetPassword: async ({ user, url }) => {
			await sendPasswordResetEmail(user.email, url, user.name);
		},
		// Finishing a reset proves the inbox as well as a verification link does —
		// it is how a user created outside sign-up (an invitee, the seed) gets past the wall.
		onPasswordReset: async ({ user }) => {
			await db.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, user.id));
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		// An unverified user at the sign-in wall gets a fresh link instead of a dead end.
		sendOnSignIn: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			await sendVerificationEmail(user.email, url, user.name);
		},
	},
	session: {
		// Short, so a suspension, deletion or a revoked admin flag takes effect within a minute.
		cookieCache: { enabled: true, maxAge: 60 },
	},
	user: {
		additionalFields: {
			isActive: { type: "boolean", required: true, defaultValue: true, input: false },
			isSystemAdmin: { type: "boolean", required: true, defaultValue: false, input: false },
			isSuperAdmin: { type: "boolean", required: true, defaultValue: false, input: false },
		},
	},
	databaseHooks: {
		user: {
			create: {
				// Sign-up is closed: the request must carry an invitation token
				// or an invite code (src/lib/server/signUpGate.ts). Users created
				// any other way (the seed, scripts) have no request context and pass.
				before: async (user, ctx) => {
					if (!ctx || ctx.path !== "/sign-up/email") return;
					const body = (ctx.body ?? {}) as Record<string, unknown>;
					const pass = await checkSignUp(
						{ email: user.email, inviteToken: body.inviteToken, inviteCode: body.inviteCode },
						gateLookups,
					);
					// Not FORBIDDEN: the sign-up route turns a 403 into a fake success
					// (its duplicate-email cover), which would hide the message.
					if (!pass.ok) throw new APIError("BAD_REQUEST", { message: pass.message });
				},
				after: async (user, ctx) => {
					// Joining an account through an invitation or an account's code is
					// the whole sign-up: no personal workspace beside it. A new-account
					// code (no account), or a user made outside sign-up, gets one.
					const body = ((ctx?.path === "/sign-up/email" && ctx.body) || {}) as Record<
						string,
						unknown
					>;
					const pass = ctx
						? await checkSignUp(
								{ email: user.email, inviteToken: body.inviteToken, inviteCode: body.inviteCode },
								gateLookups,
							)
						: null;
					let joined = false;
					if (pass?.ok && pass.via === "invitation") {
						const result = await acceptInvitation(pass.token, user);
						joined = typeof result !== "string";
					} else if (pass?.ok && pass.via === "code") {
						const result = await redeemInviteCode(pass.code, user.id);
						joined = typeof result !== "string" && result.account !== null;
					}
					if (!joined) await createPersonalAccount(user);
				},
			},
		},
	},
	plugins: [
		sveltekitCookies(getRequestEvent), // keep last
	],
});
