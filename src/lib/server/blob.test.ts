import { describe, expect, test, vi } from "vite-plus/test";

// The store ids are public (they are in every file URL); the tokens are stand-ins.
vi.mock("varlock/env", () => ({
	// The Vite integration injects an initVarlockEnv() call into modules that import the env.
	initVarlockEnv: () => {},
	ENV: {
		BLOB_READ_WRITE_TOKEN: "pub",
		BLOB_PRIVATE_READ_WRITE_TOKEN: '"priv"\n',
		BLOB_STORE_ID: "store_1K3OTzjCaMpTYyGd",
		BLOB_PRIVATE_STORE_ID: "store_QNJAGy8fZsu7uY10",
	},
}));
vi.mock("@vercel/blob", () => ({
	del: vi.fn(),
	get: vi.fn(),
	issueSignedToken: vi.fn(),
	presignUrl: vi.fn(),
	put: vi.fn(),
}));

const { blobAuth, isOurBlobUrl, movedPathname, songIdOfPathname } = await import("./blob");
// Locally the Vite integration bakes the real store ids into blob.ts (the mock
// above only applies in CI, where the plugin is skipped): build the hosts from
// whatever ENV blob.ts sees, so the test holds in both.
const { ENV } = await import("varlock/env");
const host = (id: string, access: "public" | "private") =>
	`${id.replace(/^store_/, "").toLowerCase()}.${access}.blob.vercel-storage.com`;
const PUBLIC_HOST = host(ENV.BLOB_STORE_ID, "public");
const PRIVATE_HOST = host(ENV.BLOB_PRIVATE_STORE_ID ?? "store_QNJAGy8fZsu7uY10", "private");

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
	test("only URLs in our stores pass, and only the reserved file when a pathname is given", () => {
		const pub = `https://${PUBLIC_HOST}/accounts/a/songs/s/x.wav`;
		const priv = `https://${PRIVATE_HOST}/accounts/a/songs/s/x.wav`;
		expect(isOurBlobUrl(pub)).toBe(true);
		expect(isOurBlobUrl(priv)).toBe(true);
		expect(isOurBlobUrl(pub, "accounts/a/songs/s/x.wav")).toBe(true);
		expect(isOurBlobUrl(pub, "accounts/a/songs/s/other.wav")).toBe(false);
		expect(isOurBlobUrl("https://evil.example/accounts/a/songs/s/x.wav")).toBe(false);
		expect(isOurBlobUrl("https://other.public.blob.vercel-storage.com/x.wav")).toBe(false);
		expect(isOurBlobUrl(`http://${PUBLIC_HOST}/x.wav`)).toBe(false);
		expect(isOurBlobUrl("not a url")).toBe(false);
	});
});
