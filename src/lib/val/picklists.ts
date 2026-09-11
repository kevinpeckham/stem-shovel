/**
 * Picklist values for text columns. Tables reference the TYPES only; the
 * arrays are for validation and UI. Stored as plain text in SQLite (no CHECK
 * constraint) so adding a value is a code change, not a migration.
 */
export const ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const MEMBER_ROLES = ["owner", "admin", "member", "viewer"] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const ARCHIVE_STATUSES = ["active", "archived"] as const;
export type ArchiveStatus = (typeof ARCHIVE_STATUSES)[number];

export const STEM_STATUSES = ["uploading", "ready", "failed"] as const;
export type StemStatus = (typeof STEM_STATUSES)[number];
