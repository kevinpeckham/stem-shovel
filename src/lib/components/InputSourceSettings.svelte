<script lang="ts">
	import type { Snippet } from "svelte";
	import { notify } from "$lib/state/notifications.svelte";
	import {
		inputSources,
		OUTSIDE_SOURCE_LABELS,
		type ChannelMode,
		type OutsideSource,
	} from "$lib/audio/inputs.svelte";

	/**
	 * The settings of one outside source (src/lib/audio/inputs.svelte.ts),
	 * for the menu joined to its button on the looper and the Idea Recorder:
	 * device and channels for the microphone and the line in, the share
	 * picker, channels and capture latency for the computer, then the monitor
	 * (inputs only) and normalize switches. `children` adds a page's own
	 * block under them (the looper's input latency and Calibrate).
	 */
	interface Props {
		source: OutsideSource;
		/** The page is busy (a loop running, a take recording): Calibrate waits. */
		calibrateDisabled?: boolean;
		/** The monitor switch (hear the input through the speakers), on by default for the two inputs; a page with no speaker path hides it. */
		monitorSwitch?: boolean;
		children?: Snippet;
	}
	let { source, monitorSwitch = true, calibrateDisabled = false, children }: Props = $props();
	/** Three clicks and a measurement (inputs.svelte.ts); the result, or what to try, as a notification. */
	async function calibrate() {
		const ms = await inputSources.calibrate();
		notify(
			ms === null
				? "The clicks were not heard. Turn the speakers up (or take the headphones off) and try again."
				: `Microphone latency measured: ${Math.round(ms)} ms`,
			{ kind: ms === null ? "error" : "success" },
		);
	}
	const label = $derived(OUTSIDE_SOURCE_LABELS[source]);
</script>

<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
	{#if source === "computer"}
		<div class="grid gap-2">
			<p class="text-12px opacity-70">
				Audio from another program, through the browser's share picker: pick a tab, a window or the
				screen and tick "Share audio". Chrome and Edge share a tab's audio anywhere and the whole
				computer's on Windows; on a Mac only a browser tab's audio can be shared, so route another
				program through a loopback device and choose it as the line in. Safari cannot share audio.
				{#if inputSources.labels.computer}<span>Sharing: {inputSources.labels.computer}.</span>{/if}
				{#if inputSources.errors.computer}<span class="text-red-300"
						>{inputSources.errors.computer}</span
					>{/if}
			</p>
			<div class="grid grid-cols-[auto_1fr] gap-2 items-end">
				<button
					class="device-button-xs px-3"
					type="button"
					onclick={() => void inputSources.requestComputer()}
					>{inputSources.labels.computer ? "Share something else" : "Choose what to share"}</button
				>
				<label class="block">
					<span class="device-button-label">Channels</span>
					<select
						class="device-field w-full"
						aria-label="Computer channels"
						value={inputSources.channelModes.computer}
						onchange={(e) =>
							inputSources.setChannelMode("computer", e.currentTarget.value as ChannelMode)}
					>
						<option value="stereo">Stereo</option>
						<option value="left">Left only</option>
						<option value="right">Right only</option>
					</select>
				</label>
			</div>
			<label class="block">
				<span class="device-button-label"
					>Computer audio latency · {inputSources.computerLatencyMs} ms</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="300"
					step="1"
					value={inputSources.computerLatencyMs}
					aria-label="Computer audio latency in milliseconds"
					oninput={(e) => inputSources.setComputerLatencyMs(Number(e.currentTarget.value))}
				/>
			</label>
			<p class="text-12px opacity-70">
				Audio shared this way arrives late by the capture's own path, which nothing here can
				measure: the looper shifts its layers earlier by this much.
			</p>
		</div>
	{:else}
		<div class="grid gap-2">
			<div class="grid grid-cols-[1fr_auto] gap-2 items-end">
				<label class="block">
					<span class="device-button-label">Device</span>
					<select
						class="device-field w-full"
						aria-label="{label} device"
						value={inputSources.deviceIds[source] ?? ""}
						onfocus={() => void inputSources.listInputs()}
						onchange={(e) => void inputSources.requestInput(source, e.currentTarget.value || null)}
					>
						<option value="">Default input</option>
						{#each inputSources.inputs as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
					</select>
				</label>
				<label class="block">
					<span class="device-button-label">Channels</span>
					<select
						class="device-field"
						aria-label="{label} channels"
						value={inputSources.channelModes[source]}
						onchange={(e) =>
							inputSources.setChannelMode(source, e.currentTarget.value as ChannelMode)}
					>
						<option value="stereo">Stereo</option>
						<option value="left">Left only</option>
						<option value="right">Right only</option>
					</select>
				</label>
			</div>
			<p class="text-12px opacity-70">
				{#if inputSources.labels[source]}Open: {inputSources.labels[
						source
					]}.{:else if source === "line"}A second input, for an instrument on an audio interface; an
					input on one channel of a stereo interface wants Left only or Right only.{:else}Not open
					yet; it asks for permission on its first turn.{/if}
				{#if inputSources.errors[source]}<span class="text-red-300"
						>{inputSources.errors[source]}</span
					>{/if}
			</p>
		</div>
	{/if}
	{#if source !== "computer"}
		<div class="border-t border-current/10 pt-3 grid gap-3">
			<label class="block">
				<span class="device-button-label"
					>Input latency · {inputSources.latencyMs} ms{inputSources.latencyMeasured
						? ""
						: " (the browser's guess)"}</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="300"
					step="1"
					value={inputSources.latencyMs}
					aria-label="Input latency in milliseconds"
					oninput={(e) => inputSources.setLatencyMs(Number(e.currentTarget.value))}
				/>
			</label>
			<p class="text-12px opacity-70">
				A sound sung or played into the microphone or the line in arrives late by the input's round
				trip: the looper shifts such layers earlier by this much, and a multitrack take trims it off
				the front of their files. Calibrate plays three clicks through the speakers and measures
				them with the microphone.
			</p>
			{#if source === "mic"}
				<button
					class="device-button-xs px-3 justify-self-start"
					type="button"
					disabled={inputSources.calibrating || calibrateDisabled}
					onclick={calibrate}
				>
					{inputSources.calibrating ? "Listening…" : "Calibrate"}
				</button>
			{/if}
		</div>
	{/if}
	<div class="border-t border-current/10 pt-3 grid gap-3">
		{#if source !== "computer" && monitorSwitch}
			<label class="flex items-center gap-2 text-13px text-blue-100/90">
				<input
					type="checkbox"
					class="accent-maximumYellow"
					checked={inputSources.monitor}
					onchange={(e) => inputSources.setMonitor(e.currentTarget.checked)}
				/>
				Hear the microphone and the line in through the speakers
			</label>
		{/if}
		<label class="flex items-center gap-2 text-13px text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={inputSources.normalize}
				onchange={(e) => inputSources.setNormalize(e.currentTarget.checked)}
			/>
			Normalize what is recorded from the inputs to −1 dBFS
		</label>
	</div>
	{@render children?.()}
</div>
