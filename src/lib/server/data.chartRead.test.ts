import { beforeEach, describe, expect, test } from "vite-plus/test";
import { fake, reset } from "../../../tests/helpers/fakeDataLayer";

const { chartReadOfFile, midiFileForImport, saveChartRead } = await import("./data");

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
				file("f1", { chartRead: "key: C\n| C |" }),
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
			chartRead: "key: C\n| C |",
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
		await expect(saveChartRead("a1", "f1", "key: D\n| D |", true)).resolves.toEqual({
			chartRead: "key: D\n| D |",
			chartReadEdited: true,
		});
		expect(row("f1")).toMatchObject({ chartRead: "key: D\n| D |", chartReadEdited: true });
		await expect(saveChartRead("a1", "f1", null, false)).resolves.toEqual({
			chartRead: null,
			chartReadEdited: false,
		});
		expect(row("f1")).toMatchObject({ chartRead: null, chartReadEdited: false });
	});

	test("another account's file is not found and keeps its read", async () => {
		await expect(saveChartRead("a2", "f1", "| x |", true)).resolves.toBeNull();
		expect(row("f1")).toMatchObject({ chartRead: null, chartReadEdited: false });
	});
});

describe("midiFileForImport", () => {
	beforeEach(() =>
		reset({
			songFile: [
				file("m1", {
					kind: "midi",
					isNotation: false,
					url: "https://blob/m1.mid",
					filename: "m1.mid",
					title: "Groove",
				}),
				file("m2", { kind: "midi", status: "uploading" }),
			],
		}),
	);

	test("the account's file, whatever its kind or status, for the remote to check", async () => {
		await expect(midiFileForImport("a1", "m1")).resolves.toEqual({
			id: "m1",
			songId: "sg1",
			url: "https://blob/m1.mid",
			filename: "m1.mid",
			title: "Groove",
			status: "ready",
			kind: "midi",
		});
		await expect(midiFileForImport("a1", "m2")).resolves.toMatchObject({ status: "uploading" });
	});

	test("another account's or a missing file: null", async () => {
		await expect(midiFileForImport("a2", "m1")).resolves.toBeNull();
		await expect(midiFileForImport("a1", "nope")).resolves.toBeNull();
	});
});
