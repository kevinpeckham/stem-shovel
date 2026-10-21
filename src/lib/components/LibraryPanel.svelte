<script lang="ts">
	import { formatKhz } from "#lib/utils/formatKhz.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	/**
	 * The song's library (docs/dawn-daw-plan.md, D6): every recording the
	 * song holds (takes, imports, the clip tools' results), each to hear on
	 * its own and to drag onto a track, where it lands as a clip at the
	 * drop (StudioTimeline's lanes take the drag's source id). The drag
	 * carries `application/x-stemshovel-source`; a plain text copy rides
	 * along for anything else.
	 */
	export interface LibraryItem {
		id: string;
		label: string;
		durationSeconds: number;
		channels: number;
		/** The file's own rate (a recording's is the device's); shown when it is not the song's. */
		sampleRate?: number;
		/** "cold": on the server, fetched when played or placed (D8). */
		status: "cold" | "decoding" | "ready" | "failed";
		pending: boolean;
		/** Clips using it. */
		uses: number;
	}
	interface Props {
		items: LibraryItem[];
		/** The song's rate (utils/songSampleRate.ts): an item at another is marked. */
		sampleRate?: number;
		/** The item playing on its own, if any. */
		playing: string | null;
		onpreview: (id: string | null) => void;
	}
	let { items, sampleRate, playing, onpreview }: Props = $props();
	let filter = $state("");
	const shown = $derived(
		items
			.filter((i) => !filter || i.label.toLowerCase().includes(filter.toLowerCase()))
			.sort((a, b) => a.label.localeCompare(b.label)),
	);
	function dragstart(e: DragEvent, item: LibraryItem) {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData("application/x-stemshovel-source", item.id);
		e.dataTransfer.setData("text/plain", item.label);
		e.dataTransfer.effectAllowed = "copy";
	}
</script>

<div class="grid gap-3" data-library-panel>
	<input
		class="field w-full text-13px"
		type="search"
		placeholder="Find a recording"
		aria-label="Find a recording"
		bind:value={filter}
	/>
	{#if shown.length === 0}
		<p class="text-13px text-dim">
			{items.length
				? "Nothing matches."
				: "No recordings yet: record, import or consolidate, and they gather here."}
		</p>
	{:else}
		<p class="text-11px opacity-70">
			Drag a recording onto a track to place it there; press play to hear it alone.
		</p>
		<ul class="grid gap-1" aria-label="Recordings in the library">
			{#each shown as item (item.id)}
				<li
					class="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-13px cursor-grab {item.status ===
						'ready' || item.status === 'cold'
						? ''
						: 'opacity-50'}"
					draggable="true"
					data-library-item={item.id}
					aria-label="{item.label}, {formatTime(item.durationSeconds)}"
					ondragstart={(e) => dragstart(e, item)}
				>
					<button
						type="button"
						class="device-fader-button-sm"
						aria-pressed={playing === item.id}
						aria-label={playing === item.id ? `Stop ${item.label}` : `Play ${item.label}`}
						disabled={item.status === "failed" || item.status === "decoding"}
						onclick={() => onpreview(playing === item.id ? null : item.id)}
					>
						<span
							class={playing === item.id ? "i-ph-stop-fill" : "i-ph-play-fill"}
							aria-hidden="true"
						></span>
					</button>
					<span class="min-w-0 grow truncate font-500">{item.label}</span>
					<span class="shrink-0 tabular-nums opacity-70"
						>{formatTime(item.durationSeconds)} · {item.channels === 1
							? "mono"
							: "stereo"}{item.sampleRate && sampleRate && item.sampleRate !== sampleRate
							? ` · ${formatKhz(item.sampleRate)} kHz`
							: ""}{item.uses
							? ` · ${item.uses} ${item.uses === 1 ? "clip" : "clips"}`
							: ""}{item.pending
							? " · saving…"
							: item.status === "failed"
								? " · not loaded"
								: item.status === "cold"
									? " · on the server"
									: ""}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
</div>
