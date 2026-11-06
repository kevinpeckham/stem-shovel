<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { readMissingChords, setStemStreamingForm } from "#lib/remote/admin.remote.js";
	import { CHORDS_BATCH } from "#lib/constants/chordsBatch.js";
	import { chordsReadNotice } from "#lib/utils/chordsReadNotice.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { refreshAll } from "$app/navigation";

	let { data } = $props();
	let chosen = $derived(data.mode);
	let reading = $state(false);
	/** One batch of the songs the chord model has not read, posted to the jobs function. */
	async function readChords() {
		reading = true;
		try {
			const r = await readMissingChords({});
			await refreshAll();
			notify(chordsReadNotice(r.scheduled, r.remaining));
		} catch (e) {
			notify(`The read did not start: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			reading = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle("Playback · Admin")}</title>
</svelte:head>

<section>
	<h1 class="app-page-heading">Playback</h1>
	<p class="mt-1 text-sm opacity-90">
		How the stem player holds a song. Buffered keeps every stem decoded in memory, which is instant
		but weighs about 60 MB per four-minute stereo stem. Streamed decodes a window around the
		playhead in the browser's own AAC decoder and mixes in a worklet, so a song of any size fits; it
		needs Chrome, Edge, Firefox on a computer, or Safari 26. Each listener can override this from
		the player's footer, in their browser only.
	</p>
	<form
		class="mt-4"
		{...setStemStreamingForm.enhance(async ({ submit }) => {
			await submit();
			if (setStemStreamingForm.result?.mode) {
				await refreshAll();
				notify(
					setStemStreamingForm.result.mode === "always"
						? "Every song streams where the browser can"
						: "Songs stream when they pass the device's budget",
				);
			}
		})}
	>
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each [["auto", "Automatic", "Stream a song only when its decoded size passes what the device can be expected to hold (a quarter of its memory where Chrome reports it, else a gigabyte)."], ["always", "Always stream", "Stream every song where the browser can, whatever its size. For testing the streamed player on every song."]] as [value, label, blurb] (value)}
				<li>
					<label class="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-white/5">
						<input
							class="mt-1"
							{...setStemStreamingForm.fields.mode.as("radio", value)}
							checked={value === chosen}
							onchange={() => (chosen = value as typeof chosen)}
						/>
						<span>
							<span class="block font-600">{label}</span>
							<span class="block text-13px text-dim">{blurb}</span>
						</span>
					</label>
				</li>
			{/each}
		</ul>
		{#each setStemStreamingForm.fields.allIssues() ?? [] as issue (issue.message)}
			<p class="mt-2 text-sm text-red-400">{issue.message}</p>
		{/each}
		<div class="mt-4">
			<button
				class="button-accent"
				disabled={!!setStemStreamingForm.pending || chosen === data.mode}
			>
				{setStemStreamingForm.pending ? "Saving…" : "Save"}
			</button>
		</div>
	</form>
</section>

<section class="mt-10">
	<h2 class="heading-2">Chord model</h2>
	<p class="mt-1 text-sm opacity-90">
		The chord model reads a song's mix after its stems upload, and a project or song page posts the
		read for an older song when a member opens it. This reads the ones nobody has opened yet, a
		batch of {CHORDS_BATCH} at a time (a few minutes of the jobs function each).
	</p>
	<p class="mt-3 text-15px">
		{data.wantingChords === 0
			? "Every song with a mix has its chords."
			: `${data.wantingChords} ${data.wantingChords === 1 ? "song" : "songs"} with a mix ${data.wantingChords === 1 ? "has" : "have"} no chords yet.`}
	</p>
	<div class="mt-3">
		<button
			class="button-accent"
			type="button"
			disabled={reading || data.wantingChords === 0}
			onclick={readChords}
		>
			{reading ? "Posting…" : `Read the next ${Math.min(CHORDS_BATCH, data.wantingChords)}`}
		</button>
	</div>
</section>
