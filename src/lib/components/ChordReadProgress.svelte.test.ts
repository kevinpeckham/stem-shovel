import { render, screen } from "@testing-library/svelte";
import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

type State = "waiting" | "reading" | "done";
const polls: State[][] = [];
const chordReadStates = vi.fn(() => {
	const states = polls.length > 1 ? polls.shift()! : polls[0];
	const rows = IDS.map((id, i) => ({
		id,
		title: `Song ${i + 1}`,
		slug: `song-${i + 1}`,
		projectSlug: "proj",
		accountSlug: "acct",
		state: states[i],
		startedAt: states[i] === "reading" ? Date.now() - 5000 : null,
	}));
	return Object.assign(Promise.resolve(rows), { refresh: vi.fn(async () => {}) });
});
vi.mock("#lib/remote/admin.remote.js", () => ({ chordReadStates }));

const IDS = ["song-a", "song-b", "song-c"];
const { default: ChordReadProgress } = await import("./ChordReadProgress.svelte");

const stateOf = (title: string) =>
	screen.getByRole("link", { name: title }).closest("li")!.lastElementChild!.textContent!.trim();

describe("ChordReadProgress", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		chordReadStates.mockClear();
		polls.length = 0;
	});
	afterEach(() => vi.useRealTimers());

	test("follows each song from waiting through reading to done, then stops", async () => {
		polls.push(
			["waiting", "waiting", "reading"],
			["done", "waiting", "reading"],
			["done", "done", "done"],
		);
		const ondone = vi.fn();
		render(ChordReadProgress, { props: { ids: IDS, ondone } });
		await vi.advanceTimersByTimeAsync(0);
		expect(screen.getByText("0 of 3 read")).toBeTruthy();
		expect(stateOf("Song 1")).toBe("waiting");
		expect(stateOf("Song 3")).toBe("reading, started 5s ago");
		expect(screen.getByRole("link", { name: "Song 1" }).getAttribute("href")).toBe(
			"/acct/projects/proj/song-1",
		);

		await vi.advanceTimersByTimeAsync(3000);
		expect(screen.getByText("1 of 3 read")).toBeTruthy();
		expect(stateOf("Song 1")).toBe("done");
		expect(stateOf("Song 2")).toBe("waiting");
		expect(ondone).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(3000);
		expect(screen.getByText("3 of 3 read")).toBeTruthy();
		expect(ondone).toHaveBeenCalledOnce();
		const calls = chordReadStates.mock.calls.length;
		expect(calls).toBe(3);
		await vi.advanceTimersByTimeAsync(30_000);
		expect(chordReadStates.mock.calls.length).toBe(calls);
	});

	test("a song seen reading that is waiting again did not read, and counts as finished", async () => {
		polls.push(["done", "done", "reading"], ["done", "done", "waiting"]);
		const ondone = vi.fn();
		render(ChordReadProgress, { props: { ids: IDS, ondone } });
		await vi.advanceTimersByTimeAsync(0);
		expect(stateOf("Song 3")).toBe("reading, started 5s ago");
		await vi.advanceTimersByTimeAsync(3000);
		expect(stateOf("Song 3")).toBe("did not read");
		expect(screen.getByText("2 of 3 read")).toBeTruthy();
		expect(ondone).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(30_000);
		expect(chordReadStates).toHaveBeenCalledTimes(2);
	});

	test("gives up after fifteen minutes", async () => {
		polls.push(["waiting", "waiting", "waiting"]);
		render(ChordReadProgress, { props: { ids: IDS } });
		await vi.advanceTimersByTimeAsync(15 * 60 * 1000);
		const calls = chordReadStates.mock.calls.length;
		await vi.advanceTimersByTimeAsync(60_000);
		expect(chordReadStates).toHaveBeenCalledTimes(calls);
	});
});
