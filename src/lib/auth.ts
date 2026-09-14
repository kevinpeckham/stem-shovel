import { dev } from "$app/environment";
import { getRequestEvent } from "$app/server";
import { db, schema } from "$lib/server/db";
import { sendPasswordResetEmail, sendVerificationEmail } from "$lib/server/email";
import { eq } from "drizzle-orm";
import { slugify } from "$lib/utils/slugify";
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
async function createPersonalAccount(user: { id: string; name: string; email: string }) {
	const base = slugify(user.name || user.email.split("@")[0]) || "account";
	const taken = new Set(
		(await db.select({ slug: schema.account.slug }).from(schema.account)).map((r) => r.slug),
	);
	let slug = base;
	for (let n = 2; taken.has(slug); n++) slug = `${base.slice(0, 60)}-${n}`;
	const [account] = await db
		.insert(schema.account)
		.values({ name: user.name || user.email, slug })
		.returning();
	await db
		.insert(schema.accountMember)
		.values({ accountId: account.id, userId: user.id, role: "owner" });
	return account;
}

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
		cookieCache: { enabled: true, maxAge: 5 * 60 },
	},
	user: {
		additionalFields: {
			isActive: { type: "boolean", required: true, defaultValue: true, input: false },
		},
	},
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await createPersonalAccount(user);
				},
			},
		},
	},
	plugins: [
		sveltekitCookies(getRequestEvent), // keep last
	],
});
