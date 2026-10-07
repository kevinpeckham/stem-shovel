import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asMemberOf,
	asOutsider,
	asOwnerOf,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	data,
	email,
	givenRow,
	lifecycle,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the project remote functions: the account comes from the
 * project row (memberOf → requireEditor), a restricted project admits only
 * the members added to it, and deleting takes an owner or admin.
 */
const projects = await import("./projects.remote");

const PROJECT = fakeId("proj-one");
const INVITATION = fakeId("invite-one");
const MEMBER = fakeId("user-three");
const SLUG = "slug-acct-one";

beforeEach(() => {
	resetRemoteMocks();
	givenRow("project", { accountId: ACCOUNT });
	data.projectSlugs.mockResolvedValue({ account: "band", project: "album", projectName: "Album" });
});

interface Case {
	name: string;
	fn: object;
	input: unknown;
	/** The status a signed-out caller gets: 404 from memberOf, 401 where requireUser comes first. */
	anon?: number;
	arrange: () => unknown;
	/** The data function (or the projectLifecycle one) the handler must reach, scoped by the account. */
	dataFn: string | null;
	lifecycleFn?: string;
	args: unknown[];
	/** The answer, or the redirect thrown on success. */
	outcome: Record<string, unknown>;
}

describe("functions gated by the project's account", () => {
	const cases: Case[] = [
		{
			name: "updateProject",
			fn: projects.updateProject,
			input: { id: PROJECT, name: "Album", slug: "album" },
			arrange: () => data.updateProject.mockResolvedValue({ ok: true }),
			dataFn: "updateProject",
			args: [ACCOUNT, PROJECT, { name: "Album", slug: "album", type: "other" }],
			outcome: redirected("/band/projects/album"),
		},
		{
			name: "archiveProject",
			fn: projects.archiveProject,
			input: { id: PROJECT },
			arrange: () => lifecycle.setProjectStatus.mockResolvedValue(true),
			dataFn: null,
			lifecycleFn: "setProjectStatus",
			args: [ACCOUNT, PROJECT, "archived"],
			outcome: redirected(`/${SLUG}/projects`),
		},
		{
			name: "restoreProject",
			fn: projects.restoreProject,
			input: { id: PROJECT },
			arrange: () => lifecycle.setProjectStatus.mockResolvedValue(true),
			dataFn: null,
			lifecycleFn: "setProjectStatus",
			args: [ACCOUNT, PROJECT, "active"],
			outcome: redirected("/band/projects/album"),
		},
		{
			name: "setProjectRestricted",
			fn: projects.setProjectRestricted,
			input: { id: PROJECT, restricted: "true" },
			arrange: () => data.setProjectRestricted.mockResolvedValue(true),
			dataFn: "setProjectRestricted",
			args: [ACCOUNT, PROJECT, true],
			outcome: { restricted: true },
		},
		{
			name: "inviteProjectViewer",
			fn: projects.inviteProjectViewer,
			input: { projectId: PROJECT, email: "viewer@example.com" },
			anon: 401,
			arrange: () =>
				data.createInvitation.mockResolvedValue({
					email: "viewer@example.com",
					token: "t".repeat(32),
					role: "viewer",
				}),
			dataFn: "createInvitation",
			args: [ACCOUNT, USER, "viewer@example.com", "viewer", PROJECT],
			outcome: { sent: "viewer@example.com" },
		},
		{
			name: "revokeProjectInvitation",
			fn: projects.revokeProjectInvitation,
			input: { id: INVITATION },
			arrange: () => {
				data.invitationProject.mockResolvedValue({ projectId: PROJECT });
				data.revokeInvitation.mockResolvedValue(true);
			},
			dataFn: "revokeInvitation",
			args: [ACCOUNT, INVITATION],
			outcome: { revoked: true },
		},
		{
			name: "addProjectMember",
			fn: projects.addProjectMember,
			input: { projectId: PROJECT, userId: MEMBER },
			arrange: () => data.addProjectMember.mockResolvedValue({ ok: true, already: false }),
			dataFn: "addProjectMember",
			args: [ACCOUNT, PROJECT, MEMBER, USER],
			outcome: { added: true },
		},
		{
			name: "removeProjectPerson",
			fn: projects.removeProjectPerson,
			input: { projectId: PROJECT, userId: MEMBER },
			arrange: () => data.removeProjectPerson.mockResolvedValue(true),
			dataFn: "removeProjectPerson",
			args: [ACCOUNT, PROJECT, MEMBER],
			outcome: { removed: true },
		},
		{
			name: "reorderSongs",
			fn: projects.reorderSongs,
			input: { projectId: PROJECT, ids: [fakeId("song-b"), fakeId("song-a")] },
			arrange: () => data.reorderSongs.mockResolvedValue([fakeId("song-b"), fakeId("song-a")]),
			dataFn: "reorderSongs",
			args: [ACCOUNT, PROJECT, [fakeId("song-b"), fakeId("song-a")]],
			outcome: { ids: [fakeId("song-b"), fakeId("song-a")] },
		},
	];
	for (const c of cases) {
		const target = () => (c.dataFn ? data[c.dataFn] : lifecycle[c.lifecycleFn!]);
		const run = () => {
			c.arrange();
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it(`${c.anon ?? 404} signed out`, async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(c.anon ?? 404));
				expect(target()).not.toHaveBeenCalled();
			});
			it("404 for a member of another account", async () => {
				asOutsider();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(target()).not.toHaveBeenCalled();
			});
			it("404 for a viewer of the account", async () => {
				asViewerOf(ACCOUNT);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(target()).not.toHaveBeenCalled();
			});
			it("404 for a member not added to a restricted project", async () => {
				asEditorOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(target()).not.toHaveBeenCalled();
			});
			it("a member added to the restricted project passes", async () => {
				asEditorOf(ACCOUNT);
				data.projectRestricted.mockResolvedValue(true);
				data.projectRoleOf.mockResolvedValue("member");
				await run().catch(() => undefined);
				expect(target()).toHaveBeenCalledWith(...c.args);
			});
			it("a member reaches the data layer scoped by the project's account", async () => {
				asEditorOf(ACCOUNT);
				if ("status" in c.outcome) {
					await expect(run()).rejects.toMatchObject(c.outcome);
				} else {
					await expect(run()).resolves.toEqual(c.outcome);
				}
				expect(target()).toHaveBeenCalledWith(...c.args);
			});
		});
	}
	it("inviteProjectViewer emails the link to the address invited", async () => {
		asEditorOf(ACCOUNT);
		data.createInvitation.mockResolvedValue({
			email: "viewer@example.com",
			token: "t".repeat(32),
			role: "viewer",
		});
		await call(projects.inviteProjectViewer, { projectId: PROJECT, email: "viewer@example.com" });
		expect(email.sendInvitationEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "viewer@example.com", role: "viewer", projectName: "Album" }),
		);
	});
});

describe("createProject", () => {
	const input = { accountId: ACCOUNT, name: "Demos" };
	beforeEach(() => data.createProject.mockResolvedValue({ id: PROJECT, slug: "demos" }));
	it("404 signed out", async () => {
		asSignedOut();
		await expect(call(projects.createProject, input)).rejects.toMatchObject(httpError(404));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(projects.createProject, input)).rejects.toMatchObject(httpError(404));
		expect(data.createProject).not.toHaveBeenCalled();
	});
	it("a member creates it in their account and lands on it", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(projects.createProject, input)).rejects.toMatchObject(
			redirected(`/${SLUG}/projects/demos`),
		);
		expect(data.createProject).toHaveBeenCalledWith(ACCOUNT, USER, "Demos");
	});
});

describe("deleteProject", () => {
	const input = { id: PROJECT };
	beforeEach(() => lifecycle.deleteProject.mockResolvedValue("deleted"));
	it("404 signed out", async () => {
		asSignedOut();
		await expect(call(projects.deleteProject, input)).rejects.toMatchObject(httpError(404));
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(projects.deleteProject, input)).rejects.toMatchObject(httpError(404));
	});
	it("403 for a plain member", async () => {
		asMemberOf(ACCOUNT, "member");
		await expect(call(projects.deleteProject, input)).rejects.toMatchObject(httpError(403));
		expect(lifecycle.deleteProject).not.toHaveBeenCalled();
	});
	for (const [who, as] of [
		["an admin", asAdminOf],
		["an owner", asOwnerOf],
	] as const) {
		it(`${who} deletes it and lands on the list`, async () => {
			as(ACCOUNT);
			await expect(call(projects.deleteProject, input)).rejects.toMatchObject(
				redirected(`/${SLUG}/projects`),
			);
			expect(lifecycle.deleteProject).toHaveBeenCalledWith(ACCOUNT, PROJECT);
		});
	}
	it("409 while the project is still active", async () => {
		asOwnerOf(ACCOUNT);
		lifecycle.deleteProject.mockResolvedValue("active");
		await expect(call(projects.deleteProject, input)).rejects.toMatchObject(httpError(409));
	});
});
