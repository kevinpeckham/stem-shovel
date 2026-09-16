import { describe, expect, test } from "vite-plus/test";
import { accessOfUrl, blobPathname, isPrivateBlobUrl } from "./blobAccess";

const pub = "https://abc123.public.blob.vercel-storage.com/accounts/a/songs/s/stem.wav";
const priv = "https://abc123.private.blob.vercel-storage.com/accounts/a/songs/s/stem.wav";

describe("blobAccess", () => {
	test("reads the store's access from the host", () => {
		expect(accessOfUrl(pub)).toBe("public");
		expect(accessOfUrl(priv)).toBe("private");
		expect(isPrivateBlobUrl(priv)).toBe(true);
		expect(accessOfUrl("https://example.com/x.wav")).toBe("public");
	});
	test("recovers the pathname", () => {
		expect(blobPathname(priv)).toBe("accounts/a/songs/s/stem.wav");
		expect(blobPathname(`${pub}?download=1`)).toBe("accounts/a/songs/s/stem.wav");
		expect(blobPathname("https://example.com/x")).toBe("");
	});
});
