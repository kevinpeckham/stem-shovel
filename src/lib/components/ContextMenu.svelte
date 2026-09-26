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
		/** Show the item at all (default yes). */
		condition?: boolean | (() => boolean);
		disabled?: boolean | null;
		/** The text of a plain item, rendered as HTML (never user text); a snippet item brings its own markup. */
		label?: string | (() => string);
		action?: () => void | Promise<void> | null;
		href?: string | null;
		iconClass?: string | null;
		kind?: "link" | "button" | "notice" | "snippet" | "divider" | null;
		notice?: string | null;
		popovertarget?: string | null;
		title?: string | null;
		target?: string | null;
		/** Fully custom item; can contain any markup, including interactive elements. **/
		snippet?: Snippet;
		id?: string;
	}

	interface Props {
		ariaLabel?: string | null;
		buttonClasses?: string | null;
		disabled?: boolean;
		/** The trigger's icon; the ⋯ by default. */
		iconClass?: string;
		items?: ContextMenuItem[] | null;
		openState?: "open" | "closed";
		popoverClasses?: string | null;
		position?: Position | null;
		title?: string | null;
	}

	let {
		ariaLabel = "More actions",
		buttonClasses = "",
		disabled = false,
		iconClass = "i-ph-dots-three-vertical-bold",
		items = [],
		popoverClasses = "",
		position = "bottom left",
		openState = $bindable("closed"),
		title = null,
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
	<!-- button -->
	<button
		bind:this={buttonEl}
		type="button"
		aria-label={ariaLabel}
		{disabled}
		popovertarget={popoverId}
		{title}
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
			disabled-opacity-60
			{buttonClasses}"
	>
		<span class={iconClass} aria-hidden="true"></span>
	</button>

	<!-- popover -->
	<div
		id={popoverId}
		bind:this={popoverEl}
		popover="auto"
		class="{positionClasses[
			position ?? 'bottom left'
		]} h-auto overflow-hidden absolute bg-oxford rounded-md mt-1 text-current px-0 pt-3 pb-4 border border-current/0 text-0.9em {popoverClasses}"
		ontoggle={onToggle}
		onfocusout={onFocusOut}
	>
		<ul class="m-0 p-0 list-none grid grid-cols-1">
			{#each items ?? [] as item, i (item.id ?? i)}
				{#if item.condition == null || (typeof item.condition === "function" ? item.condition() : item.condition)}
					<li class="bg-transparent">
						{#if item.snippet && (item.kind === "snippet" || !item.kind)}
							{@render item.snippet()}
						{:else if item.href && (item.kind === "link" || !item.kind)}
							<a
								id={item.id ?? null}
								href={item.href}
								title={item.title}
								target={item.target}
								onclick={() => popoverEl?.hidePopover()}
								class="block w-full text-left opacity-90 px-3 py-1.5 hover-bg-blue-100/10 hover-opacity-100 focus-visible:bg-white/10"
							>
								{#if item.notice}
									<div>{item.notice}</div>
								{/if}
								<div class="flex items-center gap-2">
									{#if item.iconClass}
										<div class="w-1em {item.iconClass}"></div>
									{/if}
									<span>{@html typeof item.label === "function" ? item.label() : item.label}</span>
								</div>
							</a>
						{:else if (item.action && !item.kind) || item.kind === "button"}
							<button
								id={item.id ?? null}
								disabled={item.disabled ?? false}
								type="button"
								title={item.title}
								onclick={() => run(item)}
								popovertarget={item.popovertarget ?? null}
								class="block w-full text-left opacity-90 px-3 py-1.5 hover-bg-blue-100/10 hover-opacity-100 disabled-opacity-60 disabled-hover-bg-transparent focus-visible-bg-white/10"
							>
								<div class="flex items-center gap-2">
									{#if item.iconClass}
										<div class="w-1em {item.iconClass}"></div>
									{/if}
									<span>{@html typeof item.label === "function" ? item.label() : item.label}</span>
								</div>
							</button>
						{:else if item.notice && (item.kind === "notice" || !item.kind)}
							<div class="border-b border-current/20 px-3 pb-2 opacity-80">
								{item.notice}
							</div>
						{:else if item.kind === "divider"}
							<div class="border-b border-current/10 px-3 pb-2 opacity-80"></div>
						{/if}
					</li>
				{/if}
			{/each}
		</ul>
	</div>
</div>
