<script lang="ts">
	import { piano, type PianoEngine } from "$lib/audio/piano.svelte";
	import { notify } from "$lib/state/notifications.svelte";
	import { PIANO_BOUNCE_DIVISIONS, type PianoBounceDivision } from "$lib/constants/piano";
	import type { Attachment } from "svelte/attachments";

	/** Which engine the menu drives: the piano's, or the chord player's own (docs/chord-player.md, "Its own engine"). */
	let { engine = piano }: { engine?: PianoEngine } = $props();
	function reset() {
		engine.resetEffects();
		notify("Effects reset");
	}
	/** The compressor's gain-reduction meter and the bounce's position, read each frame while the menu is open. */
	const meter: Attachment<HTMLElement> = (el) => {
		let frame = 0;
		const tick = () => {
			const m = engine.meters();
			const bar = el.querySelector<HTMLElement>("[data-reduction]");
			// The node keeps metering while bypassed; the bar reads zero then.
			if (bar)
				bar.style.width =
					engine.compressor.amount > 0 ? `${Math.min(100, (-m.reduction / 24) * 100)}%` : "0%";
			const dot = el.querySelector<HTMLElement>("[data-pan]");
			if (dot) dot.style.left = `calc(${((m.pan + 1) / 2) * 100}% - 4px)`;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	};

	/**
	 * The piano engine's effects as sliders and switches (docs/piano.md,
	 * "Effects"): reverb, delay, fuzz, chorus, tremolo, phaser, wah, rotary,
	 * tone, compressor, bounce, a drawer each, one open at a time, its header
	 * lit and saying how much of it is on (Kevin: the menu had grown
	 * unwieldy). Lifted out of Piano.svelte (2026-10-03) so the chord
	 * player's Effects menu is the same menu: one engine, one set of controls.
	 */
	const pct = (v: number) => (v > 0 ? `${Math.round(v * 100)}%` : "off");
</script>

<div class="px-3 pt-1 text-light" {@attach meter}>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.reverb > 0 ? "text-accent" : ""}>Reverb</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.reverb)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Level · {Math.round(engine.reverb * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.reverb * 100)}
					oninput={(e) => engine.setReverb(Number(e.currentTarget.value) / 100)}
					aria-label="Reverb"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Room size · {Math.round(engine.reverbSize * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.reverbSize * 100)}
					oninput={(e) => engine.setReverbSize(Number(e.currentTarget.value) / 100)}
					aria-label="Reverb size"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.delay.level > 0 ? "text-accent" : ""}>Delay</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.delay.level)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Level · {Math.round(engine.delay.level * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.delay.level * 100)}
					oninput={(e) => engine.setDelay({ level: Number(e.currentTarget.value) / 100 })}
					aria-label="Delay level"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Time · {Math.round(engine.delay.time * 1000)} ms</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="50"
					max="1000"
					step="10"
					value={Math.round(engine.delay.time * 1000)}
					oninput={(e) => engine.setDelay({ time: Number(e.currentTarget.value) / 1000 })}
					aria-label="Delay time"
				/>
			</label>
			<label class="block">
				<span class="device-button-label"
					>Feedback · {Math.round(engine.delay.feedback * 100)}%</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="90"
					step="1"
					value={Math.round(engine.delay.feedback * 100)}
					oninput={(e) => engine.setDelay({ feedback: Number(e.currentTarget.value) / 100 })}
					aria-label="Delay feedback"
				/>
			</label>
			<div class="flex gap-2" role="group" aria-label="Delay character">
				<button
					class="flex-1 device-button-xs border {engine.delay.analog ? '' : 'text-accent'}"
					type="button"
					aria-pressed={!engine.delay.analog}
					title="Clean repeats"
					onclick={() => engine.setDelay({ analog: false })}>Digital</button
				>
				<button
					class="flex-1 device-button-xs border {engine.delay.analog ? 'text-accent' : ''}"
					type="button"
					aria-pressed={engine.delay.analog}
					title="Tape-like repeats: each one darker and softer, with a slow wobble"
					onclick={() => engine.setDelay({ analog: true })}>Analog</button
				>
			</div>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.fuzz.drive > 0 ? "text-accent" : ""}>Fuzz</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.fuzz.drive)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Drive · {Math.round(engine.fuzz.drive * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.fuzz.drive * 100)}
					oninput={(e) => engine.setFuzz({ drive: Number(e.currentTarget.value) / 100 })}
					aria-label="Fuzz drive"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Tone · {Math.round(engine.fuzz.tone * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.fuzz.tone * 100)}
					oninput={(e) => engine.setFuzz({ tone: Number(e.currentTarget.value) / 100 })}
					aria-label="Fuzz tone"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.chorus.mix > 0 ? "text-accent" : ""}>Chorus</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.chorus.mix)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Mix · {Math.round(engine.chorus.mix * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.chorus.mix * 100)}
					oninput={(e) => engine.setChorus({ mix: Number(e.currentTarget.value) / 100 })}
					aria-label="Chorus mix"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Rate · {engine.chorus.rate.toFixed(1)} Hz</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0.1"
					max="5"
					step="0.1"
					value={engine.chorus.rate}
					oninput={(e) => engine.setChorus({ rate: Number(e.currentTarget.value) })}
					aria-label="Chorus rate"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Depth · {Math.round(engine.chorus.depth * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.chorus.depth * 100)}
					oninput={(e) => engine.setChorus({ depth: Number(e.currentTarget.value) / 100 })}
					aria-label="Chorus depth"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.tremolo.depth > 0 ? "text-accent" : ""}>Tremolo</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.tremolo.depth)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Depth · {Math.round(engine.tremolo.depth * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.tremolo.depth * 100)}
					oninput={(e) => engine.setTremolo({ depth: Number(e.currentTarget.value) / 100 })}
					aria-label="Tremolo depth"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Rate · {engine.tremolo.rate.toFixed(1)} Hz</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0.5"
					max="12"
					step="0.1"
					value={engine.tremolo.rate}
					oninput={(e) => engine.setTremolo({ rate: Number(e.currentTarget.value) })}
					aria-label="Tremolo rate"
				/>
			</label>
			<div class="flex gap-2" role="group" aria-label="Tremolo shape">
				<button
					class="flex-1 device-button-xs border {engine.tremolo.shape === 'sine'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.tremolo.shape === "sine"}
					title="A smooth swell"
					onclick={() => engine.setTremolo({ shape: "sine" })}>Smooth</button
				>
				<button
					class="flex-1 device-button-xs border {engine.tremolo.shape === 'square'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.tremolo.shape === "square"}
					title="A hard on-off chop"
					onclick={() => engine.setTremolo({ shape: "square" })}>Chop</button
				>
			</div>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.phaser.mix > 0 ? "text-accent" : ""}
				>{engine.phaser.mode === "flanger" ? "Flanger" : "Phaser"}</span
			>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.phaser.mix)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<div class="flex gap-2" role="group" aria-label="Phaser or flanger">
				<button
					class="flex-1 device-button-xs border {engine.phaser.mode === 'phaser'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.phaser.mode === "phaser"}
					title="Notches swept through the sound"
					onclick={() => engine.setPhaser({ mode: "phaser" })}>Phaser</button
				>
				<button
					class="flex-1 device-button-xs border {engine.phaser.mode === 'flanger'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.phaser.mode === "flanger"}
					title="A jet-like sweep from a short delay"
					onclick={() => engine.setPhaser({ mode: "flanger" })}>Flanger</button
				>
			</div>
			<label class="block">
				<span class="device-button-label">Mix · {Math.round(engine.phaser.mix * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.phaser.mix * 100)}
					oninput={(e) => engine.setPhaser({ mix: Number(e.currentTarget.value) / 100 })}
					aria-label="{engine.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} mix"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Rate · {engine.phaser.rate.toFixed(1)} Hz</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0.1"
					max="5"
					step="0.1"
					value={engine.phaser.rate}
					oninput={(e) => engine.setPhaser({ rate: Number(e.currentTarget.value) })}
					aria-label="{engine.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} rate"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Depth · {Math.round(engine.phaser.depth * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.phaser.depth * 100)}
					oninput={(e) => engine.setPhaser({ depth: Number(e.currentTarget.value) / 100 })}
					aria-label="{engine.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} depth"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.wah.mix > 0 ? "text-accent" : ""}>Wah</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.wah.mix)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<div class="flex gap-2" role="group" aria-label="Wah mode">
				<button
					class="flex-1 device-button-xs border {engine.wah.mode === 'touch' ? 'text-accent' : ''}"
					type="button"
					aria-pressed={engine.wah.mode === "touch"}
					title="The filter opens with how hard you play"
					onclick={() => engine.setWah({ mode: "touch" })}>Touch</button
				>
				<button
					class="flex-1 device-button-xs border {engine.wah.mode === 'sweep' ? 'text-accent' : ''}"
					type="button"
					aria-pressed={engine.wah.mode === "sweep"}
					title="The filter sweeps on its own"
					onclick={() => engine.setWah({ mode: "sweep" })}>Sweep</button
				>
			</div>
			<label class="block">
				<span class="device-button-label">Mix · {Math.round(engine.wah.mix * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.wah.mix * 100)}
					oninput={(e) => engine.setWah({ mix: Number(e.currentTarget.value) / 100 })}
					aria-label="Wah mix"
				/>
			</label>
			{#if engine.wah.mode === "touch"}
				<label class="block">
					<span class="device-button-label"
						>Sensitivity · {Math.round(engine.wah.sensitivity * 100)}%</span
					>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0"
						max="100"
						step="1"
						value={Math.round(engine.wah.sensitivity * 100)}
						oninput={(e) => engine.setWah({ sensitivity: Number(e.currentTarget.value) / 100 })}
						aria-label="Wah sensitivity"
					/>
				</label>
			{:else}
				<label class="block">
					<span class="device-button-label">Rate · {engine.wah.rate.toFixed(1)} Hz</span>
					<input
						class="w-full accent-maximumYellow"
						type="range"
						min="0.1"
						max="5"
						step="0.1"
						value={engine.wah.rate}
						oninput={(e) => engine.setWah({ rate: Number(e.currentTarget.value) })}
						aria-label="Wah rate"
					/>
				</label>
			{/if}
			<label class="block">
				<span class="device-button-label">Range · {Math.round(engine.wah.range * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.wah.range * 100)}
					oninput={(e) => engine.setWah({ range: Number(e.currentTarget.value) / 100 })}
					aria-label="Wah range"
				/>
			</label>
			<label class="block">
				<span class="device-button-label"
					>Resonance · {Math.round(engine.wah.resonance * 100)}%</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.wah.resonance * 100)}
					oninput={(e) => engine.setWah({ resonance: Number(e.currentTarget.value) / 100 })}
					aria-label="Wah resonance"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.rotary.speed !== "off" ? "text-accent" : ""}>Rotary</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{engine.rotary.speed}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<span class="device-button-label !mb-0">Speaker</span>
			<div class="flex gap-2" role="group" aria-label="Rotary speaker">
				<button
					class="flex-1 device-button-xs border {engine.rotary.speed === 'off'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.rotary.speed === "off"}
					title="The rotors stop"
					onclick={() => engine.setRotary("off")}>Off</button
				>
				<button
					class="flex-1 device-button-xs border {engine.rotary.speed === 'slow'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.rotary.speed === "slow"}
					title="A slow swirl, the horn under once a second"
					onclick={() => engine.setRotary("slow")}>Slow</button
				>
				<button
					class="flex-1 device-button-xs border {engine.rotary.speed === 'fast'
						? 'text-accent'
						: ''}"
					type="button"
					aria-pressed={engine.rotary.speed === "fast"}
					title="A fast shimmer, the rotors spun up over a second or two"
					onclick={() => engine.setRotary("fast")}>Fast</button
				>
			</div>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.bounce.depth > 0 ? "text-accent" : ""}>Bounce</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.bounce.depth)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label">Depth · {Math.round(engine.bounce.depth * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.bounce.depth * 100)}
					oninput={(e) => engine.setBounce({ depth: Number(e.currentTarget.value) / 100 })}
					aria-label="Bounce depth"
				/>
			</label>
			<div
				class="relative h-1.5 rounded bg-white/10 col-span-full"
				title="Where the sound is, left to right"
				aria-hidden="true"
			>
				<div
					class="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-maximumYellow"
					data-pan
					style="left:calc(50% - 4px)"
				></div>
			</div>
			<label class="block">
				<span class="device-button-label">Switches</span>
				<select
					class="device-field w-full"
					value={engine.bounce.division}
					onchange={(e) =>
						engine.setBounce({ division: e.currentTarget.value as PianoBounceDivision })}
					aria-label="Bounce rate"
				>
					{#each PIANO_BOUNCE_DIVISIONS as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
				</select>
			</label>
			<label class="block">
				<span class="device-button-label">Glide · {Math.round(engine.bounce.glide * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.bounce.glide * 100)}
					oninput={(e) => engine.setBounce({ glide: Number(e.currentTarget.value) / 100 })}
					aria-label="Bounce glide"
				/>
			</label>
			<div class="flex gap-2" role="group" aria-label="Bounce path">
				<button
					class="flex-1 device-button-xs border {!engine.bounce.centre ? 'text-accent' : ''}"
					type="button"
					aria-pressed={!engine.bounce.centre}
					title="Left to right and back"
					onclick={() => engine.setBounce({ centre: false })}>L R</button
				>
				<button
					class="flex-1 device-button-xs border {engine.bounce.centre ? 'text-accent' : ''}"
					type="button"
					aria-pressed={engine.bounce.centre}
					title="Left, centre, right, centre: a stop in the middle on the way"
					onclick={() => engine.setBounce({ centre: true })}>L C R</button
				>
			</div>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span
				class={!(engine.tone.tilt === 0 && engine.tone.air === 0 && engine.tone.bottom === 0)
					? "text-accent"
					: ""}>Tone</span
			>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{engine.tone.tilt === 0 && engine.tone.air === 0 && engine.tone.bottom === 0
					? "flat"
					: "shaped"}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label"
					>Tilt · {engine.tone.tilt === 0
						? "flat"
						: engine.tone.tilt < 0
							? `${Math.round(-engine.tone.tilt * 100)}% dark`
							: `${Math.round(engine.tone.tilt * 100)}% bright`}</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="-100"
					max="100"
					step="1"
					value={Math.round(engine.tone.tilt * 100)}
					oninput={(e) => engine.setTone({ tilt: Number(e.currentTarget.value) / 100 })}
					aria-label="Tone tilt"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Air · {Math.round(engine.tone.air * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.tone.air * 100)}
					oninput={(e) => engine.setTone({ air: Number(e.currentTarget.value) / 100 })}
					aria-label="Tone air"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Bottom · {Math.round(engine.tone.bottom * 100)}%</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.tone.bottom * 100)}
					oninput={(e) => engine.setTone({ bottom: Number(e.currentTarget.value) / 100 })}
					aria-label="Tone bottom"
				/>
			</label>
		</div>
	</details>
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="piano-effects">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={engine.compressor.amount > 0 ? "text-accent" : ""}>Compressor</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{pct(engine.compressor.amount)}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			<label class="block">
				<span class="device-button-label"
					>Amount · {Math.round(engine.compressor.amount * 100)}%</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(engine.compressor.amount * 100)}
					oninput={(e) => engine.setCompressor({ amount: Number(e.currentTarget.value) / 100 })}
					aria-label="Compressor amount"
				/>
			</label>
			<div
				class="h-1.5 rounded bg-white/10 overflow-hidden col-span-full"
				title="Gain reduction, 0 to 24 dB"
				aria-hidden="true"
			>
				<div
					class="h-full bg-maximumYellow transition-[width] duration-75"
					data-reduction
					style="width:0%"
				></div>
			</div>
			<label class="block">
				<span class="device-button-label">Ratio · {engine.compressor.ratio}:1</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="1"
					max="20"
					step="1"
					value={engine.compressor.ratio}
					oninput={(e) => engine.setCompressor({ ratio: Number(e.currentTarget.value) })}
					aria-label="Compressor ratio"
				/>
			</label>
			<label class="block">
				<span class="device-button-label"
					>Attack · {Math.round(engine.compressor.attack * 1000)} ms</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="1"
					max="100"
					step="1"
					value={Math.round(engine.compressor.attack * 1000)}
					oninput={(e) => engine.setCompressor({ attack: Number(e.currentTarget.value) / 1000 })}
					aria-label="Compressor attack"
				/>
			</label>
			<label class="block">
				<span class="device-button-label"
					>Release · {Math.round(engine.compressor.release * 1000)} ms</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="20"
					max="1000"
					step="10"
					value={Math.round(engine.compressor.release * 1000)}
					oninput={(e) => engine.setCompressor({ release: Number(e.currentTarget.value) / 1000 })}
					aria-label="Compressor release"
				/>
			</label>
			<label class="block">
				<span class="device-button-label">Make-up · +{engine.compressor.makeup} dB</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="12"
					step="1"
					value={engine.compressor.makeup}
					oninput={(e) => engine.setCompressor({ makeup: Number(e.currentTarget.value) })}
					aria-label="Compressor make-up gain"
				/>
			</label>
		</div>
	</details>
</div>
<div class="px-3 pb-3 flex justify-end">
	<button
		class="device-button-sm px-3"
		type="button"
		title="Every effect back to its default; the sound stays"
		onclick={reset}
	>
		<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span>
		Reset all to defaults
	</button>
</div>
