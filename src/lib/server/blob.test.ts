import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("varlock/env", () => ({
	ENV: { BLOB_READ_WRITE_TOKEN: "pub", BLOB_PRIVATE_READ_WRITE_TOKEN: '"priv"\n' },
}));
vi.mock("@vercel/blob", () => ({
	del: vi.fn(),
	get: vi.fn(),
	issueSignedToken: vi.fn(),
	presignUrl: vi.fn(),
	put: vi.fn(),
}));

const { blobAuth, movedPathname, songIdOfPathname } = await import("./blob");

describe("blob helpers", () => {
	test("tokens lose stray quotes and whitespace", () => {
		expect(blobAuth("private").token).toBe("priv");
		expect(blobAuth("public").token).toBe("pub");
	});
	test("a moved file gets a stamped pathname, replacing an earlier stamp", () => {
		const first = movedPathname("accounts/a/songs/s/stem.wav");
		expect(first).toMatch(/^accounts\/a\/songs\/s\/stem\.m[a-z0-9]+\.wav$/);
		const again = movedPathname(first);
		expect(again).toMatch(/^accounts\/a\/songs\/s\/stem\.m[a-z0-9]+\.wav$/);
		expect(again.split(".").length).toBe(3);
		expect(movedPathname("accounts/a/songs/s/stem.play-abc.m4a")).toMatch(
			/stem\.play-abc\.m[a-z0-9]+\.m4a$/,
		);
	});
	test("the song id is read from any upload pathname", () => {
		expect(songIdOfPathname("accounts/acc/songs/song1/stem.wav")).toBe("song1");
		expect(songIdOfPathname("accounts/acc/songs/song1/demos/d.m4a")).toBe("song1");
		expect(songIdOfPathname("probe/x.txt")).toBeNull();
	});
});
