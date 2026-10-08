import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	fakeId,
	httpError,
	type FakeRequestEvent,
} from "../../../../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../../../../tests/helpers/fakeServerModules";
import { callRoute } from "../../../../../../tests/helpers/fakeApiEvent";

/**
 * Every song's documentation PDF in one zip: viewable like the project page
 * (public by URL, share codes, restricted projects), with the songs the
 * viewer may not see left out. The documentation module (pdfkit, fflate) is
 * stubbed.
 */
const h = vi.hoisted(() => ({ projectDocumentationZip: vi.fn() }));
vi.mock("#lib/server/documentation.js", () => h);

const { GET } = await import("./+server");

const PROJECT = fakeId("proj-one");
const SONG = fakeId("song-one");
const project = {
	id: PROJECT,
	accountId: ACCOUNT,
	name: "Spring Set",
	isPrivate: false,
	isRestricted: false,
};
const zip = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00]);
const request = (query = "") =>
	new Request(`http://localhost/api/projects/${PROJECT}/documentation.zip${query}`);
const get = (locals: FakeRequestEvent = asSignedOut(), query = "") =>
	callRoute(GET, locals, request(query), { id: PROJECT });
/** The `includeSong` filter the route hands the zip builder, from its last call. */
const includeSong = () => {
	const [, , options] = h.projectDocumentationZip.mock.lastCall as [
		string,
		string,
		{ includeSong: (s: unknown) => boolean },
	];
	return options.includeSong;
};

beforeEach(() => {
	resetRemoteMocks();
	data.projectViewRow.mockResolvedValue(project);
	h.projectDocumentationZip.mockResolvedValue(zip);
});

describe("GET /api/projects/[id]/documentation.zip", () => {
	it("404 for an unknown project", async () => {
		data.projectViewRow.mockResolvedValue(null);
		await expect(get()).rejects.toMatchObject(httpError(404));
		expect(data.projectViewRow).toHaveBeenCalledWith(PROJECT);
		expect(h.projectDocumentationZip).not.toHaveBeenCalled();
	});
	it("a public project downloads for anyone, signed out, without a role lookup", async () => {
		const res = await get(asSignedOut());
		expect(res.status).toBe(200);
		expect(data.projectRoleOf).not.toHaveBeenCalled();
		expect(data.openShareLinks).toHaveBeenCalledWith([]);
	});
	it("403 for a private project to a stranger, signed in or not", async () => {
		data.projectViewRow.mockResolvedValue({ ...project, isPrivate: true });
		await expect(get(asSignedOut())).rejects.toMatchObject(httpError(403));
		await expect(get(asOutsider())).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, OTHER_USER);
		expect(h.projectDocumentationZip).not.toHaveBeenCalled();
	});
	it("a private project downloads for the account's viewers and for a project viewer from outside", async () => {
		data.projectViewRow.mockResolvedValue({ ...project, isPrivate: true });
		expect((await get(asViewerOf(ACCOUNT))).status).toBe(200);
		data.projectRoleOf.mockResolvedValue("viewer");
		expect((await get(asOutsider())).status).toBe(200);
	});
	it("a restricted project is closed to a member not added to it, open to one who was and to an admin", async () => {
		data.projectViewRow.mockResolvedValue({ ...project, isRestricted: true });
		await expect(get(asEditorOf(ACCOUNT))).rejects.toMatchObject(httpError(403));
		expect(data.projectRoleOf).toHaveBeenCalledWith(PROJECT, USER);
		data.projectRoleOf.mockResolvedValue("member");
		expect((await get(asEditorOf(ACCOUNT))).status).toBe(200);
		data.projectRoleOf.mockResolvedValue(null);
		expect((await get(asAdminOf(ACCOUNT))).status).toBe(200);
	});
	it("a share code in the query or the cookie opens a private project to a visitor", async () => {
		data.projectViewRow.mockResolvedValue({ ...project, isPrivate: true });
		data.openShareLinks.mockResolvedValue([{ code: "CODE", projectId: PROJECT, songId: null }]);
		expect((await get(asSignedOut(), "?share=CODE")).status).toBe(200);
		expect(data.openShareLinks).toHaveBeenCalledWith(["CODE"]);
		const visitor = asSignedOut();
		visitor.cookies.get.mockReturnValue("OLD,CODE");
		expect((await get(visitor)).status).toBe(200);
		expect(data.openShareLinks).toHaveBeenLastCalledWith(["OLD", "CODE"]);
	});
	it("a song-only share code does not open the project", async () => {
		data.projectViewRow.mockResolvedValue({ ...project, isPrivate: true });
		data.openShareLinks.mockResolvedValue([{ code: "CODE", projectId: null, songId: SONG }]);
		await expect(get(asSignedOut(), "?share=CODE")).rejects.toMatchObject(httpError(403));
	});
	it("404 when no song has lyrics, a chart or notes", async () => {
		h.projectDocumentationZip.mockResolvedValue(null);
		await expect(get()).rejects.toMatchObject(httpError(404));
	});
	it("the zip comes back as an attachment named after the project, uncached", async () => {
		const res = await get(asEditorOf(ACCOUNT));
		expect(res.status).toBe(200);
		expect(h.projectDocumentationZip).toHaveBeenCalledWith(ACCOUNT, PROJECT, {
			includeSong: expect.any(Function),
		});
		expect(res.headers.get("content-type")).toBe("application/zip");
		expect(res.headers.get("content-length")).toBe("5");
		expect(res.headers.get("content-disposition")).toBe(
			`attachment; filename="Spring Set documentation.zip"; filename*=UTF-8''Spring%20Set%20documentation.zip`,
		);
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(new Uint8Array(await res.arrayBuffer())).toEqual(zip);
	});
	it("a visitor's zip leaves out the private songs of a public project; a member's keeps them", async () => {
		await get(asSignedOut());
		const forVisitor = includeSong();
		expect(forVisitor({ id: SONG, projectId: PROJECT, isPrivate: false })).toBe(true);
		expect(forVisitor({ id: SONG, projectId: PROJECT, isPrivate: true })).toBe(false);
		await get(asEditorOf(ACCOUNT));
		expect(includeSong()({ id: SONG, projectId: PROJECT, isPrivate: true })).toBe(true);
	});
	it("a share code for one song lets its holder have that song's PDF alone", async () => {
		data.openShareLinks.mockResolvedValue([{ code: "CODE", projectId: null, songId: SONG }]);
		await get(asSignedOut(), "?share=CODE");
		const forHolder = includeSong();
		expect(forHolder({ id: SONG, projectId: PROJECT, isPrivate: true })).toBe(true);
		expect(forHolder({ id: fakeId("song-two"), projectId: PROJECT, isPrivate: true })).toBe(false);
	});
});
