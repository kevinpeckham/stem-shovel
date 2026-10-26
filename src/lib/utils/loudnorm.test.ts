import { describe, expect, it } from "vite-plus/test";
import {
	loudnormApplyFilter,
	loudnormMeasureFilter,
	parseLoudnorm,
	peakLimiterFilter,
} from "./loudnorm";

const stderr = `size=N/A time=00:00:11.40 bitrate=N/A speed=22.8x    [Parsed_loudnorm_2 @ 0x7f76f4004180] 
{
	"input_i" : "-17.02",
	"input_tp" : "-6.03",
	"input_lra" : "0.40",
	"input_thresh" : "-27.02",
	"output_i" : "-13.98",
	"output_tp" : "-2.95",
	"output_lra" : "0.20",
	"output_thresh" : "-23.98",
	"normalization_type" : "dynamic",
	"target_offset" : "-0.02"
}
[Parsed_adeclip_1 @ 0x7f76f4003cc0] Detected clips in 0 of 576000 samples (0%).`;

describe("parseLoudnorm", () => {
	it("reads the first pass's numbers out of ffmpeg's stderr", () => {
		expect(parseLoudnorm(stderr)).toEqual({
			inputI: -17.02,
			inputTp: -6.03,
			inputLra: 0.4,
			inputThresh: -27.02,
			targetOffset: -0.02,
		});
	});
	it("is null without the block, or when a value is not a number (a silent file reads -inf)", () => {
		expect(parseLoudnorm("size=N/A time=00:00:11.40")).toBeNull();
		expect(parseLoudnorm(stderr.replace('"-17.02"', '"-inf"'))).toBeNull();
		expect(parseLoudnorm('{"input_i" : "-17.02"}')).toBeNull();
	});
});

describe("the filters", () => {
	it("the long-set limiter holds −1 dBFS without touching the gain", () => {
		expect(peakLimiterFilter()).toBe("alimiter=limit=0.891:level=false");
	});
	it("measure, then apply with the measurement, linear first", () => {
		expect(loudnormMeasureFilter()).toBe("loudnorm=I=-14:TP=-1:LRA=11:print_format=json");
		expect(
			loudnormApplyFilter({
				inputI: -17.02,
				inputTp: -6.03,
				inputLra: 0.4,
				inputThresh: -27.02,
				targetOffset: -0.02,
			}),
		).toBe(
			"loudnorm=I=-14:TP=-1:LRA=11:measured_I=-17.02:measured_TP=-6.03:measured_LRA=0.4:measured_thresh=-27.02:offset=-0.02:linear=true",
		);
	});
});
