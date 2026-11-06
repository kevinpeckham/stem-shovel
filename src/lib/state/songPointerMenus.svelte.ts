import type { ComponentProps } from "svelte";
import type PointerMenu from "#lib/components/PointerMenu.svelte";

type MenuItem = NonNullable<ComponentProps<typeof PointerMenu>["items"]>[number];
/** A menu's "Seek here" item. */
export const seekHere = (action: () => void): MenuItem => ({
	label: "Seek here",
	iconClass: "i-ph-skip-forward",
	action,
});
/** A menu's "Comment here" item: the comment form opens with the spot's position filled in. */
export const commentHere = (action: () => void): MenuItem => ({
	label: "Comment here",
	iconClass: "i-ph-hands-clapping-bold",
	action,
});

/** Where a demo's waveform was Ctrl / ⌘-clicked or right-clicked: the demo, the spot in it and the pointer. */
interface DemoMenuAt {
	demo: { id: string; label: string };
	seconds: number;
	x: number;
	y: number;
}

/** Where the Comments row's mix waveform was Ctrl / ⌘-clicked or right-clicked. */
interface MixMenuAt {
	seconds: number;
	x: number;
	y: number;
}

/**
 * The song page's menus at the pointer (SongPointerMenus): Ctrl / ⌘-click
 * (or right-click) on a demo's waveform or on the Comments row's mix waveform
 * opens one where the pointer is. The player has its own for the stem rows.
 */
export class SongPointerMenus {
	/** The ⌘-click menu on a demo's waveform: Seek here, Comment here. */
	demoAt = $state<DemoMenuAt | null>(null);
	/** The menu on the Comments row's mix waveform. */
	mixAt = $state<MixMenuAt | null>(null);

	/** DemoPanel's `oncontext`. */
	openDemo(demo: { id: string; label: string }, seconds: number, x: number, y: number) {
		this.demoAt = { demo, seconds, x, y };
	}

	/** CommentTimeline's `oncontext`. */
	openMix(seconds: number, x: number, y: number) {
		this.mixAt = { seconds, x, y };
	}
}
