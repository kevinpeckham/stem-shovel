import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { AccountPlan } from "../../../val/AccountPlanSchema";
import type { AccountStatus } from "../../../val/AccountStatusSchema";
import { id, timestamps } from "./columns";

/**
 * The tenant: a studio, band or client workspace. Everything else belongs to
 * an account and every query is scoped by one. The id is also the top-level
 * folder in the Blob store (`accounts/<id>/…`).
 */
export const account = table("account", {
	id: id(),
	name: t.text("name").notNull(),
	slug: t.text("slug").notNull().unique(),
	status: t.text("status").$type<AccountStatus>().notNull().default("active"),
	/** null = unlimited. Checked when a stem upload token is issued. */
	storageLimitBytes: t.integer("storage_limit_bytes"),
	/** Subscription tier (docs/billing.md). Only "free" exists today. */
	plan: t.text("plan").$type<AccountPlan>().notNull().default("free"),
	/** No base subscription cost, ever: the promise made to every account created before paid tiers exist. */
	lifetimeFree: t.integer("lifetime_free", { mode: "boolean" }).notNull().default(true),
	/** Founder: never charged, unlimited data, every premium feature. The first FOUNDER_SEATS accounts, then by a super admin. */
	isFounder: t.integer("is_founder", { mode: "boolean" }).notNull().default(false),
	/** The artist a new song is credited to as performer (an `artist` row of this account; no FK, since artist imports account), or null (migration 0049). */
	defaultArtistId: t.text("default_artist_id"),
	/** The account's picture (a resized WebP in Blob, migration 0052), or null. */
	imageUrl: t.text("image_url"),
	...timestamps,
});
