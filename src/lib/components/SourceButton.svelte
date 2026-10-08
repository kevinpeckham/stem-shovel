<script lang="ts">
	import type { Snippet } from "svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";

	/**
	 * One input source on a device (the looper, the Idea Recorder): a button
	 * with the source's name and its level meter, a small settings menu
	 * joined to its right (squared where they meet, so the pair reads as one
	 * button; none without a `menu`), and whatever belongs under it (a gain
	 * or volume slider). The button's meaning is the page's: armed on the
	 * looper, in the take on the recorder.
	 */
	interface Props {
		label: string;
		/** The Phosphor icon class, or an `icon` snippet for a custom one. */
		iconClass?: string | null;
		icon?: Snippet;
		pressed: boolean;
		disabled?: boolean;
		title?: string | null;
		/** The level for the meter, 0 to 1. */
		level: number;
		onclick: () => void;
		/** The menu's content; absent, the button stands alone with rounded corners. */
		menu?: Snippet;
		/** Under the pair: a slider, a caption. */
		below?: Snippet;
	}
	let {
		label,
		iconClass = null,
		icon,
		pressed,
		disabled = false,
		title = null,
		level,
		onclick,
		menu,
		below,
	}: Props = $props();
</script>

<div class="grid gap-1 content-start">
	<div class="flex gap-px">
		<button
			class="device-button-sm px-3 grid gap-1 content-center min-w-120px flex-1 {pressed
				? 'text-accent'
				: ''} {menu ? 'rounded-r-none' : ''}"
			type="button"
			aria-pressed={pressed}
			{disabled}
			title={title ?? label}
			{onclick}
		>
			<span class="flex items-center justify-center gap-2 leading-none">
				{#if iconClass}
					<span class={iconClass} aria-hidden="true"></span>
				{:else if icon}
					<span class="grid place-items-center w-1em" aria-hidden="true">{@render icon()}</span>
				{/if}
				{label}
			</span>
			<span
				class="block h-1 w-full rounded bg-blue-100/10 overflow-hidden"
				role="meter"
				aria-label="{label} level"
				aria-valuemin="0"
				aria-valuemax="100"
				aria-valuenow={Math.round(level * 100)}
			>
				<span
					class="block h-full rounded {level > 0.85 ? 'bg-red-500' : 'bg-blue-300'}"
					style:width="{level * 100}%"
				></span>
			</span>
		</button>
		{#if menu}
			<ContextMenu
				ariaLabel="{label} settings"
				title="{label} settings"
				iconClass="i-ph-caret-down-bold"
				position="bottom right"
				buttonBaseClasses="device-button-sm px-2 rounded-l-none min-w-0 text-11px"
				buttonClasses={pressed ? "text-accent" : ""}
				popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
				items={[
					{ id: "heading", kind: "heading", label },
					{ id: "block", kind: "snippet", snippet: menu },
				]}
			/>
		{/if}
	</div>
	{@render below?.()}
</div>
