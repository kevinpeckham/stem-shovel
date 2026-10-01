import { describe, expect, test } from "vite-plus/test";
import { parseTextToBeatReply } from "./parseTextToBeatReply";

describe("parseTextToBeatReply", () => {
	test("reads the JSON out of prose and fences, rows as a preset's strings", () => {
		const text =
			'Here you go:\n```json\n{"bpm": 92, "swing": 15, "note": "A boom bap.", "rows": [{"voice": "kick", "cells": "X..x....X.x....."}, {"voice": "snare", "cells": "....X.......X..o"}]}\n```';
		const r = parseTextToBeatReply(text, "4/4", 16);
		expect(r.bpm).toBe(92);
		expect(r.swing).toBe(0.15);
		expect(r.note).toBe("A boom bap.");
		expect(
			parseTextToBeatReply(
				'{"humanize": 20, "rows": [{"voice": "kick", "cells": "x..............."}]}',
				"4/4",
				16,
			).humanize,
		).toBe(0.2);
		expect(r.pattern.meter).toBe("4/4");
		expect(r.pattern.steps).toBe(16);
		expect(r.pattern.rows.map((row) => row.voice)).toEqual(["kick", "snare"]);
		expect(r.pattern.rows[0]!.cells).toEqual([3, 0, 0, 2, 0, 0, 0, 0, 3, 0, 2, 0, 0, 0, 0, 0]);
		expect(r.pattern.rows[1]!.cells[15]).toBe(1);
		expect(r.pattern.rows[0]!.level).toBe(0.9);
	});
	test("rows that never sound are left out, unless nothing sounds", () => {
		const r = parseTextToBeatReply(
			'{"rows": [{"voice": "kick", "cells": "x..............."}, {"voice": "snare", "cells": "................"}]}',
			"4/4",
			16,
		);
		expect(r.pattern.rows.map((row) => row.voice)).toEqual(["kick"]);
		const silent = parseTextToBeatReply(
			'{"rows": [{"voice": "kick", "cells": "................"}]}',
			"4/4",
			16,
		);
		expect(silent.pattern.rows.length).toBe(1);
	});
	test("effects come through as levels and the delay's steps; a dry beat has none", () => {
		const r = parseTextToBeatReply(
			'{"fx": {"reverb": 30, "delay": 35, "delayTime": "1/8 dotted", "fuzz": 0, "wah": null}, "rows": [{"voice": "kick", "cells": "x..............."}]}',
			"4/4",
			16,
		);
		expect(r.fx).toEqual({ reverbReturn: 0.3, delayReturn: 0.35, fuzzDrive: 0, delayTime: 3 });
		const dry = parseTextToBeatReply(
			'{"rows": [{"voice": "kick", "cells": "x..............."}]}',
			"4/4",
			16,
		);
		expect(dry.fx).toBeNull();
		expect(
			parseTextToBeatReply(
				'{"fx": {}, "rows": [{"voice": "kick", "cells": "x..............."}]}',
				"4/4",
				16,
			).fx,
		).toBeNull();
	});
	test("tempo, swing and note are optional", () => {
		const r = parseTextToBeatReply(
			'{"rows": [{"voice": "kick", "cells": "x.......x..."}]}',
			"3/4",
			12,
		);
		expect([r.bpm, r.swing, r.humanize, r.note]).toEqual([null, null, null, ""]);
		expect(r.pattern.steps).toBe(12);
	});
	test("refuses a row of the wrong length, an unknown voice, a stray character, a wild tempo, and no JSON", () => {
		expect(() =>
			parseTextToBeatReply('{"rows": [{"voice": "kick", "cells": "x......."}]}', "4/4", 16),
		).toThrow(/8 characters.*exactly 16/);
		expect(() =>
			parseTextToBeatReply('{"rows": [{"voice": "gong", "cells": "x..............."}]}', "4/4", 16),
		).toThrow(/voice/);
		expect(() =>
			parseTextToBeatReply('{"rows": [{"voice": "kick", "cells": "x-.............."}]}', "4/4", 16),
		).toThrow(/cells/);
		expect(() =>
			parseTextToBeatReply(
				'{"bpm": 900, "rows": [{"voice": "kick", "cells": "x..............."}]}',
				"4/4",
				16,
			),
		).toThrow(/bpm/);
		expect(() => parseTextToBeatReply("Sorry, I cannot.", "4/4", 16)).toThrow(/no JSON/);
	});
});
