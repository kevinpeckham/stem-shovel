<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import type { ComponentProps } from "svelte";

	/**
	 * A menu at the pointer: Ctrl / ⌘-click or right-click on a waveform or
	 * a MIDI roll opens it where the pointer is. It is a ContextMenu whose
	 * trigger is a hidden anchor at those coordinates, so the menu is a native
	 * popover on the top layer (above a popped-out panel), flips at the
	 * viewport's edges and closes on a click outside, Escape or focus leaving
	 * it. Each new `at` opens it anew (the key remounts it); null renders
	 * nothing. The host builds the items from where the pointer was.
	 */
	interface Props {
		at: { x: number; y: number } | null;
		items: NonNullable<ComponentProps<typeof ContextMenu>["items"]>;
		ariaLabel?: string;
	}
	let { at, items, ariaLabel = "Actions at this spot" }: Props = $props();
</script>

{#key at}
	{#if at}
		<ContextMenu {at} {items} {ariaLabel} openState="open" />
	{/if}
{/key}
