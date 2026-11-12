<script lang="ts">
	import type { DemoMenuItem } from "#lib/utils/demoMenuItems.js";

	/** A demo tile's ⋯ menu in the song page's Demos view (DemoPanel): its page, its downloads and, for an editor, Share… and Remove (demoMenuItems). */
	interface Props {
		/** The demo's label, for the menu's accessible name. */
		label: string;
		items: DemoMenuItem[];
	}
	let { label, items }: Props = $props();
</script>

<!-- The row's menu: the downloads, out of the way of Play. -->
<details class="relative self-center">
	<summary
		class="button button-xs border-current/10 flex items-center list-none [&::-webkit-details-marker]:hidden"
		title="Demo menu"
		aria-label="Menu for {label}"
	>
		<span class="i-ph-dots-three-outline-vertical-fill" aria-hidden="true"></span>
	</summary>
	<div
		class="absolute top-full right-0 z-20 mt-1 min-w-48 rounded border border-white/15 bg-oxford p-1 text-sm font-400 shadow-lg"
		role="menu"
		tabindex="-1"
		onclick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}
		onkeydown={(e) => {
			if (e.key === "Escape") (e.currentTarget.parentElement as HTMLDetailsElement).open = false;
		}}
	>
		{#each items as item (item.label)}
			<svelte:element
				this={item.element}
				type={item.type}
				class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
				role="menuitem"
				tabindex="0"
				href={item.href}
				title={item.title}
				onclick={item.action}
			>
				<span class={item.icon} aria-hidden="true"></span>{item.label}
			</svelte:element>
		{/each}
	</div>
</details>
