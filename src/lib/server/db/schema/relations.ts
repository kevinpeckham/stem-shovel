import { relations } from "drizzle-orm";
import { account } from "./account";
import { aiRequest } from "./aiRequest";
import { artist } from "./artist";
import { artistMember } from "./artistMember";
import { songCredit } from "./songCredit";
import { supportRequest } from "./supportRequest";
import { auditLog } from "./auditLog";
import { accountMember } from "./accountMember";
import { authAccount } from "./authAccount";
import { bugReport } from "./bugReport";
import { bugReportVote } from "./bugReportVote";
import { comment } from "./comment";
import { demo } from "./demo";
import { idea } from "./idea";
import { recording } from "./recording";
import { invitation } from "./invitation";
import { inviteCode } from "./inviteCode";
import { project } from "./project";
import { projectMember } from "./projectMember";
import { notification } from "./notification";
import { notificationPreference } from "./notificationPreference";
import { session } from "./session";
import { shareLink } from "./shareLink";
import { song } from "./song";
import { songDocVersion } from "./songDocVersion";
import { userDoc } from "./userDoc";
import { userDocVersion } from "./userDocVersion";
import { stem } from "./stem";
import { twoFactor } from "./twoFactor";
import { passkey } from "./passkey";
import { user } from "./user";
import { waitlistSignup } from "./waitlistSignup";

// All relations live here so table files only import their foreign-key
// targets (a DAG) instead of importing each other back for `many()`.

export const accountRelations = relations(account, ({ many }) => ({
	members: many(accountMember),
	projects: many(project),
	invitations: many(invitation),
	inviteCodes: many(inviteCode),
	recordings: many(recording),
	ideas: many(idea),
	artists: many(artist),
}));

export const inviteCodeRelations = relations(inviteCode, ({ one }) => ({
	account: one(account, { fields: [inviteCode.accountId], references: [account.id] }),
	creator: one(user, { fields: [inviteCode.createdBy], references: [user.id] }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
	user: one(user, { fields: [auditLog.userId], references: [user.id] }),
	account: one(account, { fields: [auditLog.accountId], references: [account.id] }),
}));

export const aiRequestRelations = relations(aiRequest, ({ one }) => ({
	user: one(user, { fields: [aiRequest.userId], references: [user.id] }),
	song: one(song, { fields: [aiRequest.songId], references: [song.id] }),
}));

export const bugReportRelations = relations(bugReport, ({ one, many }) => ({
	reporter: one(user, { fields: [bugReport.userId], references: [user.id] }),
	votes: many(bugReportVote),
}));

export const bugReportVoteRelations = relations(bugReportVote, ({ one }) => ({
	report: one(bugReport, { fields: [bugReportVote.reportId], references: [bugReport.id] }),
	user: one(user, { fields: [bugReportVote.userId], references: [user.id] }),
}));

export const supportRequestRelations = relations(supportRequest, ({ one }) => ({
	sender: one(user, { fields: [supportRequest.userId], references: [user.id] }),
	account: one(account, { fields: [supportRequest.accountId], references: [account.id] }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
	account: one(account, { fields: [invitation.accountId], references: [account.id] }),
	inviter: one(user, { fields: [invitation.invitedBy], references: [user.id] }),
	project: one(project, { fields: [invitation.projectId], references: [project.id] }),
}));

export const accountMemberRelations = relations(accountMember, ({ one }) => ({
	account: one(account, { fields: [accountMember.accountId], references: [account.id] }),
	user: one(user, { fields: [accountMember.userId], references: [user.id] }),
}));

export const projectRelations = relations(project, ({ one, many }) => ({
	account: one(account, { fields: [project.accountId], references: [account.id] }),
	creator: one(user, { fields: [project.createdBy], references: [user.id] }),
	songs: many(song),
	people: many(projectMember),
}));

export const notificationRelations = relations(notification, ({ one }) => ({
	user: one(user, { fields: [notification.userId], references: [user.id] }),
	account: one(account, { fields: [notification.accountId], references: [account.id] }),
}));

export const notificationPreferenceRelations = relations(notificationPreference, ({ one }) => ({
	user: one(user, { fields: [notificationPreference.userId], references: [user.id] }),
}));

export const projectMemberRelations = relations(projectMember, ({ one }) => ({
	project: one(project, { fields: [projectMember.projectId], references: [project.id] }),
	user: one(user, { fields: [projectMember.userId], references: [user.id] }),
	adder: one(user, { fields: [projectMember.addedBy], references: [user.id] }),
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
	credits: many(songCredit),
}));

export const artistRelations = relations(artist, ({ one, many }) => ({
	account: one(account, { fields: [artist.accountId], references: [account.id] }),
	credits: many(songCredit),
	members: many(artistMember),
}));

export const artistMemberRelations = relations(artistMember, ({ one }) => ({
	artist: one(artist, { fields: [artistMember.artistId], references: [artist.id] }),
}));

export const songCreditRelations = relations(songCredit, ({ one }) => ({
	song: one(song, { fields: [songCredit.songId], references: [song.id] }),
	artist: one(artist, { fields: [songCredit.artistId], references: [artist.id] }),
}));

export const commentRelations = relations(comment, ({ one }) => ({
	song: one(song, { fields: [comment.songId], references: [song.id] }),
	author: one(user, { fields: [comment.userId], references: [user.id] }),
}));

export const ideaRelations = relations(idea, ({ one, many }) => ({
	account: one(account, { fields: [idea.accountId], references: [account.id] }),
	creator: one(user, { fields: [idea.createdBy], references: [user.id] }),
	takes: many(recording),
}));

export const recordingRelations = relations(recording, ({ one }) => ({
	account: one(account, { fields: [recording.accountId], references: [account.id] }),
	recorder: one(user, { fields: [recording.recordedBy], references: [user.id] }),
	idea: one(idea, { fields: [recording.ideaId], references: [idea.id] }),
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
	projectMemberships: many(projectMember),
	notifications: many(notification),
	uploadedStems: many(stem),
	sessions: many(session),
	authAccounts: many(authAccount),
	twoFactors: many(twoFactor),
	passkeys: many(passkey),
}));

export const passkeyRelations = relations(passkey, ({ one }) => ({
	user: one(user, { fields: [passkey.userId], references: [user.id] }),
}));

export const twoFactorRelations = relations(twoFactor, ({ one }) => ({
	user: one(user, { fields: [twoFactor.userId], references: [user.id] }),
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

export const waitlistSignupRelations = relations(waitlistSignup, ({ one }) => ({
	inviteCode: one(inviteCode, {
		fields: [waitlistSignup.inviteCodeId],
		references: [inviteCode.id],
	}),
}));
