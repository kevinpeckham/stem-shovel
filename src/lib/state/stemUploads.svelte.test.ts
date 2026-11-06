import { describe, expect, test, vi } from "vite-plus/test";
import type StemUploader from "#lib/components/StemUploader.svelte";
import { StemUploads } from "./stemUploads.svelte.js";

type UploadJob = StemUploads["jobs"][number];

/** The page's stem uploads: when "Retry failed" shows, and that it asks the uploader. */
const job = (status: UploadJob["status"]): UploadJob => ({
	file: new File(["x"], `${status}.wav`),
	percent: 0,
	status,
});

describe("StemUploads", () => {
	test("starts empty, with nothing to retry", () => {
		const uploads = new StemUploads();
		expect(uploads.jobs).toEqual([]);
		expect(uploads.notice).toBeNull();
		expect(uploads.uploader).toBeNull();
		expect(uploads.canRetry).toBe(false);
	});

	test("canRetry: a failed file and nothing still uploading or decoding", () => {
		const uploads = new StemUploads();
		uploads.jobs = [job("done"), job("error")];
		expect(uploads.canRetry).toBe(true);
		uploads.jobs = [job("error"), job("uploading")];
		expect(uploads.canRetry).toBe(false);
		uploads.jobs = [job("error"), job("decoding")];
		expect(uploads.canRetry).toBe(false);
		uploads.jobs = [job("done"), job("queued")];
		expect(uploads.canRetry).toBe(false);
	});

	test("retryFailed asks the uploader on the page, and nothing without one", () => {
		const uploads = new StemUploads();
		expect(() => uploads.retryFailed()).not.toThrow();
		const retryFailed = vi.fn(async () => {});
		uploads.uploader = { retryFailed } as unknown as StemUploader;
		uploads.retryFailed();
		expect(retryFailed).toHaveBeenCalledTimes(1);
	});
});
