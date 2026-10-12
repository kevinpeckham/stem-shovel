<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { setStemStreamingForm } from "#lib/remote/admin.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { refreshAll } from "$app/navigation";

	let { data } = $props();
	let chosen = $derived(data.mode);
</script>

<svelte:head>
	<title>{pageTitle("Playback · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">Playback</h1>
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
