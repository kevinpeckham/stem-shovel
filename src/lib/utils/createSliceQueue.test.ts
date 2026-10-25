import { describe, expect, it } from "vite-plus/test";
import { createSliceQueue } from "./createSliceQueue";

/**
 * The disk cache worker's ordering (utils/createSliceQueue.ts): ordinary
 * jobs one at a time in order, quick jobs overtaking at a slice. `pause`
 * is a manual gate so a test decides when a slice ends.
 */
function gate() {
	const waiting: (() => void)[] = [];
	return {
		pause: () => new Promise<void>((r) => waiting.push(r)),
		open: async () => {
			while (waiting.length) waiting.shift()!();
			for (let i = 0; i < 20; i++) await Promise.resolve();
		},
	};
}
const tick = async () => {
	for (let i = 0; i < 20; i++) await Promise.resolve();
};

describe("createSliceQueue", () => {
	it("runs ordinary jobs one at a time, in order", async () => {
		const q = createSliceQueue(async () => {});
		const log: string[] = [];
		const job = (name: string) =>
			q.push(async () => {
				log.push(`${name} start`);
				await tick();
				log.push(`${name} end`);
				return name;
			});
		expect(await Promise.all([job("a"), job("b")])).toEqual(["a", "b"]);
		expect(log).toEqual(["a start", "a end", "b start", "b end"]);
	});
	it("a quick job waits for the running job's next slice, not its end", async () => {
		const g = gate();
		const q = createSliceQueue(g.pause);
		const log: string[] = [];
		const write = q.push(async (slice) => {
			for (let i = 0; i < 3; i++) {
				log.push(`slice ${i}`);
				await slice();
			}
			return "written";
		});
		await tick();
		const read = q.quick(async () => {
			log.push("read");
			return 7;
		});
		await tick();
		expect(log).toEqual(["slice 0"]);
		await g.open();
		expect(await read).toBe(7);
		expect(log).toEqual(["slice 0", "read", "slice 1"]);
		await g.open();
		await g.open();
		expect(await write).toBe("written");
		expect(log).toEqual(["slice 0", "read", "slice 1", "slice 2"]);
	});
	it("quick jobs overtake ordinary jobs queued behind the running one", async () => {
		const g = gate();
		const q = createSliceQueue(g.pause);
		const log: string[] = [];
		const first = q.push(async (slice) => {
			log.push("first");
			await slice();
		});
		await tick();
		const second = q.push(async () => {
			log.push("second");
		});
		const quick = q.quick(async () => {
			log.push("quick");
		});
		await g.open();
		await Promise.all([first, second, quick]);
		expect(log).toEqual(["first", "quick", "second"]);
	});
	it("a quick job runs at once when the queue is idle", async () => {
		const q = createSliceQueue(() => new Promise(() => {}));
		expect(await q.quick(async () => "now")).toBe("now");
	});
	it("a job that throws rejects its own promise and the queue goes on", async () => {
		const q = createSliceQueue(async () => {});
		const bad = q.push(async () => {
			throw new Error("quota");
		});
		const good = q.push(async () => "ok");
		await expect(bad).rejects.toThrow("quota");
		expect(await good).toBe("ok");
		await expect(q.quick(async () => Promise.reject(new Error("x")))).rejects.toThrow("x");
		expect(await q.quick(async () => 1)).toBe(1);
	});
});
