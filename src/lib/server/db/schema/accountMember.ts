import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { MemberRole } from "../../../val/MemberRoleSchema";
import { account } from "./account";
import { id, timestamps } from "./columns";
import { user } from "./user";

export const accountMember = table(
	"account_member",
	{
		id: id(),
		accountId: t
			.text("account_id")
			.notNull()
			.references(() => account.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		role: t.text("role").$type<MemberRole>().notNull().default("member"),
		...timestamps,
	},
	(table) => [
		t.index("account_member_user_idx").on(table.userId),
		t.index("account_member_account_idx").on(table.accountId),
		t.unique("account_member_unique").on(table.userId, table.accountId),
	],
);
