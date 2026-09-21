import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { id } from "./columns";
import { user } from "./user";

/**
 * Better Auth's `passkey` plugin model (@better-auth/passkey): one row per
 * registered WebAuthn credential. The property names are the plugin's field
 * names (the Drizzle adapter maps by them); the app only lists rows for the
 * Security page and deletes them with the user.
 */
export const passkey = table(
	"passkey",
	{
		id: id(),
		name: t.text("name"),
		publicKey: t.text("public_key").notNull(),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		credentialID: t.text("credential_id").notNull(),
		counter: t.integer("counter").notNull(),
		deviceType: t.text("device_type").notNull(),
		backedUp: t.integer("backed_up", { mode: "boolean" }).notNull(),
		transports: t.text("transports"),
		createdAt: t.integer("created_at", { mode: "timestamp_ms" }),
		aaguid: t.text("aaguid"),
	},
	(table) => [
		t.index("passkey_user_idx").on(table.userId),
		t.index("passkey_credential_idx").on(table.credentialID),
	],
);
