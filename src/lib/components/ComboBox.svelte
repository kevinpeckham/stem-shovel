<script lang="ts" generics="T extends string">
	/**
	 * Single-select combobox: a trigger showing the current selection that
	 * opens a listbox popover. Keyboard support: arrows, Home, End, Enter,
	 * Space, Escape. ARIA combobox + listbox pattern.
	 */
	import { placePopover } from "$lib/utils/anchorFallback";

	interface ComboBoxOption {
		value: T;
		label: string;
		/** Muted text after the label, "2 takes" or a hint. */
		description?: string;
	}

	interface Props {
		ariaLabel: string;
		buttonClasses?: string;
		disabled?: boolean;
		onchange?: (value: T) => void;
		options: ComboBoxOption[];
		openState: "open" | "closed";
		placeholder?: string;
		popoverClasses?: string;
		value: T;
	}
	let {
		ariaLabel,
		buttonClasses = "",
		disabled = false,
		popoverClasses = "",
		options,
		openState = $bindable("closed"),
		onchange,
		placeholder = "",
		value = $bindable(),
	}: Props = $props();

	// get component id
	const uid = $props.id();
	const buttonId = $derived(`combobox-${uid}-button`);
	const popoverId = $derived(`combobox-${uid}-popover`);

	// state
	let buttonEl = $state<HTMLButtonElement | null>(null);
	let popoverEl = $state<HTMLUListElement | null>(null);

	// Index of the highlighted option (for aria-activedescendant)
	let activeIndex = $state(-1);

	// Cleanup for the JS positioning fallback while the popover is open
	let stopFallback: (() => void) | null = null;

	// derived state
	const selected = $derived(options.find((o) => o.value === value));
	const optionId = (i: number) => `${popoverId}-opt-${i}`;

	// Open through the button so it becomes the popover's invoker, and therefore its implicit anchor.
		// Calling showPopover() directly would leave the popover without an anchor.
		function open() {
			if (!popoverEl?.matches(":popover-open")) buttonEl?.click();
		}

	// Parent -> popover: let bind:openState open/close it too.
	// No loop: when the popover already matches, this does nothing.
	$effect(() => {
		if (!popoverEl) return;
		const isOpen = popoverEl.matches(":popover-open");
		if (openState === "open" && !isOpen) open();
		if (openState === "closed" && isOpen) popoverEl.hidePopover();
	});

	// Remove fallback listeners if the component unmounts while open
		$effect(() => () => stopFallback?.());

 /// Before opening: start the highlight on the current selection.
 // Don't change openState here, because the effect would try to show the popover again mid-show.
 function onBeforeToggle(e: ToggleEvent) {
	if (e.newState === "open") {
		activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
	}
 }

 // After the change: sync state. :popover-open now matches,
 // so the $effect below does nothing and there's no loop.
 function onToggle(e: ToggleEvent) {
	openState = e.newState as "open" | "closed";

	if (e.newState === "open" && popoverEl && buttonEl) {
				stopFallback = placePopover(popoverEl, buttonEl, { align: "stretch" });
				scrollActive();
			} else {
				stopFallback?.();
				stopFallback = null;
			}
 }

	function pick(option: ComboBoxOption) {
		value = option.value;
		onchange?.(option.value);
		popoverEl?.hidePopover();
		buttonEl?.focus();
	}

	// Scroll the highlighted option into view
	function scrollActive() {
		document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
	}

	function onKeydown(e: KeyboardEvent) {
			if (disabled || options.length === 0) return;
			const isOpen = openState === "open";
			const last = options.length - 1;

			switch (e.key) {
				case "ArrowDown":
				case "ArrowUp": {
					e.preventDefault();
					if (!isOpen) {
						popoverEl?.showPopover();
						return;
					}
					const step = e.key === "ArrowDown" ? 1 : -1;
					activeIndex = Math.min(last, Math.max(0, activeIndex + step));
					scrollActive();
					break;
				}
				case "Home":
				case "End":
					if (!isOpen) return;
					e.preventDefault();
					activeIndex = e.key === "Home" ? 0 : last;
					scrollActive();
					break;
				case "Enter":
				case " ":
					// When closed, let the button's own click open it via popovertarget
					if (!isOpen) return;
					e.preventDefault();
					if (activeIndex >= 0) pick(options[activeIndex]);
					break;
				// Escape: popover="auto" already closes on Esc
			}
		}

</script>


<div
	class="relative block w-full"
	>
	<button
		type="button"
		id={buttonId}
		bind:this={buttonEl}
		class="
			bg-dark
			disabled-text-current/10
			flex
			gap-2
			items-center
			rounded-md
			px-4
			py-2
			text-0.95em
			text-current/90
			text-left
			w-full
			{buttonClasses}"
		role="combobox"
		aria-controls="{popoverId}"
		aria-expanded={openState === "open"}
		aria-haspopup="listbox"
		aria-label={ariaLabel}
		aria-activedescendant={openState === "open" && activeIndex >= 0 ? optionId(activeIndex) : undefined}
		{disabled}
		popovertarget={popoverId}
		onkeydown={onKeydown}
	>
		<span class="min-w-0 grow truncate">
			{#if selected}
				{selected.label}{#if selected.description}
					<span class="ml-1.5 opacity-60">{selected.description}</span>{/if}
			{:else}
				<span class="text-slate-400">{placeholder}</span>
			{/if}
		</span>
		<span
			class="i-ph-caret-down shrink-0 text-12px opacity-70 transition-transform {openState === "open"
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		></span>
	</button>


		<ul
			id="{popoverId}"
			role="listbox"
			bind:this={popoverEl}
			aria-label={ariaLabel}
			popover="auto"
			class="
				[position-area:bottom_center]
				[margin:0.25rem_0_0]
				max-h-64
				w-full
				overflow-y-auto
				rounded
				bg-oxford
				px-0
				pt-1
				pb-3
				shadow
				shadow-dark
				text-current
				border-none
				{popoverClasses}"
				onbeforetoggle={onBeforeToggle}
				ontoggle={onToggle}
		>
			<!-- <ul class="grid w-full h-full grid-cols-1 gap-0"> -->
			{#each options as option, i (option.value)}
				<!-- Not focusable: focus stays on the trigger (aria-activedescendant) -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<li
						id={optionId(i)}
						role="option"
						aria-selected={option.value === value}
						class="flex w-full items-center gap-2 px-2 py-1.5 text-left hover-bg-blue-300/10 {option.value === value ? 'bg-white/5' : ''}"
						onmousedown={(e) => e.preventDefault()}
						onmouseenter={() => (activeIndex = i)}
						onclick={() => pick(option)}
					>
						<span
							class="i-ph-check shrink-0 {option.value === value ? '' : 'invisible'}"
							aria-hidden="true"
						></span>
						<span class="min-w-0 grow truncate text-current/90">{option.label}</span>
						{#if option.description}
							<span class="shrink-0 tabular-nums opacity-60">{option.description}</span>
						{/if}

				</li>
			{/each}

			{#if options.length === 0}
				<li class="px-2 py-1.5 opacity-70" role="presentation">Nothing to choose</li>
			{/if}
		</ul>
	</div>
