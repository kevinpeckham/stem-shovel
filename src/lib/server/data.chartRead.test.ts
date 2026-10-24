import { beforeEach, describe, expect, test } from "vite-plus/test";
import { fake, reset } from "../../../tests/helpers/fakeDataLayer";

const { chartReadOfFile, saveChartRead } = await import("./data");

/**
 * A score's stored read (docs/audio-engine.md, "The chart read is stored"):
 * only a ready notation PDF or image of the account has one, and a save
 * sets the read and whether a member corrected it.
 */
const file = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	accountId: "a1",
	projectId: "p1",
	songId: "sg1",
	kind: "pdf",
	status: "ready",
	isNotation: true,
	url: `https://blob/${id}.pdf`,
	filename: `${id}.pdf`,
	title: "",
	sizeBytes: 1000,
	chartRead: null,
	chartReadEdited: false,
	...over,
});
const row = (id: string) => fake.rows("songFile").find((r) => r.id === id);

describe("chartReadOfFile", () => {
	beforeEach(() =>
		reset({
			songFile: [
				file("f1", { chartRead: "m1 key C major: C" }),
				file("f2", { kind: "image", filename: "f2.png" }),
				file("f3", { isNotation: false }),
				file("f4", { status: "uploading" }),
				file("f5", { kind: "audio" }),
			],
		}),
	);

	test("a ready notation PDF or image, with its read", async () => {
		await expect(chartReadOfFile("a1", "f1")).resolves.toEqual({
			id: "f1",
			songId: "sg1",
			url: "https://blob/f1.pdf",
			filename: "f1.pdf",
			kind: "pdf",
			chartRead: "m1 key C major: C",
			chartReadEdited: false,
		});
		await expect(chartReadOfFile("a1", "f2")).resolves.toMatchObject({
			kind: "image",
			chartRead: null,
		});
	});

	test("not a score, not ready, not a PDF or image, or another account's: null", async () => {
		for (const id of ["f3", "f4", "f5"])
			await expect(chartReadOfFile("a1", id)).resolves.toBeNull();
		await expect(chartReadOfFile("a2", "f1")).resolves.toBeNull();
	});
});

describe("saveChartRead", () => {
	beforeEach(() => reset({ songFile: [file("f1")] }));

	test("stores a correction, then clears it", async () => {
		await expect(saveChartRead("a1", "f1", "m1 key D major: D", true)).resolves.toEqual({
			chartRead: "m1 key D major: D",
			chartReadEdited: true,
		});
		expect(row("f1")).toMatchObject({ chartRead: "m1 key D major: D", chartReadEdited: true });
		await expect(saveChartRead("a1", "f1", null, false)).resolves.toEqual({
			chartRead: null,
			chartReadEdited: false,
		});
		expect(row("f1")).toMatchObject({ chartRead: null, chartReadEdited: false });
	});

	test("another account's file is not found and keeps its read", async () => {
		await expect(saveChartRead("a2", "f1", "m1 x", true)).resolves.toBeNull();
		expect(row("f1")).toMatchObject({ chartRead: null, chartReadEdited: false });
	});
});
