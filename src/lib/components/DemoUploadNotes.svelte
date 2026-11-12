<script lang="ts">
	import { DEMO_NOTES_MAX } from "#lib/constants/demoFormats.js";
	import type { DemoUploads } from "#lib/state/demoUploads.svelte.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * The step between picking demo files and uploading them (rendered once
	 * by the song page, for every Upload demo button): each picked file with
	 * an optional notes field, then Upload or Cancel. It opens when the pick
	 * passes the checks (`demos.pending`), as a popover of the file input,
	 * so the settings popover holding that input stays open under it;
	 * Escape or a press outside drops the pick, as Cancel does.
	 */
	interface Props {
		demos: DemoUploads;
	}
	let { demos }: Props = $props();

	/** Whether the popover is showing (its toggle events), read by the attachment without depending on it. */
	let shown = false;

	/** Show the popover for a pending pick, focused on the first notes field; hide it once the pick is gone. */
	function followPick(el: HTMLElement) {
		if (!demos.pending) {
			if (shown) el.hidePopover();
			return;
		}
		if (!shown) el.showPopover({ source: demos.pickedFrom ?? undefined });
		el.querySelector("textarea")?.focus();
	}
</script>

<div
	id="demo-upload-notes"
	popover="auto"
	role="dialog"
	aria-labelledby="demo-upload-notes-title"
	ontoggle={(e) => {
		shown = e.newState === "open";
		if (!shown && demos.pending) demos.cancel();
	}}
	{@attach followPick}
	class="m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<h2 id="demo-upload-notes-title" class="heading-2 mb-1">
		Upload {demos.pending?.length === 1 ? "demo" : "demos"}
	</h2>
	<p class="mb-4 text-sm text-dim">Notes are optional; they show with the demo.</p>
	{#if demos.pending}
		<ul class="grid gap-4" aria-label="Picked files">
			{#each demos.pending as item, i (i)}
				<li class="grid gap-1">
					<p class="flex items-baseline gap-2 text-sm">
						<span class="truncate font-500">{item.file.name}</span>
						<span class="shrink-0 text-dim">{formatBytes(item.file.size)}</span>
					</p>
					<label class="grid gap-1 text-13px text-dim">
						Notes
						<textarea
							class="field text-sm"
							rows="3"
							maxlength={DEMO_NOTES_MAX}
							placeholder="What this take is, what to listen for"
							bind:value={item.notes}></textarea>
					</label>
				</li>
			{/each}
		</ul>
	{/if}
	<div class="mt-4 flex flex-wrap gap-2">
		<button class="button button-sm button-accent" type="button" onclick={() => demos.start()}>
			<span class="i-ph-upload-simple" aria-hidden="true"></span>
			Upload
		</button>
		<button class="button button-sm" type="button" onclick={() => demos.cancel()}>Cancel</button>
	</div>
</div>
