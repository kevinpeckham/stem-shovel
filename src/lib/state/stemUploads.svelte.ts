import type { ComponentProps } from "svelte";
import type StemUploader from "#lib/components/StemUploader.svelte";

/** One file of the batch (StemUploader's UploadJob). */
type UploadJob = NonNullable<ComponentProps<typeof StemUploader>["jobs"]>[number];

/**
 * The song page's stem uploads: the batch's jobs and notice, shared by the
 * empty player's uploader and the actions menu's (bound into both), and
 * "Retry failed" under the player.
 */
export class StemUploads {
	jobs = $state<UploadJob[]>([]);
	notice = $state<string | null>(null);
	/** Whichever uploader is on the page (the panel's or the menu's; they share the jobs), for "Retry failed". */
	uploader = $state<StemUploader | null>(null);

	/** Some file failed and nothing is still on its way: "Retry failed" shows. */
	get canRetry() {
		return (
			this.jobs.some((j) => j.status === "error") &&
			!this.jobs.some((j) => j.status === "uploading" || j.status === "decoding")
		);
	}

	/** Upload the files that failed again, to the same stems. */
	retryFailed() {
		void this.uploader?.retryFailed();
	}
}
