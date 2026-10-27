import { describe, expect, test } from "vite-plus/test";
import { onboardingSteps, showOnboarding } from "./onboardingSteps";

const none = { projects: 0, songs: 0, recordings: 0, members: 1, ideas: 0 };

describe("onboardingSteps", () => {
	test("four steps, each linking to its action, none done in a new account", () => {
		expect(onboardingSteps(none, "the-band")).toEqual([
			{ id: "recording", label: "Add a recording", href: "/the-band/sessions", done: false },
			{ id: "song", label: "Create a song", href: "/the-band/projects", done: false },
			{ id: "band", label: "Invite the band", href: "/the-band/settings", done: false },
			{ id: "idea", label: "Try the Idea Recorder", href: "/idea-recorder", done: false },
		]);
	});

	test("done from the counts", () => {
		const steps = onboardingSteps(
			{ projects: 1, songs: 2, recordings: 3, members: 2, ideas: 1 },
			"b",
		);
		expect(steps.every((s) => s.done)).toBe(true);
	});

	test("the owner alone is not a band", () => {
		const band = onboardingSteps({ ...none, members: 1 }, "b").find((s) => s.id === "band");
		expect(band?.done).toBe(false);
	});
});

describe("showOnboarding", () => {
	test("an empty account shows it", () => {
		expect(showOnboarding(onboardingSteps(none, "b"), none)).toBe(true);
	});

	test("an empty account with two steps done still shows it", () => {
		const c = { ...none, members: 3, ideas: 2 };
		expect(showOnboarding(onboardingSteps(c, "b"), c)).toBe(true);
	});

	test("an account with content does not", () => {
		for (const over of [{ projects: 1 }, { songs: 1 }, { recordings: 1 }]) {
			const c = { ...none, ...over };
			expect(showOnboarding(onboardingSteps(c, "b"), c)).toBe(false);
		}
	});

	test("three steps done hides it", () => {
		const steps = onboardingSteps(none, "b").map((s, i) => ({ ...s, done: i < 3 }));
		expect(showOnboarding(steps, none)).toBe(false);
	});
});
