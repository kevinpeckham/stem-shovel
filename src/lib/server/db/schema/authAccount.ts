import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";
import { user } from "./user";

/**
 * Better Auth's "account" model — a credential or OAuth provider link for a
 * user. Named `auth_account` because `account` is this app's tenant table;
 * `src/lib/auth.ts` maps the model with `account.modelName`.
 */
export const authAccount = table(
	"auth_account",
	{
		id: t.text("id").primaryKey(),
		accountId: t.text("account_id").notNull(),
		providerId: t.text("provider_id").notNull(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: t.text("access_token"),
		refreshToken: t.text("refresh_token"),
		idToken: t.text("id_token"),
		accessTokenExpiresAt: t.integer("access_token_expires_at", { mode: "timestamp_ms" }),
		refreshTokenExpiresAt: t.integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
		scope: t.text("scope"),
		password: t.text("password"),
		...timestamps,
	},
	(table) => [t.index("auth_account_user_idx").on(table.userId)],
);
