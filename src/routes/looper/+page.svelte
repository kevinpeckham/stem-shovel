<script lang="ts">
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import FloatingPanel from "$lib/components/FloatingPanel.svelte";
	import IconDrumKit from "$lib/components/IconDrumKit.svelte";
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
	import Metronome from "$lib/components/Metronome.svelte";
	import Piano from "$lib/components/Piano.svelte";
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import { metronome } from "$lib/audio/metronome.svelte";
	import { piano } from "$lib/audio/piano.svelte";
	import {
		LOOP_BARS,
		LOOP_SOURCES,
		LEAD_SECONDS,
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

	// Tempo synced both ways (Kevin): the drum machine's tempo (its slider, tap, a preset or a generated beat) becomes the
	// loop's while the loop has no layers; with layers the loop's tempo is fixed and the drum machine is held to it.
	// An effect because the drum machine is engine state outside this component.
	$effect(() => {
		const theirs = drumMachine.project.bpm;
		if (theirs === looper.bpm) return;
		if (looper.locked) looper.syncTempo();
		else looper.setBpm(theirs);
	});

	/** Arm a source; the microphone asks for permission on its first turn, and an instrument's panel opens if it is not out (Kevin). */
	async function arm(source: LoopSource) {
		looper.setArmed(source);
		if (source === "mic" && !looper.hasMic) await looper.requestMic();
		if (source === "piano" && !pianoOpen) togglePiano();
		if (source === "drums" && !drumsOpen) toggleDrums();
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
	/** The layers go with the take as its sources (a multitrack take) by default; stereo saves the mix alone (Kevin). */
	let saveStems = $state(true);
	let loopTitle = $state("");
	const queue = new TakeQueue({
		ideaFor: async (item) => {
			if (item.ideaId) return item.ideaId;
			if (!data.account) throw new Error("Sign in to save loops");
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
		if (!looper.layers.length || saving || !data.account) return;
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
				...(saveStems
					? {
							stems: looper.layers.map((l) => ({
								label: l.label,
								blob: looper.wavOf(l.buffer),
								mimeType: "audio/wav",
								ext: "wav",
								codec: "pcm",
							})),
						}
					: {}),
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
	<title>{data.copy.title || "Looper"} | Free Online Loop Station</title>
	<meta
		name="description"
		content="A free looper in the browser: lay a loop down a layer at a time from the microphone, the piano or the drum machine, with a count-in, a click and latency compensation, then save it as a take with each layer as a stem."
	/>
</svelte:head>

<svelte:window {onkeydown} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="@container" onpointerdowncapture={() => void looper.open()}>
	<main class="page-x-padding main-y-padding max-w-full w-full">
		<PageCopyHeader copy={data.copy}>
			{#snippet controls()}
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
			{/snippet}
		</PageCopyHeader>

		<!-- The device (docs/looper.md): the chassis, screen and button groups of the other instruments; the settings live in menus on the device. -->
		<section
			class="device-chrome @container grid gap-4 px-3 py-4 pb-8 @xl-px-5 @xl-pt-5 w-full max-w-full relative"
			aria-label="Looper"
		>
			<!-- the screen -->
			<div class="device-screen flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 py-3">
				<div class="min-w-0 grow">
					<div class="text-24px @xl-text-32px leading-none tabular-nums" aria-live="polite">
						{#if looper.phase === "idle"}
							Stopped
						{:else if looper.position.bar === 0}
							Count-in · {looper.position.beat}
						{:else}
							Bar {looper.position.bar} · {looper.position.beat}
						{/if}
					</div>
					<div class="mt-2 text-12px opacity-70 flex flex-wrap gap-x-2 tabular-nums">
						<span
							>{looper.bars}
							{looper.bars === 1 ? "bar" : "bars"} · {looper.beatsPerBar}/4 · {looper.bpm} bpm · {looper.loopSeconds.toFixed(
								1,
							)} s</span
						>
						<span>· {looper.layers.length} {looper.layers.length === 1 ? "layer" : "layers"}</span>
						{#if looper.phase === "recording"}
							<span class="text-red-300" role="status"
								>· ● recording {LOOP_SOURCE_LABELS[looper.armed]} · pass {looper.passes + 1} · layer lands
								in {Math.ceil(looper.secondsToPassEnd + LEAD_SECONDS)} s</span
							>
						{/if}
						{#if looper.micError}
							<span class="text-red-300">· {looper.micError}</span>
						{/if}
						{#if looper.restored > 0 && looper.phase === "idle" && looper.layers.length === looper.restored}
							<span>· back from last time</span>
						{/if}
					</div>
					<div class="mt-3 h-1.5 rounded bg-blue-100/10 overflow-hidden" aria-hidden="true">
						<div class="h-full bg-accent" style:width="{looper.position.fraction * 100}%"></div>
					</div>
				</div>
				<div
					class="text-12px opacity-70 rounded border border-current/40 px-2 py-1 min-w-24 text-center"
				>
					{LOOP_SOURCE_LABELS[looper.armed]}
				</div>
			</div>

			<!-- the controls: transport, the source, the menus, the volume -->
			<div class="flex flex-wrap items-end gap-x-5 gap-y-4">
				<div>
					<div class="device-button-group-label text-dark">Transport</div>
					<div class="flex flex-wrap gap-2">
						<button
							class="device-button-lg {looper.phase === 'idle'
								? 'device-button-play'
								: 'device-button-stop'}"
							type="button"
							aria-pressed={looper.phase !== "idle"}
							onclick={() => looper.toggle()}
						>
							{looper.phase === "idle" ? "Play" : "Stop"}
						</button>
						{#if looper.phase === "recording"}
							<button
								class="device-button-lg text-accent"
								type="button"
								title="Finish at the end of this pass"
								onclick={() => looper.finishRecording()}
							>
								<span class="i-ph-check" aria-hidden="true"></span> Finish layer
							</button>
							<button
								class="device-button-sm px-3"
								type="button"
								title="Drop the pass under way"
								onclick={() => looper.cancelRecording()}>Cancel</button
							>
						{:else}
							<button
								class="device-button-lg device-button-record"
								type="button"
								disabled={looper.layers.length >= MAX_LOOP_LAYERS}
								title="Record a layer from the chosen source, from the next bar 1 (after the count-in when stopped); every full pass becomes a layer until Finish"
								onclick={() => void looper.record()}
							>
								Record
							</button>
						{/if}
						<button
							class="device-button-sm px-3"
							type="button"
							disabled={looper.layers.length === 0}
							title="Remove the last layer"
							onclick={() => looper.undo()}>Undo</button
						>
						<button
							class="device-button-sm px-3"
							type="button"
							disabled={looper.layers.length === 0}
							title="Remove every layer"
							onclick={clearLoop}>Clear</button
						>
					</div>
				</div>

				<div>
					<div class="device-button-group-label text-dark">Record from</div>
					<div class="flex flex-wrap gap-2" role="group" aria-label="Source">
						{#each LOOP_SOURCES as source (source)}
							<button
								class="device-button-sm px-3 grid gap-1 content-center min-w-120px {looper.armed ===
								source
									? 'text-accent'
									: ''}"
								type="button"
								aria-pressed={looper.armed === source}
								disabled={looper.phase === "recording"}
								title={source === "mic" && looper.micLabel
									? looper.micLabel
									: LOOP_SOURCE_LABELS[source]}
								onclick={() => void arm(source)}
							>
								<span class="flex items-center justify-center gap-2 leading-none">
									{#if source === "drums"}
										<span class="grid place-items-center w-1em" aria-hidden="true"
											><IconDrumKit /></span
										>
									{:else}
										<span class={sourceIcon[source]} aria-hidden="true"></span>
									{/if}
									{LOOP_SOURCE_LABELS[source]}
								</span>
								<span
									class="block h-1 w-full rounded bg-blue-100/10 overflow-hidden"
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
				</div>

				<div>
					<div class="device-button-group-label text-dark">Settings</div>
					<div class="flex flex-wrap gap-2">
						<ContextMenu
							ariaLabel="Timing settings"
							title="Tempo, bars, count-in and click"
							iconClass="i-ph-metronome"
							label="Timing"
							position="bottom left"
							buttonBaseClasses="device-button-sm px-3"
							buttonClasses={looper.locked ? "text-accent" : ""}
							popoverClasses="min-w-72 @xl-min-w-96 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
							items={[
								{ id: "loop-heading", kind: "heading", label: "Timing" },
								{ id: "loop-block", kind: "snippet", snippet: loopMenuBlock },
							]}
						/>
						<ContextMenu
							ariaLabel="Microphone and output settings"
							title="Monitoring and latency"
							iconClass="i-ph-microphone"
							label="Mic"
							position="bottom left"
							buttonBaseClasses="device-button-sm px-3"
							buttonClasses={looper.monitorMic ? "text-accent" : ""}
							popoverClasses="min-w-72 @xl-min-w-96 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
							items={[
								{ id: "mic-heading", kind: "heading", label: "Microphone and output" },
								{ id: "mic-block", kind: "snippet", snippet: micMenuBlock },
							]}
						/>
						<ContextMenu
							ariaLabel="Save the loop"
							title="Save the loop to the Idea Recorder as a take with its layers as sources"
							iconClass="i-ph-floppy-disk"
							label="Save"
							position="bottom left"
							buttonBaseClasses="device-button-sm px-3"
							buttonClasses={uploading.length > 0 ? "text-accent" : ""}
							popoverClasses="min-w-72 @xl-min-w-96 !max-h-[calc(100%-0.5rem)] overflow-y-auto"
							items={[
								{ id: "save-heading", kind: "heading", label: "Save as take" },
								{ id: "save-block", kind: "snippet", snippet: saveMenuBlock },
							]}
						/>
					</div>
				</div>

				<div class="@xl-ml-auto min-w-120px grow @xl-grow-0 @xl-w-40">
					<div class="device-button-group-label text-dark">Volume</div>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						value={Math.round(looper.volume * 100)}
						aria-label="Loop volume"
						oninput={(e) => looper.setVolume(Number(e.currentTarget.value) / 100)}
					/>
				</div>
			</div>

			<!-- the layers -->
			<div>
				<div class="device-button-group-label text-dark">
					Layers · {looper.layers.length} of {MAX_LOOP_LAYERS}
				</div>
				{#if looper.layers.length === 0}
					<p class="device-screen text-center text-13px opacity-90 !text-wrap">
						No layers yet. Choose a source, press Record, and play a pass of the loop.
					</p>
				{:else}
					<ul class="grid gap-1.5" aria-label="Layers">
						{#each looper.layers as layer (layer.id)}
							<li
								class="device-screen !px-2 !py-2 grid grid-cols-[auto_1fr_auto] items-center gap-3 {layer.muted
									? 'opacity-60'
									: ''}"
							>
								<span class="grid gap-1 w-32 @xl-w-40">
									<span class="text-13px truncate" title={layer.label}>{layer.label}</span>
									<span class="flex items-center gap-1">
										<button
											class="device-button-xs px-2 {layer.muted ? 'text-accent' : ''}"
											type="button"
											aria-pressed={layer.muted}
											aria-label="Mute {layer.label}"
											onclick={() => looper.toggleMute(layer.id)}>M</button
										>
										<button
											class="device-button-xs px-2 {layer.solo ? 'text-accent' : ''}"
											type="button"
											aria-pressed={layer.solo}
											aria-label="Solo {layer.label}"
											onclick={() => looper.toggleSolo(layer.id)}>S</button
										>
										<input
											class="w-14 @xl-w-20 accent-maximumYellow"
											type="range"
											min="0"
											max="100"
											value={Math.round(layer.gain * 100)}
											aria-label="{layer.label} level"
											oninput={(e) => looper.setGain(layer.id, Number(e.currentTarget.value) / 100)}
										/>
									</span>
								</span>
								<span class="relative block h-10 rounded bg-oxford-950/60 overflow-hidden">
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
									class="device-button-xs px-2"
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

			<!-- branding, as the other devices wear it -->
			<div
				class="absolute bottom-3 right-5 text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
			>
				SS Loop 001
			</div>
		</section>

		<PageCopySection
			html={data.copy.bodyHtml}
			docsHref="/docs/looper"
			docsLabel="Looper docs"
			docsLead="Learn more about using the looper in the user docs."
		/>
	</main>

	<!-- The settings, as blocks in the device's menus (the piano's effects menu idiom). -->
	{#snippet loopMenuBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			{#if looper.locked}
				<p class="text-12px opacity-70">
					Tempo and length are fixed while the loop has layers. Clear it to change them.
				</p>
			{/if}
			<div class="flex items-end gap-3">
				<label class="block grow">
					<span class="device-button-label">Tempo · {looper.bpm} bpm</span>
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
				</label>
				<button
					class="device-button-xs px-3 mb-1"
					type="button"
					disabled={looper.locked}
					aria-label="Tap the tempo"
					title="Tap the tempo"
					onclick={() => looper.tap()}>Tap</button
				>
			</div>
			<div class="grid grid-cols-2 gap-3">
				<label class="block">
					<span class="device-button-label">Bars</span>
					<select
						class="device-field w-full"
						value={looper.bars}
						disabled={looper.locked}
						aria-label="Bars"
						onchange={(e) => looper.setBars(Number(e.currentTarget.value) as LoopBars)}
					>
						{#each LOOP_BARS as n (n)}<option value={n}>{n}</option>{/each}
					</select>
				</label>
				<label class="block">
					<span class="device-button-label">Beats per bar</span>
					<select
						class="device-field w-full"
						value={looper.beatsPerBar}
						disabled={looper.locked}
						aria-label="Beats per bar"
						onchange={(e) => looper.setBeatsPerBar(Number(e.currentTarget.value) as 3 | 4)}
					>
						<option value={4}>4</option>
						<option value={3}>3</option>
					</select>
				</label>
			</div>
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={looper.countIn}
					onchange={(e) => (looper.countIn = e.currentTarget.checked)}
				/>
				Count in a bar before the first pass
			</label>
			<label class="block">
				<span class="device-button-label">Click</span>
				<select class="device-field w-full" aria-label="Click" bind:value={looper.click}>
					<option value="count-in">On the count-in only</option>
					<option value="always">Through the loop</option>
					<option value="off">Off</option>
				</select>
			</label>
		</div>
	{/snippet}

	{#snippet micMenuBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			{#if looper.micLabel}
				<p class="text-12px opacity-70">Input: {looper.micLabel}</p>
			{/if}
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={looper.monitorMic}
					onchange={(e) => looper.setMonitorMic(e.currentTarget.checked)}
				/>
				Hear the microphone through the speakers
			</label>
			<label class="block">
				<span class="device-button-label"
					>Microphone latency · {looper.latencyMs} ms{looper.latencyMeasured
						? ""
						: " (the browser's guess)"}</span
				>
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
				A sung or played layer arrives late by the microphone's round trip; it is shifted earlier by
				this much. Calibrate plays three clicks through the speakers and measures them.
			</p>
			<button
				class="device-button-xs px-3 justify-self-start"
				type="button"
				disabled={looper.calibrating || looper.phase !== "idle"}
				onclick={calibrate}
			>
				{looper.calibrating ? "Listening…" : "Calibrate"}
			</button>
			<div class="border-t border-current/10 pt-3 grid gap-3">
				<p class="text-12px opacity-70">
					Your audio output reports {looper.ready ? `${looper.outputLatencyMs} ms` : "its"} latency (Bluetooth
					adds a lot). A piano layer played by hand is timed against the loop as you hear it, so it is
					shifted earlier by this much.
				</p>
				<label class="flex items-center gap-2 text-13px text-blue-100/90">
					<input
						type="checkbox"
						class="accent-maximumYellow"
						checked={looper.compensatePiano}
						onchange={(e) => (looper.compensatePiano = e.currentTarget.checked)}
					/>
					Shift piano layers by the output latency
				</label>
			</div>
		</div>
	{/snippet}

	{#snippet saveMenuBlock()}
		<div
			class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)"
		>
			{#if !data.account}
				<p class="text-13px text-blue-100/90">
					Your loop stays in this browser as you work. To keep it for good, save it to the Idea
					Recorder as a take with each layer as a stem: that needs an account.
				</p>
				<div class="flex flex-wrap gap-2">
					<a class="device-button-sm px-3 text-accent" href="/sign-in?next=%2Flooper">Sign in</a>
					{#if !data.signedIn}<a class="device-button-sm px-3" href="/sign-up">Create an account</a
						>{/if}
				</div>
			{:else}
				<label class="block">
					<span class="device-button-label">Idea title</span>
					<input
						class="device-field w-full"
						type="text"
						placeholder="Loop · today · {looper.bpm} bpm"
						bind:value={loopTitle}
					/>
				</label>
				<label class="block">
					<span class="device-button-label">Passes in the take</span>
					<select class="device-field w-full" bind:value={repeats}>
						<option value={1}>1</option>
						<option value={2}>2</option>
						<option value={4}>4</option>
					</select>
				</label>
				<div class="grid gap-1">
					<span class="device-button-label">Take</span>
					<div class="flex gap-2" role="group" aria-label="Take format">
						<button
							class="device-button-xs px-3 {saveStems ? 'text-accent' : ''}"
							type="button"
							aria-pressed={saveStems}
							title="The mix plus each layer as its own source, so the take can go to a song as stems"
							onclick={() => (saveStems = true)}>Multitrack</button
						>
						<button
							class="device-button-xs px-3 {saveStems ? '' : 'text-accent'}"
							type="button"
							aria-pressed={!saveStems}
							title="The mix alone"
							onclick={() => (saveStems = false)}>Stereo</button
						>
					</div>
				</div>
				<p class="text-12px opacity-70">
					{saveStems
						? "The layers' mix becomes a take in the Idea Recorder, each layer one of its sources, ready to go to a song as stems."
						: "The layers' mix becomes a take in the Idea Recorder, as one stereo file."}
				</p>
				<button
					class="device-button-sm px-3 justify-self-start {looper.layers.length
						? 'text-accent'
						: ''}"
					type="button"
					disabled={looper.layers.length === 0 || saving}
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
						class="device-button-xs px-3 justify-self-start"
						type="button"
						onclick={() =>
							queue.items
								.filter((u) => u.status === "failed")
								.forEach((u) => queue.retry(u.localId))}>Retry</button
					>
				{/if}
			{/if}
		</div>
	{/snippet}

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
				account={data.account}
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
				account={data.account}
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
