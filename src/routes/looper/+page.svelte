<script lang="ts">
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import FloatingPanel from "$lib/components/FloatingPanel.svelte";
	import IconDrumKit from "$lib/components/IconDrumKit.svelte";
	import Metronome from "$lib/components/Metronome.svelte";
	import Piano from "$lib/components/Piano.svelte";
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import {
		LOOP_BARS,
		LOOP_SOURCES,
		LOOP_SOURCE_LABELS,
		MAX_LOOP_LAYERS,
		looper,
		type LoopBars,
		type LoopSource,
	} from "$lib/audio/looper.svelte";
	import { TakeQueue } from "$lib/audio/takeQueue.svelte";
	import { createIdea, saveIdeaInstruments } from "$lib/remote/ideas.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { Attachment } from "svelte/attachments";

	/**
	 * The looper (docs/looper.md): a loop of bars at a tempo plays round and
	 * round while layers are recorded onto it from the microphone, the piano
	 * or the drum machine; the layers' mix and the layers go to the Idea
	 * Recorder as a take with sources. The instruments live in panels as on
	 * the recorder page; the engine hosts them in one audio context.
	 */
	let { data } = $props();
	// The dev server only: the engine on the window, so a Playwright script can measure a layer's timing (docs/looper.md, "Verified").
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, { __looper: looper, __piano: piano, __drums: drumMachine });

	// The panels, as on the recorder page: floating from lg, docked below; the space bar follows the instrument touched last, else the looper's transport.
	let drumsOpen = $state(false);
	let pianoOpen = $state(false);
	let metroOpen = $state(false);
	let spaceOwner = $state<"drums" | "piano" | null>(null);
	function toggleDrums(e?: Event) {
		drumsOpen = !drumsOpen;
		if (drumsOpen) spaceOwner = "drums";
		else if (spaceOwner === "drums") spaceOwner = pianoOpen ? "piano" : null;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function togglePiano(e?: Event) {
		pianoOpen = !pianoOpen;
		if (pianoOpen) spaceOwner = "piano";
		else if (spaceOwner === "piano") spaceOwner = drumsOpen ? "drums" : null;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function toggleMetronome(e?: Event) {
		metroOpen = !metroOpen;
		(e?.currentTarget as HTMLElement | null)?.blur();
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.code !== "Space" || spaceOwner !== null || e.repeat) return;
		if (
			(e.target as HTMLElement | null)?.closest(
				"input, textarea, select, button, a, [contenteditable]",
			)
		)
			return;
		e.preventDefault();
		looper.toggle();
	}

	/** Arm a source; the microphone asks for permission on its first turn. */
	async function arm(source: LoopSource) {
		looper.setArmed(source);
		if (source === "mic" && !looper.hasMic) await looper.requestMic();
	}
	async function calibrate() {
		const ms = await looper.calibrate();
		notify(
			ms === null
				? "The clicks were not heard. Turn the speakers up (or take the headphones off) and try again."
				: `Microphone latency measured: ${ms} ms`,
			{ kind: ms === null ? "error" : "success" },
		);
	}
	function clearLoop() {
		if (looper.layers.length && !confirm("Clear every layer of this loop?")) return;
		looper.clear();
	}

	/** A layer's waveform on a canvas, redrawn with its size (an attachment, re-run when the peaks change). */
	function wave(peaks: Float32Array): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const draw = () => {
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				if (!w || !h) return;
				canvas.width = w * devicePixelRatio;
				canvas.height = h * devicePixelRatio;
				const g = canvas.getContext("2d");
				if (!g) return;
				g.scale(devicePixelRatio, devicePixelRatio);
				g.clearRect(0, 0, w, h);
				g.fillStyle = "rgba(191, 219, 254, 0.9)";
				const n = peaks.length;
				for (let i = 0; i < n; i++) {
					const p = Math.min(1, peaks[i] * 1.2);
					const x = (i / n) * w;
					g.fillRect(x, (h * (1 - p)) / 2, Math.max(1, w / n - 0.5), Math.max(1, h * p));
				}
			};
			draw();
			const ro = new ResizeObserver(draw);
			ro.observe(canvas);
			return () => ro.disconnect();
		};
	}

	/**
	 * Saving: the layers' mix rendered offline and each layer as 24-bit WAV,
	 * queued as a take with sources for a new idea in the current account
	 * (docs/demo-recording.md, "Multitrack takes"); the loop's settings go on
	 * the idea. The recorder's queue would pick up a take left mid-upload.
	 */
	let saving = $state(false);
	let repeats = $state(1);
	let loopTitle = $state("");
	const queue = new TakeQueue({
		ideaFor: async (item) => {
			if (item.ideaId) return item.ideaId;
			const created = await createIdea({ accountId: data.account.id, title: item.ideaTitle });
			return created.id;
		},
		onsaved: async (saved) => {
			notify(
				`Loop saved to the Idea Recorder as a take with ${saved.instruments?.looper?.layers.length ?? 0} sources`,
			);
			if (saved.instruments)
				await saveIdeaInstruments({ id: saved.ideaId, ...saved.instruments }).catch(() => {});
		},
	});
	let uploading = $derived(queue.items.filter((u) => u.status !== "failed"));
	async function saveLoop() {
		if (!looper.layers.length || saving) return;
		saving = true;
		try {
			const mix = await looper.renderMix(repeats);
			const title =
				loopTitle.trim() ||
				`Loop · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${looper.bpm} bpm`;
			queue.enqueue({
				localId: `local:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
				ideaId: null,
				ideaTitle: title,
				name: "",
				durationSeconds: mix.duration,
				mimeType: "audio/wav",
				ext: "wav",
				codec: "pcm",
				trimSilence: false,
				createdAt: Date.now(),
				blob: looper.wavOf(mix),
				instruments: { drums: null, piano: null, looper: looper.settings() },
				stems: looper.layers.map((l) => ({
					label: l.label,
					blob: looper.wavOf(l.buffer),
					mimeType: "audio/wav",
					ext: "wav",
					codec: "pcm",
				})),
			});
			notify("Saving the loop as a take…");
		} catch (e) {
			notify(`Could not save the loop: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			saving = false;
		}
	}
	const sourceIcon: Record<LoopSource, string> = {
		mic: "i-ph-microphone",
		piano: "i-ph-piano-keys",
		drums: "",
	};
</script>

<svelte:head>
	<title>Looper · Stem Shovel</title>
</svelte:head>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="@container" onpointerdowncapture={() => void looper.open()}>
	<main class="page">
		<div class="flex flex-wrap items-start justify-between gap-4 mb-4">
			<div>
				<h1 class="display mb-1">Looper</h1>
				<p class="opacity-90">
					Lay a loop down a layer at a time from the microphone, the piano or the drums, then save
					it to the Idea Recorder as a take with each layer as a stem.
				</p>
			</div>
			<div class="flex gap-2">
				<button
					class="button button-sm shrink-0 {metroOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: metronome.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={metroOpen}
					aria-label={metroOpen ? "Close the metronome" : "Open the metronome"}
					title={metroOpen ? "Close the metronome" : "Open the metronome"}
					onclick={toggleMetronome}
				>
					<span class="i-ph-metronome" aria-hidden="true"></span>
				</button>
				<button
					class="button button-sm shrink-0 {drumsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: drumMachine.running
							? 'text-accent'
							: ''}"
					type="button"
					aria-pressed={drumsOpen}
					aria-label={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
					title={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
					onclick={toggleDrums}
				>
					<span class="grid place-items-center" aria-hidden="true"><IconDrumKit /></span>
				</button>
				<button
					class="button button-sm shrink-0 {pianoOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={pianoOpen}
					aria-label={pianoOpen ? "Put the piano away" : "Piano"}
					title={pianoOpen ? "Put the piano away" : "Open the piano"}
					onclick={togglePiano}
				>
					<span class="i-ph-piano-keys" aria-hidden="true"></span>
				</button>
			</div>
		</div>

		<div class="grid grid-cols-1 @4xl-grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6 items-start">
			<!-- The transport and the layers -->
			<section
				class="rounded-lg border border-current/15 bg-oxford-800 p-4 grid gap-4"
				aria-label="Loop"
			>
				<!-- position -->
				<div class="grid gap-2">
					<div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-14px">
						<span class="text-18px">
							{#if looper.phase === "idle"}
								Stopped
							{:else if looper.position.bar === 0}
								Count-in · {looper.position.beat}
							{:else}
								Bar {looper.position.bar} · {looper.position.beat}
							{/if}
						</span>
						<span class="opacity-70"
							>{looper.bars}
							{looper.bars === 1 ? "bar" : "bars"} · {looper.beatsPerBar}/4 · {looper.bpm} bpm · {looper.loopSeconds.toFixed(
								1,
							)} s</span
						>
						{#if looper.phase === "recording"}
							<span class="text-red-400" role="status"
								>● Recording {LOOP_SOURCE_LABELS[looper.armed]} · pass {looper.passes + 1}</span
							>
						{/if}
					</div>
					<div class="h-2 rounded bg-blue-300/10 overflow-hidden" aria-hidden="true">
						<div class="h-full bg-accent" style:width="{looper.position.fraction * 100}%"></div>
					</div>
				</div>

				<!-- transport -->
				<div class="flex flex-wrap items-center gap-2">
					<button
						class="button min-w-100px"
						type="button"
						aria-pressed={looper.phase !== "idle"}
						onclick={() => looper.toggle()}
					>
						<span
							class={looper.phase === "idle" ? "i-ph-play-fill" : "i-ph-stop-fill"}
							aria-hidden="true"
						></span>
						{looper.phase === "idle" ? "Play" : "Stop"}
					</button>
					{#if looper.phase === "recording"}
						<button
							class="button-accent"
							type="button"
							title="Finish at the end of this pass"
							onclick={() => looper.finishRecording()}
						>
							<span class="i-ph-check" aria-hidden="true"></span> Finish layer
						</button>
						<button
							class="button"
							type="button"
							title="Drop the pass under way"
							onclick={() => looper.cancelRecording()}>Cancel</button
						>
					{:else}
						<button
							class="button-accent"
							type="button"
							disabled={looper.layers.length >= MAX_LOOP_LAYERS}
							title="Record a layer from the chosen source, from the next bar 1 (after the count-in when stopped); every full pass becomes a layer until Finish"
							onclick={() => void looper.record()}
						>
							<span class="i-ph-record-fill text-red-400" aria-hidden="true"></span> Record
						</button>
					{/if}
					<button
						class="button button-sm"
						type="button"
						disabled={looper.layers.length === 0}
						title="Remove the last layer"
						onclick={() => looper.undo()}>Undo</button
					>
					<button
						class="button button-sm"
						type="button"
						disabled={looper.layers.length === 0}
						onclick={clearLoop}>Clear</button
					>
					<label class="ml-auto flex items-center gap-2 text-13px">
						<span class="i-ph-speaker-high" aria-hidden="true"></span>
						<input
							class="w-24 accent-maximumYellow"
							type="range"
							min="0"
							max="100"
							value={Math.round(looper.volume * 100)}
							aria-label="Loop volume"
							oninput={(e) => looper.setVolume(Number(e.currentTarget.value) / 100)}
						/>
					</label>
				</div>

				<!-- the source to record -->
				<fieldset class="grid gap-2">
					<legend class="text-12px uppercase tracking-wider opacity-60 mb-1">Record from</legend>
					<div class="grid grid-cols-1 @xl-grid-cols-3 gap-2">
						{#each LOOP_SOURCES as source (source)}
							<button
								class="rounded border p-2 text-left grid gap-1 {looper.armed === source
									? 'border-accent bg-accent/10'
									: 'border-current/15 hover-border-current/40'}"
								type="button"
								aria-pressed={looper.armed === source}
								disabled={looper.phase === "recording"}
								onclick={() => void arm(source)}
							>
								<span class="flex items-center gap-2 text-14px">
									{#if source === "drums"}
										<span class="grid place-items-center w-1em" aria-hidden="true"
											><IconDrumKit /></span
										>
									{:else}
										<span class={sourceIcon[source]} aria-hidden="true"></span>
									{/if}
									{LOOP_SOURCE_LABELS[source]}
									{#if source === "mic" && looper.micLabel}
										<span class="text-11px opacity-60 truncate">{looper.micLabel}</span>
									{/if}
								</span>
								<span
									class="block h-1.5 rounded bg-blue-300/10 overflow-hidden"
									role="meter"
									aria-label="{LOOP_SOURCE_LABELS[source]} level"
									aria-valuemin="0"
									aria-valuemax="100"
									aria-valuenow={Math.round(looper.levels[source] * 100)}
								>
									<span
										class="block h-full rounded {looper.levels[source] > 0.85
											? 'bg-red-500'
											: 'bg-blue-300'}"
										style:width="{looper.levels[source] * 100}%"
									></span>
								</span>
							</button>
						{/each}
					</div>
					{#if looper.micError}
						<p class="text-13px text-red-400">{looper.micError}</p>
					{/if}
				</fieldset>

				<!-- layers -->
				<div class="grid gap-2">
					<div class="text-12px uppercase tracking-wider opacity-60">
						Layers · {looper.layers.length} of {MAX_LOOP_LAYERS}
					</div>
					{#if looper.layers.length === 0}
						<p
							class="rounded border border-dashed border-white/15 px-4 py-4 text-center text-sm opacity-90"
						>
							No layers yet. Choose a source, press Record, and play a pass of the loop.
						</p>
					{:else}
						<ul class="grid gap-1" aria-label="Layers">
							{#each looper.layers as layer (layer.id)}
								<li
									class="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded bg-blue-100/5 px-2 py-1.5 {layer.muted
										? 'opacity-50'
										: ''}"
								>
									<span class="grid gap-0.5 w-28">
										<span class="text-14px truncate" title={layer.label}>{layer.label}</span>
										<span class="flex gap-1">
											<button
												class="button button-xs {layer.muted ? 'bg-accent text-oxford' : ''}"
												type="button"
												aria-pressed={layer.muted}
												aria-label="Mute {layer.label}"
												onclick={() => looper.toggleMute(layer.id)}>M</button
											>
											<button
												class="button button-xs {layer.solo ? 'bg-accent text-oxford' : ''}"
												type="button"
												aria-pressed={layer.solo}
												aria-label="Solo {layer.label}"
												onclick={() => looper.toggleSolo(layer.id)}>S</button
											>
											<input
												class="w-16 accent-maximumYellow"
												type="range"
												min="0"
												max="100"
												value={Math.round(layer.gain * 100)}
												aria-label="{layer.label} level"
												oninput={(e) =>
													looper.setGain(layer.id, Number(e.currentTarget.value) / 100)}
											/>
										</span>
									</span>
									<span class="relative block h-10 rounded bg-oxford overflow-hidden">
										<canvas class="block w-full h-full" {@attach wave(layer.peaks)}></canvas>
										{#if looper.phase !== "idle" && looper.position.bar > 0}
											<span
												class="absolute top-0 bottom-0 w-px bg-accent"
												style:left="{looper.position.fraction * 100}%"
												aria-hidden="true"
											></span>
										{/if}
									</span>
									<button
										class="button button-xs"
										type="button"
										aria-label="Delete {layer.label}"
										title="Delete this layer"
										onclick={() => looper.remove(layer.id)}
									>
										<span class="i-ph-trash" aria-hidden="true"></span>
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>

				<!-- saving -->
				<div class="flex flex-wrap items-end gap-3 border-t border-current/10 pt-4">
					<label class="grid gap-1 text-13px grow min-w-200px">
						Idea title
						<input
							class="input"
							type="text"
							placeholder="Loop · today · {looper.bpm} bpm"
							bind:value={loopTitle}
						/>
					</label>
					<label class="grid gap-1 text-13px">
						Passes in the take
						<select class="input" bind:value={repeats}>
							<option value={1}>1</option>
							<option value={2}>2</option>
							<option value={4}>4</option>
						</select>
					</label>
					<button
						class="button-accent"
						type="button"
						disabled={looper.layers.length === 0 || saving}
						title="The layers' mix as a take in the Idea Recorder, each layer as one of its sources, ready to go to a song as stems"
						onclick={saveLoop}
					>
						<span class="i-ph-floppy-disk" aria-hidden="true"></span>
						{saving ? "Rendering…" : "Save as take"}
					</button>
					{#if uploading.length > 0}
						<span class="text-13px opacity-80" role="status">
							{uploading[0].status === "uploading"
								? `Saving… ${Math.round(uploading[0].progress)}%`
								: "Waiting…"}
						</span>
					{/if}
					{#if queue.items.some((u) => u.status === "failed")}
						<span class="text-13px text-red-400" role="status"
							>A save failed: {queue.items.find((u) => u.status === "failed")?.error}</span
						>
						<button
							class="button button-xs"
							type="button"
							onclick={() =>
								queue.items
									.filter((u) => u.status === "failed")
									.forEach((u) => queue.retry(u.localId))}>Retry</button
						>
					{/if}
				</div>
			</section>

			<!-- The loop's settings -->
			<section
				class="rounded-lg border border-current/15 bg-oxford-800 p-4 grid gap-4"
				aria-label="Loop settings"
			>
				<div class="grid gap-3">
					<div class="text-12px uppercase tracking-wider opacity-60">Loop</div>
					{#if looper.locked}
						<p class="text-12px opacity-70">
							Tempo and length are set while the loop has layers. Clear it to change them.
						</p>
					{/if}
					<div class="grid gap-1 text-13px">
						<div class="flex items-center justify-between gap-2">
							<span>Tempo · {looper.bpm} bpm</span>
							<button
								class="button button-xs"
								type="button"
								disabled={looper.locked}
								title="Tap the tempo (Kevin: a tap tempo right in the looper)"
								aria-label="Tap the tempo"
								onclick={() => looper.tap()}
							>
								Tap
							</button>
						</div>
						<input
							class="w-full accent-maximumYellow"
							type="range"
							min="40"
							max="240"
							step="1"
							value={looper.bpm}
							disabled={looper.locked}
							aria-label="Tempo in beats per minute"
							oninput={(e) => looper.setBpm(Number(e.currentTarget.value))}
						/>
					</div>
					<div class="grid grid-cols-2 gap-3">
						<label class="grid gap-1 text-13px">
							Bars
							<select
								class="input"
								value={looper.bars}
								disabled={looper.locked}
								onchange={(e) => looper.setBars(Number(e.currentTarget.value) as LoopBars)}
							>
								{#each LOOP_BARS as n (n)}<option value={n}>{n}</option>{/each}
							</select>
						</label>
						<label class="grid gap-1 text-13px">
							Beats per bar
							<select
								class="input"
								value={looper.beatsPerBar}
								disabled={looper.locked}
								onchange={(e) => looper.setBeatsPerBar(Number(e.currentTarget.value) as 3 | 4)}
							>
								<option value={4}>4</option>
								<option value={3}>3</option>
							</select>
						</label>
					</div>
					<label class="flex items-center gap-2 text-13px">
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={looper.countIn}
							onchange={(e) => (looper.countIn = e.currentTarget.checked)}
						/>
						Count in a bar before the first pass
					</label>
					<label class="grid gap-1 text-13px">
						Click
						<select class="input" bind:value={looper.click}>
							<option value="count-in">On the count-in only</option>
							<option value="always">Through the loop</option>
							<option value="off">Off</option>
						</select>
					</label>
				</div>
				<div class="grid gap-3 border-t border-current/10 pt-4">
					<div class="text-12px uppercase tracking-wider opacity-60">Microphone</div>
					<label class="flex items-center gap-2 text-13px">
						<input
							type="checkbox"
							class="accent-maximumYellow"
							checked={looper.monitorMic}
							onchange={(e) => looper.setMonitorMic(e.currentTarget.checked)}
						/>
						Hear the microphone through the speakers
					</label>
					<label class="grid gap-1 text-13px">
						Latency · {looper.latencyMs} ms {looper.latencyMeasured ? "" : "(the browser's guess)"}
						<input
							class="w-full accent-maximumYellow"
							type="range"
							min="0"
							max="300"
							step="1"
							value={looper.latencyMs}
							aria-label="Microphone latency in milliseconds"
							oninput={(e) => looper.setLatencyMs(Number(e.currentTarget.value))}
						/>
					</label>
					<p class="text-12px opacity-70">
						A sung or played layer arrives late by the microphone's round trip; it is shifted
						earlier by this much. Calibrate plays three clicks through the speakers and measures
						them.
					</p>
					<button
						class="button button-sm justify-self-start"
						type="button"
						disabled={looper.calibrating || looper.phase !== "idle"}
						onclick={calibrate}
					>
						{looper.calibrating ? "Listening…" : "Calibrate"}
					</button>
				</div>
				<a class="button button-sm justify-self-start" href="/docs/looper"
					>Learn more about the looper in the user docs</a
				>
			</section>
		</div>
	</main>

	<!-- The instruments' panels, as on the recorder page: floating from lg, docked below. -->
	<FloatingPanel
		open={drumsOpen}
		title="Drum machine"
		storageKey="stemshovel.looper.drum-panel"
		onminimise={() => toggleDrums()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onpointerdowncapture={() => (spaceOwner = "drums")}>
			<DrumMachine
				keyboard={spaceOwner === "drums"}
				account={{ id: data.account.id, name: data.account.name, canEdit: true }}
				beats={data.beats}
				textToBeat={data.textToBeat}
			/>
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={pianoOpen}
		title="Piano"
		storageKey="stemshovel.looper.piano-panel"
		width={980}
		onminimise={() => togglePiano()}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div onpointerdowncapture={() => (spaceOwner = "piano")}>
			<Piano
				warm
				samplesBase={data.pianoSamplesBase}
				keyboard={spaceOwner === "piano"}
				sitePresets={data.sitePresets}
				account={{ id: data.account.id, name: data.account.name, canEdit: true }}
				presets={data.pianoPresets}
				presetAdmin={data.presetAdmin}
			/>
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={metroOpen}
		title="Metronome"
		storageKey="stemshovel.looper.metronome-panel"
		width={640}
		height={520}
		onminimise={() => toggleMetronome()}
	>
		<Metronome />
	</FloatingPanel>
</div>
