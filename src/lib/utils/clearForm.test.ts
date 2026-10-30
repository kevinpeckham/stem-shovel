// @vitest-environment jsdom
import { describe, expect, test, vi } from "vite-plus/test";
import { clearForm } from "./clearForm";

describe("clearForm", () => {
	test("replaces the form's stored values with nothing", () => {
		const set = vi.fn();
		clearForm({ fields: { set } });
		expect(set).toHaveBeenCalledWith({});
	});

	test("with the element, resets it natively first (the dirty fields clear), then empties the store", async () => {
		const set = vi.fn();
		const reset = vi.spyOn(HTMLFormElement.prototype, "reset");
		const element = document.createElement("form");
		clearForm({ fields: { set } }, element);
		expect(reset).toHaveBeenCalledTimes(1);
		expect(reset.mock.instances[0]).toBe(element);
		expect(set).not.toHaveBeenCalled();
		await new Promise((r) => setTimeout(r, 0)); // after the remote form's own tick-later reset handler
		expect(set).toHaveBeenCalledWith({});
		reset.mockRestore();
	});

	test("a null element is the no-element case", () => {
		const set = vi.fn();
		const reset = vi.spyOn(HTMLFormElement.prototype, "reset");
		clearForm({ fields: { set } }, null);
		expect(set).toHaveBeenCalledWith({});
		expect(reset).not.toHaveBeenCalled();
		reset.mockRestore();
	});
});
