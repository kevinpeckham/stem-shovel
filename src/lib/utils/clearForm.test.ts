import { describe, expect, test, vi } from "vite-plus/test";
import { clearForm } from "./clearForm";

describe("clearForm", () => {
	test("replaces the form's stored values with nothing", () => {
		const set = vi.fn();
		clearForm({ fields: { set } });
		expect(set).toHaveBeenCalledWith({});
	});
});
