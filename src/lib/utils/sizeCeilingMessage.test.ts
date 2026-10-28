import { describe, expect, it } from "vite-plus/test";
import { sizeCeilingMessage } from "./sizeCeilingMessage";

describe("sizeCeilingMessage", () => {
	it("is null for a whole size from one byte to the ceiling", () => {
		expect(sizeCeilingMessage(1, 1024, "A file")).toBeNull();
		expect(sizeCeilingMessage(1024, 1024, "A file")).toBeNull();
	});

	it("413 over the ceiling, with the subject and the ceiling", () => {
		expect(sizeCeilingMessage(2048, 1024, "An Image file")).toEqual({
			status: 413,
			message: "An Image file can be up to 1 KB",
		});
	});

	it("400 for an empty file and for a size that is not whole bytes", () => {
		expect(sizeCeilingMessage(0, 1024, "A file")).toEqual({
			status: 400,
			message: "The file is empty",
		});
		expect(sizeCeilingMessage(1.5, 1024, "A file")).toEqual({
			status: 400,
			message: "sizeBytes must be the file's size in whole bytes",
		});
	});
});
