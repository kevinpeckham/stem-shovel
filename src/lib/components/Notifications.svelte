<script lang="ts">
	import { notifications } from "#lib/state/notifications.svelte.js";

	/**
	 * The notification stack: fixed to the bottom-right corner so it never
	 * pushes content around; newest at the bottom. Screen readers get the
	 * region as a polite live region.
	 */
	const tone = {
		success: "border-accent/60",
		info: "border-blue-300/60",
		error: "border-red-400/70",
	} as const;

	/**
	 * The stack is a manual popover, in the browser's top layer: shown on
	 * mount and shown again whenever the list changes (the factory's argument),
	 * so it lands above any popover opened since (the song settings, say),
	 * which would otherwise cover it. Showing a manual popover closes no auto
	 * popover.
	 */
	const onTop = (count: number) => (el: HTMLElement) => {
		if (typeof el.showPopover !== "function") return;
		// Set here, not in the markup: without the API (jsdom hides a popover it
		// cannot open) the div stays a plain fixed one, as before.
		el.popover = "manual";
		if (el.matches(":popover-open")) {
			// Nothing to raise once the list is empty.
			if (count === 0) return;
			el.hidePopover();
		}
		el.showPopover();
	};
</script>

<!-- A manual popover once mounted (onTop): the UA's popover styles undone (inset, margin, size, border, padding, background, overflow); a closed popover stays hidden. -->
<div
	{@attach onTop(notifications.items.length)}
	class="pointer-events-none fixed inset-x-4 top-auto bottom-4 z-50 m-0 h-auto w-auto flex flex-col items-end gap-2 overflow-visible border-0 bg-transparent p-0 [&[popover]:not(:popover-open)]:hidden sm:inset-x-auto sm:right-6 sm:bottom-6"
	aria-live="polite"
	aria-relevant="additions"
>
	{#each notifications.items as n (n.id)}
		<div
			class="pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border-l-4 bg-oxford-800 px-4 py-3 text-15px text-neutral-100 shadow-lg shadow-black/50 {tone[
				n.kind
			]}"
			role={n.kind === "error" ? "alert" : "status"}
			data-notification={n.kind}
		>
			<p class="min-w-0 grow">{n.message}</p>
			{#if n.dismissable}
				<button
					type="button"
					class="shrink-0 opacity-60 hover-opacity-100"
					aria-label="Dismiss"
					onclick={() => notifications.dismiss(n.id)}
				>
					<span class="block i-ph-x"></span>
				</button>
			{/if}
		</div>
	{/each}
</div>
