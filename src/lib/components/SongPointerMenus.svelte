<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import PointerMenu from "#lib/components/PointerMenu.svelte";
	import type { SongComments } from "#lib/state/songComments.svelte.js";
	import {
		commentHere,
		seekHere,
		type SongPointerMenus,
	} from "#lib/state/songPointerMenus.svelte.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	interface Props {
		/** Where each menu was opened, or null. */
		menus: SongPointerMenus;
		/** The Demos view's panel: Seek here on a demo. */
		demoPanel: { seekTo: (seconds: number) => void } | null;
		/** The Stem Player's engine: Seek here on the mix. */
		engine: StemEngine | null;
		/** The comment popover: Comment here. */
		comments: SongComments;
		/** A song position as the comment form takes it (SongChanges.editPos). */
		editPos: (seconds: number) => string;
		/** The user may comment (a demo's menu offers Comment here). */
		canComment: boolean;
		/** The user may edit the song (the mix's menu offers Comment here). */
		canEdit: boolean;
		/** A song position as the player's readout shows it. */
		showPos: (seconds: number) => string;
	}
	let { menus, demoPanel, engine, comments, editPos, canComment, canEdit, showPos }: Props =
		$props();

	// Ctrl / ⌘-click (or right-click) on a waveform: a menu at the pointer (PointerMenu). The player
	// has its own for the stem rows, with "Seek here"; the page adds "Comment here" to it and keeps the
	// menus of the Comments row's mix waveform and of a demo's.
</script>

<!-- Ctrl / ⌘-click menu on a demo's waveform, at the pointer -->
<PointerMenu
	at={menus.demoAt}
	items={menus.demoAt
		? [
				{
					kind: "notice",
					notice: `${menus.demoAt.demo.label} · ${formatTime(menus.demoAt.seconds, 1)}`,
				},
				seekHere(() => demoPanel?.seekTo(menus.demoAt?.seconds ?? 0)),
				...(canComment
					? [
							commentHere(() =>
								comments.open({
									at: formatTime(menus.demoAt?.seconds ?? 0, 2),
									demoId: menus.demoAt?.demo.id ?? "",
								}),
							),
						]
					: []),
			]
		: []}
	ariaLabel="Actions at this spot in the demo"
/>

<!-- Ctrl / ⌘-click menu on the Comments row's mix waveform, at the pointer (the stem rows' is the player's own) -->
<PointerMenu
	at={menus.mixAt}
	items={menus.mixAt
		? [
				{ kind: "notice", notice: `Mix · ${showPos(menus.mixAt.seconds)}` },
				seekHere(() => engine?.seek(menus.mixAt?.seconds ?? 0)),
				...(canEdit
					? [commentHere(() => comments.open({ at: editPos(menus.mixAt?.seconds ?? 0) }))]
					: []),
			]
		: []}
	ariaLabel="Actions at this spot in the mix"
/>
