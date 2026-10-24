import { beforeEach, describe, expect, test } from "vite-plus/test";
import { reset } from "../../../tests/helpers/fakeDataLayer";

const { scoreForAi } = await import("./data");

/**
 * The chart the AI reads beside the mix (docs/audio-engine.md): the score
 * first, a notation attachment next, the band's own chord chart last.
 */
const SONG = {
	id: "sg1",
	accountId: "a1",
	projectId: "p1",
	title: "Peaceful Dreams",
	slug: "peaceful-dreams",
	status: "active",
	chartMarkdown: "# Verse\n| D | G | A | D |",
	lyricsMarkdown: "",
	notesMarkdown: "",
};

describe("scoreForAi", () => {
	beforeEach(() => reset({ song: [SONG] }));

	test("a ready MusicXML wins", async () => {
		reset({
			song: [SONG],
			songNotation: [
				{
					id: "n1",
					accountId: "a1",
					songId: "sg1",
					status: "ready",
					format: "mxl",
					url: "https://blob/score.mxl",
					filename: "score.mxl",
					title: "Score",
					createdAt: "2026-10-01",
				},
			],
		});
		await expect(scoreForAi("a1", "sg1")).resolves.toMatchObject({
			kind: "musicxml",
			url: "https://blob/score.mxl",
		});
	});

	test("a notation PDF comes with its file id and its stored read", async () => {
		reset({
			song: [SONG],
			songFile: [
				{
					id: "f1",
					accountId: "a1",
					projectId: "p1",
					songId: "sg1",
					kind: "pdf",
					status: "ready",
					isNotation: true,
					url: "https://blob/score.pdf",
					filename: "score.pdf",
					title: "Score",
					sizeBytes: 1000,
					chartRead: "m1 key F major 4/4: F",
					chartReadEdited: true,
					createdAt: "2026-10-01",
				},
			],
		});
		await expect(scoreForAi("a1", "sg1")).resolves.toEqual({
			kind: "pdf",
			fileId: "f1",
			url: "https://blob/score.pdf",
			filename: "score.pdf",
			title: "Score",
			sizeBytes: 1000,
			chartRead: "m1 key F major 4/4: F",
			chartReadEdited: true,
		});
	});

	test("without a score, the song's own chord chart goes along", async () => {
		await expect(scoreForAi("a1", "sg1")).resolves.toEqual({
			kind: "chart",
			markdown: "# Verse\n| D | G | A | D |",
			title: "Peaceful Dreams",
		});
	});

	test("an empty chart document is no chart, and another account's song is not found", async () => {
		reset({ song: [{ ...SONG, chartMarkdown: "  \n" }] });
		await expect(scoreForAi("a1", "sg1")).resolves.toBeNull();
		reset({ song: [SONG] });
		await expect(scoreForAi("a2", "sg1")).resolves.toBeNull();
	});
});
