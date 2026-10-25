import { describe, expect, it } from "vite-plus/test";
import { shortLinkDestination } from "./shortLinkDestination";

describe("shortLinkDestination", () => {
	it("names an instrument or a Studio song, with the bare path", () => {
		expect(shortLinkDestination("/chord-player#k=C&p=1", "chord-player")).toEqual({
			name: "Chord Player",
			path: "/chord-player",
		});
		expect(shortLinkDestination("/multitrack-recorder?song=abc", "studio")).toEqual({
			name: "Studio song",
			path: "/multitrack-recorder",
		});
	});
	it("lets a song's or project's path speak for itself", () => {
		expect(shortLinkDestination("/band/projects/album/track?t=3", "song")).toEqual({
			name: null,
			path: "/band/projects/album/track",
		});
		expect(shortLinkDestination("/band/projects/album", "project").name).toBeNull();
		expect(shortLinkDestination("?x", "other").path).toBe("/");
	});

	it("names an attachment's permanent link a file", () => {
		expect(shortLinkDestination("/f/abc123?download=1", "other")).toEqual({
			name: "File",
			path: "/f/abc123",
		});
	});
});
