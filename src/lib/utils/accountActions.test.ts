import { describe, expect, test } from "vite-plus/test";
import { accountActions } from "./accountActions";

describe("accountActions", () => {
	test("the account's slug in each account link", () => {
		expect(accountActions("the-band")).toEqual([
			{ label: "Add a recording", href: "/the-band/sessions" },
			{ label: "New song", href: "/the-band/projects" },
			{ label: "New idea", href: "/idea-recorder" },
			{ label: "Record a session", href: "/the-band/sessions/record" },
		]);
	});
});
