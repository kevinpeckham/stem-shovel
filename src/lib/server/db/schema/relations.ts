import { relations } from "drizzle-orm";
import { account } from "./account";
import { aiRequest } from "./aiRequest";
import { accountMember } from "./accountMember";
import { authAccount } from "./authAccount";
import { bugReport } from "./bugReport";
import { comment } from "./comment";
import { demo } from "./demo";
import { invitation } from "./invitation";
import { inviteCode } from "./inviteCode";
import { project } from "./project";
import { session } from "./session";
import { shareLink } from "./shareLink";
import { song } from "./song";
import { songDocVersion } from "./songDocVersion";
import { userDoc } from "./userDoc";
import { userDocVersion } from "./userDocVersion";
import { stem } from "./stem";
import { user } from "./user";

// All relations live here so table files only import their foreign-key
// targets (a DAG) instead of importing each other back for `many()`.

export const accountRelations = relations(account, ({ many }) => ({
	members: many(accountMember),
	projects: many(project),
	invitations: many(invitation),
	inviteCodes: many(inviteCode),
}));

export const inviteCodeRelations = relations(inviteCode, ({ one }) => ({
	account: one(account, { fields: [inviteCode.accountId], references: [account.id] }),
	creator: one(user, { fields: [inviteCode.createdBy], references: [user.id] }),
}));

export const aiRequestRelations = relations(aiRequest, ({ one }) => ({
	user: one(user, { fields: [aiRequest.userId], references: [user.id] }),
	song: one(song, { fields: [aiRequest.songId], references: [song.id] }),
}));

export const bugReportRelations = relations(bugReport, ({ one }) => ({
	reporter: one(user, { fields: [bugReport.userId], references: [user.id] }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	account: one(account, { fields: [invitation.accountId], references: [account.id] }),
	inviter: one(user, { fields: [invitation.invitedBy], references: [user.id] }),
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
	demos: many(demo),
	comments: many(comment),
	shareLinks: many(shareLink),
	docVersions: many(songDocVersion),
}));

export const commentRelations = relations(comment, ({ one }) => ({
	song: one(song, { fields: [comment.songId], references: [song.id] }),
	author: one(user, { fields: [comment.userId], references: [user.id] }),
}));

export const demoRelations = relations(demo, ({ one }) => ({
	account: one(account, { fields: [demo.accountId], references: [account.id] }),
	song: one(song, { fields: [demo.songId], references: [song.id] }),
	uploader: one(user, { fields: [demo.uploadedBy], references: [user.id] }),
}));

export const stemRelations = relations(stem, ({ one }) => ({
	account: one(account, { fields: [stem.accountId], references: [account.id] }),
	song: one(song, { fields: [stem.songId], references: [song.id] }),
	uploader: one(user, { fields: [stem.uploadedBy], references: [user.id] }),
}));

export const shareLinkRelations = relations(shareLink, ({ one }) => ({
	account: one(account, { fields: [shareLink.accountId], references: [account.id] }),
	project: one(project, { fields: [shareLink.projectId], references: [project.id] }),
	song: one(song, { fields: [shareLink.songId], references: [song.id] }),
	creator: one(user, { fields: [shareLink.createdBy], references: [user.id] }),
}));

export const userRelations = relations(user, ({ many }) => ({
	memberships: many(accountMember),
	uploadedStems: many(stem),
	sessions: many(session),
	authAccounts: many(authAccount),
}));

export const userDocRelations = relations(userDoc, ({ one, many }) => ({
	editor: one(user, { fields: [userDoc.updatedBy], references: [user.id] }),
	versions: many(userDocVersion),
}));

export const userDocVersionRelations = relations(userDocVersion, ({ one }) => ({
	doc: one(userDoc, { fields: [userDocVersion.docId], references: [userDoc.id] }),
	author: one(user, { fields: [userDocVersion.createdBy], references: [user.id] }),
}));

export const songDocVersionRelations = relations(songDocVersion, ({ one }) => ({
	song: one(song, { fields: [songDocVersion.songId], references: [song.id] }),
	author: one(user, { fields: [songDocVersion.createdBy], references: [user.id] }),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const authAccountRelations = relations(authAccount, ({ one }) => ({
	user: one(user, { fields: [authAccount.userId], references: [user.id] }),
}));
