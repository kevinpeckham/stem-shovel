import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type StemUploader from "#lib/components/StemUploader.svelte";
import { StemUploads } from "#lib/state/stemUploads.svelte.js";
import StemUploadList from "./StemUploadList.svelte";

type UploadJob = StemUploads["jobs"][number];

/** The upload notice, a row per file and "Retry failed" once something failed and nothing is on its way. */
const job = (
	name: string,
	status: UploadJob["status"],
	percent = 0,
	error?: string,
): UploadJob => ({
	file: new File(["x"], name),
	percent,
	status,
	error,
});

function setup(jobs: UploadJob[], notice: string | null = null) {
	const uploads = new StemUploads();
	uploads.jobs = jobs;
	uploads.notice = notice;
	const retryFailed = vi.fn(async () => {});
	uploads.uploader = { retryFailed } as unknown as StemUploader;
	render(StemUploadList, { uploads });
	return { retryFailed };
}

describe("StemUploadList", () => {
	test("nothing to show: nothing", () => {
		setup([]);
		expect(screen.queryByLabelText("Uploading")).toBeNull();
	});

	test("the notice, and each file's progress", () => {
		setup([job("bass.wav", "uploading", 42.4), job("drums.wav", "queued")], "Over the limit");
		expect(screen.getByText("Over the limit")).toBeInTheDocument();
		expect(screen.getByText("42%")).toBeInTheDocument();
		expect(screen.getByText("queued")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Retry failed" })).toBeNull();
	});

	test("a failure: its error, and Retry failed asks the uploader", async () => {
		const { retryFailed } = setup([job("bass.wav", "error", 10, "Network down")]);
		expect(screen.getByText("failed")).toBeInTheDocument();
		expect(screen.getByText("Network down")).toBeInTheDocument();
		await fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));
		expect(retryFailed).toHaveBeenCalledTimes(1);
	});
});
