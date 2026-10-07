import { describe, expect, it } from "vite-plus/test";
import { errorMessage, SESSION_ENDED } from "./errorMessage";

describe("errorMessage", () => {
	it("reads an Error", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
	});
	it("reads a remote HttpError body instead of its JSON", () => {
		const httpError = { status: 502, body: { message: "The model did not answer" } };
		expect(errorMessage(httpError)).toBe("The model did not answer");
	});
	it("accepts strings and objects with a message", () => {
		expect(errorMessage("plain")).toBe("plain");
	});
	it("reads a 401 as the session having ended", () => {
		expect(errorMessage({ status: 401, body: { message: "Sign in first" } })).toBe(SESSION_ENDED);
		expect(errorMessage({ message: "shaped" })).toBe("shaped");
	});
	it("falls back for anything else", () => {
		expect(errorMessage(null)).toBe("Something went wrong");
		expect(errorMessage(new Error(""), "Nope")).toBe("Nope");
	});
});
