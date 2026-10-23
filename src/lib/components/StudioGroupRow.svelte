<script lang="ts">
	import ContextMenu from "./ContextMenu.svelte";
	import { stemTintHex } from "#lib/constants/stemTints.js";
	import { studio } from "#lib/audio/studio.svelte.js";
	import type { StudioBus, StudioClip } from "#lib/val/StudioSchema.js";

	/**
	 * A group's row in the timeline (docs/multitrack-recorder.md "Folder
	 * tracks"): the folder bus's header (fold, name, mute, menu) and a lane
	 * that sketches the clips of every track under it, so a folded group
	 * still shows where its music is.
	 */
	interface Props {
		bus: StudioBus;
		depth: number;
		collapsed: boolean;
		/** The clips on the tracks under the group, at any depth. */
		clips: StudioClip[];
		laneWidth: number;
		pxPerSecond: number;
		headerWidth: number;
		height: number;
	}
	let { bus, depth, collapsed, clips, laneWidth, pxPerSecond, headerWidth, height }: Props =
		$props();
	const engine = studio;
	const tint = $derived(stemTintHex(bus.colour));
</script>

<div
	class="flex"
	style:width="{headerWidth + laneWidth}px"
	style:height="{height}px"
	data-group-row={bus.id}
	data-collapsed={collapsed || undefined}
>
	<div
		class="sticky left-0 z-10 flex shrink-0 items-center gap-1 overflow-hidden border-r border-b border-white/10 border-l-2 border-l-transparent bg-oxford-800 py-0.5 pr-2"
		style:width="{headerWidth}px"
		style:padding-left="{6 + depth * 12}px"
	>
		<button
			type="button"
			class="device-fader-button-sm"
			aria-expanded={!collapsed}
			aria-label="{collapsed ? 'Expand' : 'Collapse'} {bus.name}"
			title={collapsed ? "Show the group's tracks" : "Fold the group's tracks away"}
			onclick={() => engine.toggleGroupCollapsed(bus.id)}
		>
			<span
				class="{collapsed ? 'i-ph-caret-right' : 'i-ph-caret-down'} text-12px"
				aria-hidden="true"
			></span>
		</button>
		<input
			class="min-w-0 w-full bg-transparent text-12px font-600 text-blue-300 outline-none rounded px-1 hover-bg-white/5 focus-bg-white/10 {bus.muted
				? 'opacity-60'
				: ''}"
			style:color={tint && !bus.muted ? tint : undefined}
			type="text"
			maxlength="60"
			value={bus.name}
			aria-label="Group name"
			onchange={(e) => engine.renameBus(bus.id, e.currentTarget.value)}
			onkeydown={(e) => {
				if (e.key === "Enter") e.currentTarget.blur();
			}}
		/>
		<button
			type="button"
			class="device-fader-button-sm"
			aria-pressed={bus.muted}
			aria-label="Mute {bus.name}"
			title="Mute the group: every track under it"
			onclick={() => engine.toggleBusMute(bus.id)}>M</button
		>
		<ContextMenu
			ariaLabel="{bus.name} actions"
			clearButtonBaseClasses={true}
			buttonClasses="device-fader-menu-button-subtle"
			position="bottom right"
			items={[
				{
					id: "ungroup",
					kind: "button",
					label: "Ungroup",
					iconClass: "i-ph-folder-open",
					title: "The row goes; the tracks stay routed to the bus, which stays in the mixer",
					action: () => engine.setBusFolder(bus.id, false),
				},
				{
					id: "remove",
					kind: "button",
					label: "Remove group",
					iconClass: "i-ph-trash",
					title:
						"The group and its bus go; the tracks go where the group went (its bus, or the master), sends to it are dropped",
					action: () => engine.removeBus(bus.id),
				},
			]}
		/>
	</div>
	<!-- The sketch: a block per clip under the group, in the group's color. -->
	<div class="relative border-b border-white/10 bg-black/10" style:width="{laneWidth}px">
		{#each clips as clip (clip.id)}
			<div
				class="absolute top-1 bottom-1 rounded-sm opacity-45 {clip.muted ? 'opacity-20' : ''}"
				style:left="{clip.start * pxPerSecond}px"
				style:width="{Math.max(2, clip.duration * pxPerSecond)}px"
				style:background-color={tint ?? "#7fb2c2"}
				data-group-clip={clip.id}
			></div>
		{/each}
	</div>
</div>
