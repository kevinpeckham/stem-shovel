import { relations } from "drizzle-orm";
import { account } from "./account";
import { accountMember } from "./accountMember";
import { project } from "./project";
import { shareLink } from "./shareLink";
import { song } from "./song";
import { songDocVersion } from "./songDocVersion";
import { stem } from "./stem";
import { user } from "./user";

// All relations live here so table files only import their foreign-key
// targets (a DAG) instead of importing each other back for `many()`.

export const accountRelations = relations(account, ({ many }) => ({
	members: many(accountMember),
	projects: many(project),
}));

export const accountMemberRelations = relations(accountMember, ({ one }) => ({
	account: one(account, { fields: [accountMember.accountId], references: [account.id] }),
	user: one(user, { fields: [accountMember.userId], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
	account: one(account, { fields: [project.accountId], references: [account.id] }),
	creator: one(user, { fields: [project.createdBy], references: [user.id] }),
	songs: many(song),
}));

export const songRelations = relations(song, ({ one, many }) => ({
	account: one(account, { fields: [song.accountId], references: [account.id] }),
	project: one(project, { fields: [song.projectId], references: [project.id] }),
	creator: one(user, { fields: [song.createdBy], references: [user.id] }),
	stems: many(stem),
	shareLinks: many(shareLink),
	docVersions: many(songDocVersion),
}));

export const stemRelations = relations(stem, ({ one }) => ({
	account: one(account, { fields: [stem.accountId], references: [account.id] }),
	song: one(song, { fields: [stem.songId], references: [song.id] }),
	uploader: one(user, { fields: [stem.uploadedBy], references: [user.id] }),
}));

export const shareLinkRelations = relations(shareLink, ({ one }) => ({
	song: one(song, { fields: [shareLink.songId], references: [song.id] }),
	creator: one(user, { fields: [shareLink.createdBy], references: [user.id] }),
}));

export const userRelations = relations(user, ({ many }) => ({
	memberships: many(accountMember),
	uploadedStems: many(stem),
}));

export const songDocVersionRelations = relations(songDocVersion, ({ one }) => ({
	song: one(song, { fields: [songDocVersion.songId], references: [song.id] }),
	author: one(user, { fields: [songDocVersion.createdBy], references: [user.id] }),
}));
