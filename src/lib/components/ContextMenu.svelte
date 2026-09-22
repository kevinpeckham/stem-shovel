<script lang="ts">
	import type { Snippet } from "svelte";
	import { placePopover } from "$lib/utils/anchorFallback";

	/**
	 * A ⋯ button opening a small menu of actions, links or custom snippets in
	 * a native popover, placed beside the button by CSS anchor positioning
	 * (`position-area`) with a JS fallback (src/lib/utils/anchorFallback.ts).
	 * Light dismiss, Escape and focus leaving the menu close it; `bind:openState`
	 * lets a parent open or close it too.
	 */

	type Position = "bottom left" | "bottom right" | "top left" | "top right";

	interface ContextMenuItem {
		/** The text of a plain item; a snippet item brings its own markup. */
		label?: string;
		action?: () => void | Promise<void> | null;
		href?: string | null;
		title?: string | null;
		target?: string | null;
		/** Fully custom item; can contain any markup, including interactive elements. **/
		snippet?: Snippet;
	}

	interface Props {
		ariaLabel?: string | null;
		buttonClasses?: string | null;
		disabled?: boolean;
		items?: ContextMenuItem[] | null;
		openState?: "open" | "closed";
		popoverClasses?: string | null;
		position?: Position | null;
	}

	let {
		ariaLabel = "More actions",
		buttonClasses = "",
		disabled = false,
		items = [],
		popoverClasses = "",
		position = "bottom left",
		openState = $bindable("closed"),
	}: Props = $props();

	// get component id
	const uid = $props.id();
	// const buttonId = $derived(`context-menu-${uid}-button`);
	const popoverId = $derived(`context-menu-${uid}-popover`);
	// const anchorName = $derived(`--context-menu-${uid}-anchor`);

	// state
	let buttonEl: HTMLElement | null = $state(null);
	let popoverEl: HTMLElement | null = $state(null);

	/** What the popover actually is (from its toggle events), so the effect below never loops. */
	let actuallyOpen = $state(false);
	let stopFallback: (() => void) | null = null;

	// Parent -> popover: bind:openState opens or closes it; a matching state does nothing.
	$effect(() => {
		if (!popoverEl) return;
		if (openState === "open" && !actuallyOpen) popoverEl.showPopover();
		if (openState === "closed" && actuallyOpen) popoverEl.hidePopover();
	});
	$effect(() => () => stopFallback?.());

	function onToggle(e: ToggleEvent) {
		actuallyOpen = e.newState === "open";
		openState = actuallyOpen ? "open" : "closed";
		stopFallback?.();
		stopFallback = null;
		if (actuallyOpen && buttonEl && popoverEl) {
			// "bottom left" (span-left) lines the menu up with the button's right edge.
			const where = position ?? "bottom left";
			stopFallback = placePopover(popoverEl, buttonEl, {
				side: where.startsWith("top") ? "top" : "bottom",
				align: where.endsWith("left") ? "end" : "start",
			});
		}
	}

	// Close when focus moves out of the popover (e.g. Tab past the last item),
	// so an open panel isn't left behind when the user is no longer in it
	function onFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && !popoverEl?.contains(next)) popoverEl?.hidePopover();
	}

	// Friendly position names -> static classes (no per-instance values, so CSP-safe)
	const positionClasses: Record<Position, string> = {
		"bottom left": "[position-area:bottom_span-left] [margin:0.25rem_0_0]",
		"bottom right": "[position-area:bottom_span-right] [margin:0.25rem_0_0]",
		"top left": "[position-area:top_span-left] [margin:0_0_0.25rem]",
		"top right": "[position-area:top_span-right] [margin:0_0_0.25rem]",
	};

	async function run(item: ContextMenuItem) {
		popoverEl?.hidePopover();
		await item.action?.();
	}
</script>

<div class="grid">
	<button
		bind:this={buttonEl}
		type="button"
		aria-label={ariaLabel}
		{disabled}
		popovertarget={popoverId}
		class="
			bg-dark
			cursor-pointer
			disabled-text-current/10
			px-3
			py-2
			grid
			place-items-center
			border
			border-current/10
			leading-none
			rounded-md
			{buttonClasses}"
	>
		<span class="i-ph-dots-three-vertical-bold" aria-hidden="true"></span>
	</button>
	<div
		id={popoverId}
		bind:this={popoverEl}
		popover="auto"
		class="{positionClasses[
			position ?? 'bottom left'
		]} h-auto overflow-hidden absolute shadow-lg bg-oxford rounded-md mt-1 text-current px-4 pt-3 pb-4 border border-current/20"
		ontoggle={onToggle}
		onfocusout={onFocusOut}
	>
		<ul class="m-0 p-0 list-none">
			{#each items ?? [] as item, i (item.label ?? i)}
				<li>
					{#if item.snippet}
						{@render item.snippet()}
					{:else if item.href}
						<a
							href={item.href}
							title={item.title}
							target={item.target}
							onclick={() => popoverEl?.hidePopover()}
							class="block py-1.5"
						>
							{item.label}
						</a>
					{:else if item.action}
						<button
							type="button"
							title={item.title}
							onclick={() => run(item)}
							class="block w-full text-left rounded px-2 py-1.5 hover:bg-white/10 focus-visible:bg-white/10"
						>
							{item.label}
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	</div>
</div>
