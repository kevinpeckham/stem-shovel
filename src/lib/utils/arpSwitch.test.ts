import { describe, expect, it } from "vite-plus/test";
import { arpChangeSteps, arpSwitchStep } from "./arpSwitch";

describe("arpSwitchStep", () => {
	// Sixteenths: change points every two steps (the eighths); a grace of half a step.
	it("waits for the next change point when pressed before it", () => {
		expect(arpSwitchStep(2.9, 2, 0.5)).toBe(4); // just before the eighth at step 4
		expect(arpSwitchStep(3.4, 2, 0.5)).toBe(4);
		expect(arpSwitchStep(1.2, 2, 0.5)).toBe(2);
	});
	it("comes in on the next step, in place, when pressed just after a change point", () => {
		expect(arpSwitchStep(4.1, 2, 0.5)).toBe(5); // just late for the eighth at 4: the next step, in the pattern's second place
		expect(arpSwitchStep(0.3, 2, 0.5)).toBe(1);
	});
	it("treats a press well after the point as waiting for the next", () => {
		expect(arpSwitchStep(4.6, 2, 0.5)).toBe(6);
	});
	it("spaces the change points by rate", () => {
		expect(arpChangeSteps("4")).toBe(1);
		expect(arpChangeSteps("8")).toBe(2);
		expect(arpChangeSteps("8t")).toBe(3);
		expect(arpChangeSteps("16")).toBe(2);
	});
});
