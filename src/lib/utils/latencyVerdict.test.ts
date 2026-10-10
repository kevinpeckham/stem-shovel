import { describe, expect, it } from "vite-plus/test";
import { latencyVerdict, looksBluetooth } from "./latencyVerdict";

describe("latencyVerdict", () => {
	it("grades the round trip and names Bluetooth first", () => {
		expect(latencyVerdict(9, false).tone).toBe("good");
		expect(latencyVerdict(22, false).tone).toBe("ok");
		expect(latencyVerdict(48, false).tone).toBe("bad");
		expect(latencyVerdict(null, false).tone).toBe("unknown");
		expect(latencyVerdict(9, true)).toMatchObject({ tone: "bad", label: "Bluetooth output" });
	});
	it("reads a device label", () => {
		expect(looksBluetooth("AirPods Pro")).toBe(true);
		expect(looksBluetooth("WH-1000XM4 (Bluetooth)")).toBe(true);
		expect(looksBluetooth("MacBook Pro Speakers")).toBe(false);
		expect(looksBluetooth("Scarlett 2i2 USB")).toBe(false);
	});
});
