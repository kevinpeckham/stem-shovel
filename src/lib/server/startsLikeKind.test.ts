import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { FileKind } from "#lib/constants/fileFormats.js";

/** The ready routes' check of a file's first bytes against its kind (docs/uploads-and-blob.md and docs/chat.md, "Attachments"). */
const h = vi.hoisted(() => ({ headOfBlob: vi.fn() }));
vi.mock("#lib/server/headOfBlob.js", () => ({ headOfBlob: h.headOfBlob }));
const { notLikeKindMessage, startsLikeKind } = await import("./startsLikeKind");

const bytes = (...b: number[]) => new Uint8Array(b);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0);
const MIDI = bytes(0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6);
const ZIP = bytes(0x50, 0x4b, 3, 4, 0);
const TEXT = new TextEncoder().encode("Verse one\n");
const head = (b: Uint8Array | null) => h.headOfBlob.mockResolvedValue(b);

beforeEach(() => h.headOfBlob.mockReset());

describe("startsLikeKind", () => {
	test("each kind by its own signature, read from the URL", async () => {
		const cases: [FileKind, Uint8Array, Uint8Array][] = [
			["pdf", PDF, PNG],
			["image", PNG, PDF],
			["midi", MIDI, PDF],
			["text", TEXT, bytes(0x41, 0, 0x42)],
			["dawproject", ZIP, PDF],
		];
		for (const [kind, good, bad] of cases) {
			head(good);
			expect(await startsLikeKind("https://x/f", kind)).toBe(true);
			head(bad);
			expect(await startsLikeKind("https://x/f", kind)).toBe(false);
		}
		expect(h.headOfBlob).toHaveBeenCalledWith("https://x/f");
	});
	test("'other' needs only bytes; nothing to read is never a match", async () => {
		head(PDF);
		expect(await startsLikeKind("https://x/f", "other")).toBe(true);
		head(bytes());
		expect(await startsLikeKind("https://x/f", "other")).toBe(false);
		head(null);
		expect(await startsLikeKind("https://x/f", "pdf")).toBe(false);
	});
});

describe("notLikeKindMessage", () => {
	test("the 415's words by kind", () => {
		expect(notLikeKindMessage("pdf")).toBe("That file does not look like a PDF");
		expect(notLikeKindMessage("image")).toBe("That file does not look like an image");
		expect(notLikeKindMessage("audio")).toBe("That file does not look like audio");
		expect(notLikeKindMessage("text")).toBe("That file does not look like text");
		expect(notLikeKindMessage("midi")).toBe("That file does not look like MIDI");
		expect(notLikeKindMessage("dawproject")).toMatch(/^That file does not look like a /);
	});
});
