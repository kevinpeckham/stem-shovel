<script lang="ts" generics="T extends string">
	/**
	 * Single-select combo box (replicator's ComboBox in this app's clothes): a
	 * trigger showing the current selection that opens a listbox. Keyboard
	 * complete (arrows / Home / End / Enter / Escape), closes on an outside
	 * pointerdown, ARIA combobox + listbox semantics. Generic over the value
	 * union so `bind:value` keeps the host's literal type. The trigger looks
	 * like a `field`; pass `buttonClass` for the toolbar look.
	 */
	interface ComboBoxOption {
		value: T;
		label: string;
		/** Muted text after the label, "2 takes" or a hint. */
		description?: string;
	}

	interface Props {
		options: ComboBoxOption[];
		value: T;
		onchange?: (value: T) => void;
		ariaLabel: string;
		id?: string;
		disabled?: boolean;
		/** Shown on the trigger when no option matches `value`. */
		placeholder?: string;
		buttonClass?: string;
		listClass?: string;
	}
	let {
		options,
		value = $bindable(),
		onchange,
		ariaLabel,
		id = "combo-box",
		disabled = false,
		placeholder = "",
		buttonClass = "field text-left text-sm disabled:opacity-60",
		listClass = "",
	}: Props = $props();

	let isOpen = $state(false);
	let activeIndex = $state(-1);
	let rootEl = $state<HTMLElement | null>(null);
	let buttonEl = $state<HTMLButtonElement | null>(null);

	const selected = $derived(options.find((o) => o.value === value));

	function open() {
		if (disabled) return;
		isOpen = true;
		activeIndex = Math.max(
			0,
			options.findIndex((o) => o.value === value),
		);
	}
	function close() {
		isOpen = false;
		activeIndex = -1;
	}
	function pick(option: ComboBoxOption) {
		value = option.value;
		onchange?.(option.value);
		close();
		buttonEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!isOpen) {
			if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				open();
			}
			return;
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				activeIndex = Math.min(activeIndex + 1, options.length - 1);
				break;
			case "ArrowUp":
				e.preventDefault();
				activeIndex = Math.max(activeIndex - 1, 0);
				break;
			case "Home":
				e.preventDefault();
				activeIndex = 0;
				break;
			case "End":
				e.preventDefault();
				activeIndex = options.length - 1;
				break;
			case "Enter":
			case " ": {
				e.preventDefault();
				const option = options[activeIndex];
				if (option) pick(option);
				break;
			}
			case "Escape":
				e.preventDefault();
				close();
				buttonEl?.focus();
				break;
			case "Tab":
				close();
				break;
		}
	}

	function handleWindowPointerDown(e: PointerEvent) {
		if (isOpen && rootEl && !rootEl.contains(e.target as Node)) close();
	}
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<div class="relative block w-full" bind:this={rootEl}>
	<button
		type="button"
		{id}
		bind:this={buttonEl}
		class="{buttonClass} flex items-center gap-2"
		role="combobox"
		aria-expanded={isOpen}
		aria-haspopup="listbox"
		aria-controls="{id}-listbox"
		aria-label={ariaLabel}
		{disabled}
		onclick={() => (isOpen ? close() : open())}
		onkeydown={handleKeydown}
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
			class="i-ph-caret-down shrink-0 text-12px opacity-70 transition-transform {isOpen
				? 'rotate-180'
				: ''}"
			aria-hidden="true"
		></span>
	</button>

	{#if isOpen}
		<ul
			id="{id}-listbox"
			role="listbox"
			aria-label={ariaLabel}
			class="absolute left-0 top-full z-30 mt-1 max-h-64 min-w-full overflow-y-auto rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg {listClass}"
		>
			{#each options as option, i (option.value)}
				<li role="presentation">
					<button
						type="button"
						role="option"
						aria-selected={option.value === value}
						class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left {i === activeIndex
							? 'bg-white/10'
							: ''}"
						onpointerenter={() => (activeIndex = i)}
						onclick={() => pick(option)}
					>
						<span
							class="i-ph-check shrink-0 {option.value === value ? '' : 'invisible'}"
							aria-hidden="true"
						></span>
						<span class="min-w-0 grow truncate">{option.label}</span>
						{#if option.description}
							<span class="shrink-0 tabular-nums opacity-60">{option.description}</span>
						{/if}
					</button>
				</li>
			{/each}
			{#if options.length === 0}
				<li class="px-2 py-1.5 opacity-70" role="presentation">Nothing to choose</li>
			{/if}
		</ul>
	{/if}
</div>
