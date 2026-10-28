import { beforeEach, describe, expect, test } from "vite-plus/test";
import { MAX_EVENT_PHOTOS } from "#lib/constants/eventFiles.js";
import { blob, callsTo, cascade, fake, reset } from "../../../tests/helpers/fakeDataLayer";

/** A show's or practice's poster and photos (docs/band-plan.md, "Posters, pictures and video"). */
const {
	accountStorageBytes,
	createEventFile,
	deleteEvent,
	deleteEventFile,
	eventFileByShareCode,
	eventKindOf,
	eventPage,
	failEventFile,
	findEventFileById,
	findUploadingEventFile,
	listEvents,
	markEventFileReady,
	recordEventFileUrl,
	updateEventFileCaption,
} = await import("./data");

const A = "acct-one____________";
const B = "acct-two____________";
const U = "user-one____________";
const at = (iso: string) => new Date(iso);

const ev = (id: string, accountId: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId,
	kind: "show",
	title: "",
	status: "planned",
	startsOn: "2026-11-14",
	startsAt: "",
	endsAt: "",
	loadInAt: "",
	soundCheckAt: "",
	venue: "",
	address: "",
	city: "",
	mapUrl: "",
	venueNotes: "",
	notes: "",
	createdBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	updatedAt: at("2026-10-01T00:00:00Z"),
	...over,
});
const file = (
	id: string,
	eventId: string | null,
	kind: "poster" | "photo",
	over: Record<string, unknown> = {},
) => ({
	id,
	accountId: A,
	eventId,
	kind,
	status: "ready",
	url: `https://blob/${id}.png`,
	pathname: `accounts/${A}/events/${eventId}/files/${id}.png`,
	filename: `${id}.png`,
	contentType: "image/png",
	sizeBytes: 1000,
	width: null,
	height: null,
	caption: "",
	sortOrder: 0,
	thumbnailUrl: null,
	thumbnailPathname: null,
	shareCode: `code-${id}`,
	uploadedBy: U,
	createdAt: at("2026-10-01T00:00:00Z"),
	...over,
});

describe("createEventFile", () => {
	beforeEach(() => reset({ event: [ev("e1", A), ev("e2", B, { kind: "practice" })] }));
	test("a poster: an uploading row under the event, its type from the extension, a share code", async () => {
		const row = await createEventFile({
			accountId: A,
			userId: U,
			eventId: "e1",
			kind: "poster",
			filename: "Release Show.PDF",
			sizeBytes: 300_000,
		});
		expect(row).toMatchObject({
			accountId: A,
			eventId: "e1",
			kind: "poster",
			status: "uploading",
			url: "",
			filename: "Release Show.PDF",
			contentType: "application/pdf",
			sizeBytes: 300_000,
			sortOrder: 0,
			uploadedBy: U,
		});
		if (!row || row === "full") throw new Error("expected a row");
		expect(row.pathname).toBe(`accounts/${A}/events/e1/files/${row.id}.pdf`);
		expect(row.shareCode).toHaveLength(16);
	});
	test("null for an event of another account", async () => {
		expect(
			await createEventFile({
				accountId: A,
				userId: U,
				eventId: "e2",
				kind: "photo",
				filename: "x.jpg",
				sizeBytes: 1,
			}),
		).toBeNull();
		expect(callsTo("insert", "event_file")).toEqual([]);
	});
	test("a photo goes last in the gallery, and the gallery is full at the cap (failed rows aside)", async () => {
		reset({
			event: [ev("e1", A)],
			eventFile: [
				file("p1", "e1", "photo", { sortOrder: 4 }),
				file("p2", "e1", "photo", { sortOrder: 9, status: "failed" }),
				file("p3", "e1", "poster", { sortOrder: 20 }),
			],
		});
		const row = await createEventFile({
			accountId: A,
			userId: U,
			eventId: "e1",
			kind: "photo",
			filename: "crowd.jpg",
			sizeBytes: 5,
		});
		expect(row).toMatchObject({ sortOrder: 5, contentType: "image/jpeg" });
		reset({
			event: [ev("e1", A)],
			eventFile: Array.from({ length: MAX_EVENT_PHOTOS }, (_, i) =>
				file(`p${i}`, "e1", "photo", { sortOrder: i }),
			),
		});
		const input = {
			accountId: A,
			userId: U,
			eventId: "e1",
			kind: "photo" as const,
			filename: "one-more.jpg",
			sizeBytes: 5,
		};
		expect(await createEventFile(input)).toBe("full");
		// A poster is never "full": it replaces the old one at ready.
		expect(await createEventFile({ ...input, kind: "poster" })).toMatchObject({ kind: "poster" });
	});
});

describe("lookups", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A, { kind: "practice" })],
			eventFile: [
				file("f1", "e1", "photo", { status: "uploading" }),
				file("f2", "e1", "poster", { contentType: "application/pdf", filename: "Poster.pdf" }),
				file("f3", "e1", "photo", { accountId: B }),
			],
		}),
	);
	test("findEventFileById and findUploadingEventFile are scoped by the account", async () => {
		expect(await findEventFileById(A, "f1")).toMatchObject({ id: "f1", kind: "photo" });
		expect(await findEventFileById(A, "f3")).toBeNull();
		const f1 = fake.rows("eventFile")[0] as { pathname: string };
		expect(await findUploadingEventFile(A, f1.pathname)).toMatchObject({ id: "f1" });
		expect(await findUploadingEventFile(B, f1.pathname)).toBeNull();
		const f2 = fake.rows("eventFile")[1] as { pathname: string };
		expect(await findUploadingEventFile(A, f2.pathname)).toBeNull();
	});
	test("eventKindOf: the account's event's kind, or null", async () => {
		expect(await eventKindOf(A, "e1")).toBe("practice");
		expect(await eventKindOf(B, "e1")).toBeNull();
	});
	test("recordEventFileUrl fills an uploading row only", async () => {
		const [f1, f2] = fake.rows("eventFile") as { pathname: string; url: string }[];
		await recordEventFileUrl(f1.pathname, "https://store/f1.png");
		await recordEventFileUrl(f2.pathname, "https://store/other.png");
		expect(fake.rows("eventFile").map((r) => r.url)).toEqual([
			"https://store/f1.png",
			"https://blob/f2.png",
			"https://blob/f3.png",
		]);
	});
	test("eventFileByShareCode: a ready file with its stored type; not one still uploading", async () => {
		expect(await eventFileByShareCode("code-f2")).toEqual({
			url: "https://blob/f2.png",
			filename: "Poster.pdf",
			contentType: "application/pdf",
			kind: "poster",
		});
		expect(await eventFileByShareCode("code-f1")).toBeNull();
		expect(await eventFileByShareCode("nope")).toBeNull();
	});
});

describe("markEventFileReady", () => {
	const ready = {
		url: "https://store/new.png",
		thumbnailUrl: "https://store/new.thumb.webp",
		thumbnailPathname: "new.thumb.webp",
		width: 1200,
		height: 1800,
	};
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", A)],
			eventFile: [
				file("old", "e1", "poster", {
					thumbnailUrl: "https://blob/old.webp",
					thumbnailPathname: "old.webp",
				}),
				file("other", "e2", "poster"),
				file("photo", "e1", "photo"),
				file("new", "e1", "poster", { status: "uploading", url: "" }),
				file("pic", "e1", "photo", { status: "uploading", url: "" }),
			],
		}),
	);
	test("a new poster is ready with its size and thumbnail; the event's earlier poster goes, its blobs named", async () => {
		const out = await markEventFileReady(A, "new", ready);
		expect(out?.file).toMatchObject({
			id: "new",
			kind: "poster",
			status: "ready",
			url: ready.url,
			thumbnailUrl: ready.thumbnailUrl,
			width: 1200,
			height: 1800,
			shareCode: "code-new",
		});
		expect(out?.file).not.toHaveProperty("pathname");
		expect(out?.replaced).toEqual([
			{
				url: "https://blob/old.png",
				pathname: `accounts/${A}/events/e1/files/old.png`,
				thumbnailUrl: "https://blob/old.webp",
				thumbnailPathname: "old.webp",
			},
		]);
		expect(fake.rows("eventFile").map((r) => r.id)).toEqual(["other", "photo", "new", "pic"]);
	});
	test("a photo replaces nothing", async () => {
		const out = await markEventFileReady(A, "pic", ready);
		expect(out?.replaced).toEqual([]);
		expect(fake.rows("eventFile")).toHaveLength(5);
	});
	test("null for another account's file", async () => {
		expect(await markEventFileReady(B, "new", ready)).toBeNull();
		expect(callsTo("delete", "event_file")).toEqual([]);
	});
});

describe("caption, fail and delete", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A)],
			eventFile: [
				file("f1", "e1", "photo", {
					thumbnailUrl: "https://blob/f1.webp",
					thumbnailPathname: "f1.webp",
				}),
				file("f2", "e1", "photo", { accountId: B }),
			],
		}),
	);
	test("updateEventFileCaption: the row with its caption; null for another account's", async () => {
		expect(await updateEventFileCaption(A, "f1", "The encore")).toMatchObject({
			id: "f1",
			caption: "The encore",
		});
		expect(await updateEventFileCaption(A, "f2", "x")).toBeNull();
	});
	test("failEventFile removes the row and whatever landed", async () => {
		await failEventFile(A, "f1");
		expect(fake.rows("eventFile").map((r) => r.id)).toEqual(["f2"]);
		expect(blob.deleteBlobs).toHaveBeenCalledWith(["https://blob/f1.png", "https://blob/f1.webp"]);
		await failEventFile(A, "f2");
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
	});
	test("deleteEventFile removes the row and names its blobs for the caller; null for another account's", async () => {
		expect(await deleteEventFile(A, "f1")).toEqual({
			url: "https://blob/f1.png",
			pathname: `accounts/${A}/events/e1/files/f1.png`,
			thumbnailUrl: "https://blob/f1.webp",
			thumbnailPathname: "f1.webp",
		});
		expect(blob.deleteBlobs).not.toHaveBeenCalled();
		expect(await deleteEventFile(A, "f2")).toBeNull();
		expect(fake.rows("eventFile").map((r) => r.id)).toEqual(["f2"]);
	});
});

describe("the event's page, list and delete", () => {
	beforeEach(() =>
		reset({
			event: [ev("e1", A), ev("e2", A, { startsOn: "2026-12-01" }), ev("e3", B)],
			eventFile: [
				file("old", "e1", "poster", { createdAt: at("2026-10-02T00:00:00Z") }),
				file("new", "e1", "poster", {
					createdAt: at("2026-10-05T00:00:00Z"),
					thumbnailUrl: "https://blob/new.webp",
				}),
				file("up", "e1", "poster", { status: "uploading", createdAt: at("2026-10-09T00:00:00Z") }),
				file("b", "e1", "photo", { sortOrder: 1 }),
				file("a2", "e1", "photo", { sortOrder: 0, createdAt: at("2026-10-03T00:00:00Z") }),
				file("a1", "e1", "photo", { sortOrder: 0, createdAt: at("2026-10-02T00:00:00Z") }),
				file("x", "e1", "photo", { status: "uploading" }),
				file("other", "e3", "poster", { accountId: B }),
			],
		}),
	);
	test("eventPage: the newest ready poster and the ready photos in gallery order", async () => {
		const page = await eventPage(A, "e1");
		expect(page?.poster?.id).toBe("new");
		expect(page?.poster).toEqual({
			id: "new",
			kind: "poster",
			status: "ready",
			url: "https://blob/new.png",
			filename: "new.png",
			contentType: "image/png",
			sizeBytes: 1000,
			width: null,
			height: null,
			caption: "",
			sortOrder: 0,
			thumbnailUrl: "https://blob/new.webp",
			shareCode: "code-new",
			createdAt: at("2026-10-05T00:00:00Z"),
		});
		expect(page?.photos.map((p) => p.id)).toEqual(["a1", "a2", "b"]);
		const empty = await eventPage(A, "e2");
		expect(empty?.poster).toBeNull();
		expect(empty?.photos).toEqual([]);
	});
	test("listEvents carries each event's ready poster, newest first", async () => {
		const rows = await listEvents(A, "show");
		expect(rows.map((r) => [r.id, r.posterUrl, r.posterThumbnailUrl])).toEqual([
			["e1", "https://blob/new.png", "https://blob/new.webp"],
			["e2", null, null],
		]);
	});
	test("deleteEvent removes the event's files' blobs before the rows go", async () => {
		expect(await deleteEvent(A, "e1")).toBe(true);
		const urls = (blob.deleteBlobs.mock.calls as unknown as string[][][])[0]?.[0];
		expect(urls).toEqual(
			expect.arrayContaining([
				"https://blob/old.png",
				"https://blob/new.png",
				"https://blob/new.webp",
				"https://blob/a1.png",
			]),
		);
		expect(urls).not.toContain("https://blob/other.png");
		expect(cascade.deleteEventRows).toHaveBeenCalledWith(["e1"]);
		expect(await deleteEvent(B, "e1")).toBe(false);
		expect(blob.deleteBlobs).toHaveBeenCalledTimes(1);
	});
});

describe("storage", () => {
	test("an event's files count against the account's storage, failed ones aside", async () => {
		reset({
			eventFile: [
				file("f1", "e1", "photo", { sizeBytes: 1000 }),
				file("f2", "e1", "poster", { sizeBytes: 500, status: "uploading" }),
				file("f3", "e1", "photo", { sizeBytes: 9999, status: "failed" }),
				file("f4", "e9", "photo", { sizeBytes: 7777, accountId: B }),
			],
		});
		expect(await accountStorageBytes(A)).toBe(1500);
	});
});
