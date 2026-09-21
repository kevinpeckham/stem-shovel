import { authRateLimitStorage } from "$lib/server/authRateLimit";
import { dev } from "$app/environment";
import { getRequestEvent } from "$app/server";
import { db, schema } from "$lib/server/db";
import {
	acceptInvitation,
	createOwnedAccount,
	inviteCodeByCode,
	invitationByToken,
	memberHeadroom,
	redeemInviteCode,
} from "$lib/server/data";
import { sendPasswordResetEmail, sendVerificationEmail } from "$lib/server/email";
import { checkSignUp } from "$lib/server/signUpGate";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { sveltekitCookies } from "better-auth/svelte-kit";
import { ENV } from "varlock/env";

/**
 * Better Auth, following replicator's setup: email + password with address
 * verification and password reset over Resend (src/lib/server/email.ts), and
 * optional TOTP two-factor (the `twoFactor` plugin: /settings/security to set
 * up, /verify-2fa at sign-in; docs/auth.md) and passkeys (the `passkey`
 * plugin: registered on /settings/security, a one-tap sign-in that stands in
 * for password and code).
 *
 * baseURL is Better Auth's identity for path matching: its SvelteKit handler
 * ignores a request whose origin differs from it (every /api/auth/* answered
 * the app's 404 on the staging preview, 2026-09-18). Dev is reached from
 * several origins (localhost, the Tailscale name, the exe.dev proxy) and a
 * preview deployment has its own names (staging.stemshovel.dev, *.vercel.app),
 * so both leave it unset and each request infers itself; only production
 * pins it, to the domain Vercel says is production (so a forged Host header
 * can never reach the links in the emails we send). The literal is the
 * fallback for a build outside Vercel.
 */
const PRODUCTION_URL = ENV.VERCEL_PROJECT_PRODUCTION_URL
	? `https://${ENV.VERCEL_PROJECT_PRODUCTION_URL}`
	: "https://www.stemshovel.com";
const baseURL = dev || ENV.VERCEL_ENV === "preview" ? undefined : PRODUCTION_URL;

/**
 * The passkey relying-party id: the domain a credential is bound to. The
 * registrable domain in production (so www and the bare domain share the
 * keys), the preview's own host on staging, and the proxy name Kevin
 * previews on in dev (a passkey made on localhost would not match it).
 */
const PASSKEY_RP_ID = dev
	? "stem-shovel.wr.lj.dev"
	: ENV.VERCEL_ENV === "preview"
		? "staging.stemshovel.dev"
		: new URL(PRODUCTION_URL).hostname.replace(/^www\./, "");

const trustedOrigins = [
	PRODUCTION_URL,
	"https://stemshovel.com",
	// The first domain; Vercel redirects it to the new one, but a request that
	// arrives before the redirect (an old bookmark, a form already open) still
	// passes the origin check during the switch.
	"https://www.stem-shovel.com",
	"https://stem-shovel.com",
	"http://localhost:5173",
	...(dev
		? ["https://stem-shovel.wr.lj.dev", "https://wandering-rodeo.tail59777f.ts.net:8444"]
		: []),
	// Preview deployments: staging's domain and Vercel's own names
	...(ENV.VERCEL_ENV === "preview"
		? ["https://staging.stemshovel.dev", "https://*.vercel.app"]
		: []),
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
	// Sign-in and two-factor attempts are counted in Redis across every function instance (docs/security.md).
	rateLimit: { customStorage: authRateLimitStorage },
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
					// The account the invitation or code joins must have a seat left (docs/billing.md).
					const found =
						pass.via === "invitation"
							? await invitationByToken(pass.token)
							: await inviteCodeByCode(pass.code);
					const joining =
						"invitation" in found
							? (found.invitation?.accountId ?? null)
							: "code" in found
								? (found.code?.accountId ?? null) // null for a system code: nothing to join
								: null;
					if (joining && (await memberHeadroom(joining)).full) {
						throw new APIError("BAD_REQUEST", {
							message: "That account has no seats left. Ask its owner to make room first.",
						});
					}
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
		twoFactor({
			issuer: "Stem Shovel",
			totpOptions: { digits: 6, period: 30 },
			backupCodeOptions: { amount: 10, length: 8 },
			// "Trust this device" skips the code for 30 days (a signed cookie).
			trustDeviceMaxAge: 30 * 24 * 60 * 60,
		}),
		// The origin is checked against the request (trustedOrigins gates it); rpID is the domain.
		passkey({
			rpID: PASSKEY_RP_ID,
			rpName: "Stem Shovel",
			// A discoverable credential with user verification, so the sign-in page can offer "Sign in with a passkey" with no email typed.
			authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
		}),
		sveltekitCookies(getRequestEvent), // keep last
	],
});
