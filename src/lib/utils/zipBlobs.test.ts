import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vite-plus/test";
import { zipBlobs } from "./zipBlobs";

describe("zipBlobs", () => {
	it("zips blobs, buffers and bytes under their names, stored or deflated", async () => {
		const zip = await zipBlobs([
			{ name: "stems/guitar.wav", data: new Blob([new Uint8Array([1, 2, 3])]) },
			{ name: "project.xml", data: new TextEncoder().encode("<Project/>"), compress: true },
			{ name: "meta.bin", data: new Uint8Array([9]).buffer },
		]);
		expect(zip.type).toBe("application/zip");
		const out = unzipSync(new Uint8Array(await zip.arrayBuffer()));
		expect(Object.keys(out).sort()).toEqual(["meta.bin", "project.xml", "stems/guitar.wav"]);
		expect([...out["stems/guitar.wav"]!]).toEqual([1, 2, 3]);
		expect(strFromU8(out["project.xml"]!)).toBe("<Project/>");
	});
	it("takes a type for a DAWproject", async () => {
		const zip = await zipBlobs([], "application/vnd.bitwig.dawproject");
		expect(zip.type).toBe("application/vnd.bitwig.dawproject");
	});
});
