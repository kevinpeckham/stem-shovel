<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import type { DemoMenuItem } from "#lib/utils/demoMenuItems.js";

	/**
	 * A demo tile's ⋯ menu in the song page's Demos view (DemoPanel): its
	 * page, its downloads and, for an editor, Share…, the notes and Remove
	 * (demoMenuItems). A ContextMenu, so the menu is a native popover in the
	 * top layer: the player's box scrolls, and a menu drawn inside it was
	 * cut off at the box's edge on the last row (Kevin, 2026-11-14).
	 */
	interface Props {
		/** The demo's label, for the menu's accessible name. */
		label: string;
		items: DemoMenuItem[];
	}
	let { label, items }: Props = $props();

	/** The row's items as the menu takes them: a link to its page, a button for the rest. */
	let menuItems = $derived(
		items.map((item) => ({
			id: item.label,
			label: item.label,
			iconClass: item.icon,
			title: item.title ?? null,
			href: item.href ?? null,
			action: item.action,
		})),
	);
</script>

<!-- The row's menu: the downloads, out of the way of Play. -->
<div class="self-center">
	<ContextMenu
		ariaLabel="Menu for {label}"
		title="Demo menu"
		buttonBaseClasses="button button-xs border-current/10 flex items-center"
		iconClass="i-ph-dots-three-outline-vertical-fill"
		items={menuItems}
	/>
</div>
