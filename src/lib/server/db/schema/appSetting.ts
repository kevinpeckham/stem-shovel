import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { timestamps } from "./columns";

/**
 * App-wide settings a system admin sets from /admin, one row per key
 * (`featuredSongId`: the song the home page demos). Not per account.
 */
export const appSetting = table("app_setting", {
	key: t.text("key").primaryKey(),
	value: t.text("value").notNull(),
	...timestamps,
});
