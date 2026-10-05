import { describe, expect, it } from "vite-plus/test";
import { imageTypeOfBytes, isPdfBytes } from "./fileSignatures";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("fileSignatures", () => {
	it("knows a PDF by its header and nothing else", () => {
		expect(isPdfBytes(ascii("%PDF-1.7 ..."))).toBe(true);
		expect(isPdfBytes(ascii("  %PDF-1.4"))).toBe(false);
		expect(isPdfBytes(ascii("<html>"))).toBe(false);
		expect(isPdfBytes(ascii("%PD"))).toBe(false);
	});
	it("tells WebP and PNG apart from the rest", () => {
		const webp = Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
		expect(imageTypeOfBytes(webp)).toBe("image/webp");
		const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
		expect(imageTypeOfBytes(png)).toBe("image/png");
		expect(imageTypeOfBytes(ascii("GIF89a"))).toBeNull();
		const wav = Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]);
		expect(imageTypeOfBytes(wav)).toBeNull();
	});
});
