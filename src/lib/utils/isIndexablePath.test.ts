import { describe, expect, test } from "vite-plus/test";
import { isIndexablePath } from "./isIndexablePath";

describe("isIndexablePath", () => {
	test("the front page, the docs and the releases page", () => {
		for (const p of [
			"/",
			"/docs",
			"/docs/getting-started",
			"/docs/getting-started/",
			"/releases",
			"/tuner",
			"/pricing",
		]) {
			expect(isIndexablePath(p)).toBe(true);
		}
	});
	test("nothing else", () => {
		for (const p of [
			"/docs/getting-started/edit",
			"/mmkk/projects",
			"/sign-in",
			"/admin",
			"/docsx",
			"/releases/x",
		]) {
			expect(isIndexablePath(p)).toBe(false);
		}
	});
});
