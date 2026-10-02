import { describe, expect, it } from "vite-plus/test";
import { renamedPathname } from "./renamedPathname";

describe("renamedPathname", () => {
	it("replaces the project segment and keeps the rest of the path", () => {
		expect(renamedPathname("/mmkk/projects/old-name/song-a/chart", { project: "new-name" })).toBe(
			"/mmkk/projects/new-name/song-a/chart",
		);
	});
	it("replaces the song segment", () => {
		expect(renamedPathname("/mmkk/projects/p/old-song", { song: "new-song" })).toBe(
			"/mmkk/projects/p/new-song",
		);
	});
	it("replaces both when the project and the song were renamed", () => {
		expect(renamedPathname("/mmkk/projects/old-p/old-s", { project: "p", song: "s" })).toBe(
			"/mmkk/projects/p/s",
		);
	});
	it("replaces the account segment on any page under it", () => {
		expect(renamedPathname("/old-account/artists/abc", { account: "new-account" })).toBe(
			"/new-account/artists/abc",
		);
	});
	it("answers null when the current slugs are the ones in the path (no redirect to itself)", () => {
		expect(renamedPathname("/mmkk/projects/p/s", { project: "p", song: "s" })).toBeNull();
		expect(renamedPathname("/mmkk/projects/p", { project: "p" })).toBeNull();
		expect(renamedPathname("/mmkk", { account: "mmkk" })).toBeNull();
	});
	it("leaves a path without a song segment alone when only a song slug is given", () => {
		expect(renamedPathname("/mmkk/projects/p", { song: "s" })).toBeNull();
	});
	it("ignores project and song slugs outside the projects tree", () => {
		expect(renamedPathname("/mmkk/artists/p", { project: "x", song: "y" })).toBeNull();
	});
});
