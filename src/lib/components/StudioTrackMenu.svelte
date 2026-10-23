<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { STEM_TINTS, stemTintHex } from "#lib/constants/stemTints.js";
	import { studio } from "#lib/audio/studio.svelte.js";
	import type { StudioTrack } from "#lib/val/StudioSchema.js";

	/**
	 * A Dawn track's ⋯ menu (move up and down, the tint, render a MIDI
	 * track, remove), shared by the lane header (StudioTimeline) and the
	 * Stage's strip (MixerStage), so the two views offer the same actions.
	 */
	interface Props {
		track: StudioTrack;
		index: number;
		/** Render a MIDI track to an audio track (the page says what happened). */
		onrender?: (track: StudioTrack) => void;
		/** Freeze the track into one rendering, or bring its clips back (D8; the page says what happened). */
		onfreeze?: (track: StudioTrack) => void;
		onunfreeze?: (track: StudioTrack) => void;
		buttonClasses?: string;
		position?: "bottom left" | "bottom right";
	}
	let {
		track,
		index,
		onrender,
		onfreeze,
		onunfreeze,
		buttonClasses = "device-fader-menu-button-subtle",
		position = "bottom right",
	}: Props = $props();
	const engine = studio;
	const isMidi = (t: StudioTrack) => t.kind === "midi";
	const clipsOf = (t: StudioTrack) => engine.arrangement.clips.filter((c) => c.trackId === t.id);
</script>

<!-- The track's tint (constants/stemTints.ts, as the stem player's): swatches, none first. -->
{#snippet trackTint()}
	<div class="px-3 py-1.5" role="group" aria-label="{track.name} tint">
		<div class="mb-1 text-xs text-dim">Tint</div>
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				class="h-5 w-5 rounded-full border {track.colour
					? 'border-white/30 hover:border-white/70'
					: 'border-white ring-1 ring-white/60'} bg-blue-300/60"
				aria-label="No tint"
				aria-pressed={!track.colour}
				title="No tint"
				onclick={() => engine.setTint(track.id, null)}
			></button>
			{#each STEM_TINTS as t (t.id)}
				<button
					type="button"
					class="h-5 w-5 rounded-full border {track.colour === t.id
						? 'border-white ring-1 ring-white/60'
						: 'border-white/30 hover:border-white/70'}"
					style:background-color={t.hex}
					aria-label="Tint {t.name}"
					aria-pressed={track.colour === t.id}
					title={t.name}
					onclick={() => engine.setTint(track.id, t.id)}
				></button>
			{/each}
			<!-- Any color (docs/multitrack-recorder.md "Track colors"): a round swatch over the browser's color picker; it wears the color once one is chosen. -->
			<label
				class="relative h-5 w-5 overflow-hidden rounded-full border cursor-pointer {(track.colour?.startsWith(
					'#',
				) ?? false)
					? 'border-white ring-1 ring-white/60'
					: 'border-white/30 hover:border-white/70'}"
				style:background={(track.colour?.startsWith("#") ?? false)
					? track.colour
					: "conic-gradient(#c98a9c, #d2bc8f, #95b59a, #7fb2c2, #a99bc9, #c98a9c)"}
				title="Any color"
			>
				<input
					type="color"
					class="absolute -inset-2 h-9 w-9 cursor-pointer opacity-0"
					aria-label="Any color"
					value={stemTintHex(track.colour) ?? "#7fb2c2"}
					oninput={(e) => engine.setTint(track.id, e.currentTarget.value)}
				/>
			</label>
		</div>
	</div>
{/snippet}

<ContextMenu
	ariaLabel="{track.name} actions"
	clearButtonBaseClasses={true}
	{buttonClasses}
	{position}
	items={[
		{
			id: "up",
			kind: "button",
			label: "Move up",
			iconClass: "i-ph-arrow-up",
			disabled: index === 0,
			action: () => engine.moveTrack(track.id, index - 1),
		},
		{
			id: "down",
			kind: "button",
			label: "Move down",
			iconClass: "i-ph-arrow-down",
			disabled: index === engine.arrangement.tracks.length - 1,
			action: () => engine.moveTrack(track.id, index + 1),
		},
		{ id: "d", kind: "divider" },
		{ id: "tint", kind: "snippet", snippet: trackTint },
		{ id: "d2", kind: "divider" },
		{
			id: "render",
			kind: "button",
			label: "Render to audio track",
			iconClass: "i-ph-waveform",
			title:
				"Play the notes through the instrument into a new audio track (in real time), so the song can bounce",
			condition: isMidi(track),
			disabled: engine.running || !clipsOf(track).some((c) => c.notes?.length),
			action: () => onrender?.(track),
		},
		{
			id: "freeze",
			kind: "button",
			label: "Freeze track",
			iconClass: "i-ph-snowflake",
			title:
				"Render the clips through the inserts into one recording that stands in for them (the fader and pan stay live), so the track costs nothing to play",
			condition: !track.frozen,
			disabled: engine.running || clipsOf(track).length === 0,
			action: () => onfreeze?.(track),
		},
		{
			id: "unfreeze",
			kind: "button",
			label: "Unfreeze track",
			iconClass: "i-ph-sun",
			title: "The clips and inserts back as they were",
			condition: !!track.frozen,
			disabled: engine.running,
			action: () => onunfreeze?.(track),
		},
		{
			id: "remove",
			kind: "button",
			label: "Remove track",
			iconClass: "i-ph-trash",
			action: () => {
				const n = clipsOf(track).length;
				if (n && !confirm(`Remove “${track.name}” and its ${n} ${n === 1 ? "clip" : "clips"}?`))
					return;
				engine.removeTrack(track.id);
			},
		},
	]}
/>
