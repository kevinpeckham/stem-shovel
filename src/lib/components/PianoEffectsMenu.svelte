<script lang="ts">
	import { piano } from "$lib/audio/piano.svelte";
	import { notify } from "$lib/state/notifications.svelte";
	import { PIANO_BOUNCE_DIVISIONS, type PianoBounceDivision } from "$lib/constants/piano";
	import type { Attachment } from "svelte/attachments";

	function reset() {
		piano.resetEffects();
		notify("Effects reset");
	}
	/** The compressor's gain-reduction meter and the bounce's position, read each frame while the menu is open. */
	const meter: Attachment<HTMLElement> = (el) => {
		let frame = 0;
		const tick = () => {
			const m = piano.meters();
			const bar = el.querySelector<HTMLElement>("[data-reduction]");
			// The node keeps metering while bypassed; the bar reads zero then.
			if (bar)
				bar.style.width =
					piano.compressor.amount > 0 ? `${Math.min(100, (-m.reduction / 24) * 100)}%` : "0%";
			const dot = el.querySelector<HTMLElement>("[data-pan]");
			if (dot) dot.style.left = `calc(${((m.pan + 1) / 2) * 100}% - 4px)`;
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	};

	/**
	 * The piano engine's effects as sliders and switches (docs/piano.md,
	 * "Effects"): reverb, delay, chorus, tremolo, fuzz, wah, phaser, tone,
	 * rotary. Lifted out of Piano.svelte (2026-10-03) so the chord player's
	 * Effects menu is the same menu: one engine, one set of controls.
	 */
</script>

<div
	class="px-3 pt-3 [&_span]-(block mb-2 text-blue-100/90) grid grid-cols-1 @xl-grid-cols-2 @4xl-grid-cols-3 gap-x-6 gap-y-4 mb-4"
	{@attach meter}
>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Compressor</div>
		<label class="block">
			<span class="device-button-label">Amount · {Math.round(piano.compressor.amount * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.compressor.amount * 100)}
				oninput={(e) => piano.setCompressor({ amount: Number(e.currentTarget.value) / 100 })}
				aria-label="Compressor amount"
			/>
		</label>
		<div
			class="h-1.5 rounded bg-white/10 overflow-hidden"
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
			<span class="device-button-label">Ratio · {piano.compressor.ratio}:1</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="1"
				max="20"
				step="1"
				value={piano.compressor.ratio}
				oninput={(e) => piano.setCompressor({ ratio: Number(e.currentTarget.value) })}
				aria-label="Compressor ratio"
			/>
		</label>
		<label class="block">
			<span class="device-button-label"
				>Attack · {Math.round(piano.compressor.attack * 1000)} ms</span
			>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="1"
				max="100"
				step="1"
				value={Math.round(piano.compressor.attack * 1000)}
				oninput={(e) => piano.setCompressor({ attack: Number(e.currentTarget.value) / 1000 })}
				aria-label="Compressor attack"
			/>
		</label>
		<label class="block">
			<span class="device-button-label"
				>Release · {Math.round(piano.compressor.release * 1000)} ms</span
			>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="20"
				max="1000"
				step="10"
				value={Math.round(piano.compressor.release * 1000)}
				oninput={(e) => piano.setCompressor({ release: Number(e.currentTarget.value) / 1000 })}
				aria-label="Compressor release"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Make-up · +{piano.compressor.makeup} dB</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="12"
				step="1"
				value={piano.compressor.makeup}
				oninput={(e) => piano.setCompressor({ makeup: Number(e.currentTarget.value) })}
				aria-label="Compressor make-up gain"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Bounce</div>
		<label class="block">
			<span class="device-button-label">Depth · {Math.round(piano.bounce.depth * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.bounce.depth * 100)}
				oninput={(e) => piano.setBounce({ depth: Number(e.currentTarget.value) / 100 })}
				aria-label="Bounce depth"
			/>
		</label>
		<div
			class="relative h-1.5 rounded bg-white/10"
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
				value={piano.bounce.division}
				onchange={(e) =>
					piano.setBounce({ division: e.currentTarget.value as PianoBounceDivision })}
				aria-label="Bounce rate"
			>
				{#each PIANO_BOUNCE_DIVISIONS as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
			</select>
		</label>
		<label class="block">
			<span class="device-button-label">Glide · {Math.round(piano.bounce.glide * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.bounce.glide * 100)}
				oninput={(e) => piano.setBounce({ glide: Number(e.currentTarget.value) / 100 })}
				aria-label="Bounce glide"
			/>
		</label>
		<div class="flex gap-2" role="group" aria-label="Bounce path">
			<button
				class="flex-1 device-button-xs border {!piano.bounce.centre ? 'text-accent' : ''}"
				type="button"
				aria-pressed={!piano.bounce.centre}
				title="Left to right and back"
				onclick={() => piano.setBounce({ centre: false })}>L R</button
			>
			<button
				class="flex-1 device-button-xs border {piano.bounce.centre ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.bounce.centre}
				title="Left, centre, right, centre: a stop in the middle on the way"
				onclick={() => piano.setBounce({ centre: true })}>L C R</button
			>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Reverb</div>
		<label class="block">
			<span class="device-button-label">Level · {Math.round(piano.reverb * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.reverb * 100)}
				oninput={(e) => piano.setReverb(Number(e.currentTarget.value) / 100)}
				aria-label="Reverb"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Room size · {Math.round(piano.reverbSize * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.reverbSize * 100)}
				oninput={(e) => piano.setReverbSize(Number(e.currentTarget.value) / 100)}
				aria-label="Reverb size"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Delay</div>
		<label class="block">
			<span class="device-button-label">Level · {Math.round(piano.delay.level * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.delay.level * 100)}
				oninput={(e) => piano.setDelay({ level: Number(e.currentTarget.value) / 100 })}
				aria-label="Delay level"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Time · {Math.round(piano.delay.time * 1000)} ms</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="50"
				max="1000"
				step="10"
				value={Math.round(piano.delay.time * 1000)}
				oninput={(e) => piano.setDelay({ time: Number(e.currentTarget.value) / 1000 })}
				aria-label="Delay time"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Feedback · {Math.round(piano.delay.feedback * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="90"
				step="1"
				value={Math.round(piano.delay.feedback * 100)}
				oninput={(e) => piano.setDelay({ feedback: Number(e.currentTarget.value) / 100 })}
				aria-label="Delay feedback"
			/>
		</label>
		<div class="flex gap-2" role="group" aria-label="Delay character">
			<button
				class="flex-1 device-button-xs border {piano.delay.analog ? '' : 'text-accent'}"
				type="button"
				aria-pressed={!piano.delay.analog}
				title="Clean repeats"
				onclick={() => piano.setDelay({ analog: false })}>Digital</button
			>
			<button
				class="flex-1 device-button-xs border {piano.delay.analog ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.delay.analog}
				title="Tape-like repeats: each one darker and softer, with a slow wobble"
				onclick={() => piano.setDelay({ analog: true })}>Analog</button
			>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Fuzz</div>
		<label class="block">
			<span class="device-button-label">Drive · {Math.round(piano.fuzz.drive * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.fuzz.drive * 100)}
				oninput={(e) => piano.setFuzz({ drive: Number(e.currentTarget.value) / 100 })}
				aria-label="Fuzz drive"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Tone · {Math.round(piano.fuzz.tone * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.fuzz.tone * 100)}
				oninput={(e) => piano.setFuzz({ tone: Number(e.currentTarget.value) / 100 })}
				aria-label="Fuzz tone"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Wah</div>
		<div class="flex gap-2" role="group" aria-label="Wah mode">
			<button
				class="flex-1 device-button-xs border {piano.wah.mode === 'touch' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.wah.mode === "touch"}
				title="The filter opens with how hard you play"
				onclick={() => piano.setWah({ mode: "touch" })}>Touch</button
			>
			<button
				class="flex-1 device-button-xs border {piano.wah.mode === 'sweep' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.wah.mode === "sweep"}
				title="The filter sweeps on its own"
				onclick={() => piano.setWah({ mode: "sweep" })}>Sweep</button
			>
		</div>
		<label class="block">
			<span class="device-button-label">Mix · {Math.round(piano.wah.mix * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.wah.mix * 100)}
				oninput={(e) => piano.setWah({ mix: Number(e.currentTarget.value) / 100 })}
				aria-label="Wah mix"
			/>
		</label>
		{#if piano.wah.mode === "touch"}
			<label class="block">
				<span class="device-button-label"
					>Sensitivity · {Math.round(piano.wah.sensitivity * 100)}%</span
				>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0"
					max="100"
					step="1"
					value={Math.round(piano.wah.sensitivity * 100)}
					oninput={(e) => piano.setWah({ sensitivity: Number(e.currentTarget.value) / 100 })}
					aria-label="Wah sensitivity"
				/>
			</label>
		{:else}
			<label class="block">
				<span class="device-button-label">Rate · {piano.wah.rate.toFixed(1)} Hz</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min="0.1"
					max="5"
					step="0.1"
					value={piano.wah.rate}
					oninput={(e) => piano.setWah({ rate: Number(e.currentTarget.value) })}
					aria-label="Wah rate"
				/>
			</label>
		{/if}
		<label class="block">
			<span class="device-button-label">Range · {Math.round(piano.wah.range * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.wah.range * 100)}
				oninput={(e) => piano.setWah({ range: Number(e.currentTarget.value) / 100 })}
				aria-label="Wah range"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Resonance · {Math.round(piano.wah.resonance * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.wah.resonance * 100)}
				oninput={(e) => piano.setWah({ resonance: Number(e.currentTarget.value) / 100 })}
				aria-label="Wah resonance"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Chorus</div>
		<label class="block">
			<span class="device-button-label">Mix · {Math.round(piano.chorus.mix * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.chorus.mix * 100)}
				oninput={(e) => piano.setChorus({ mix: Number(e.currentTarget.value) / 100 })}
				aria-label="Chorus mix"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Rate · {piano.chorus.rate.toFixed(1)} Hz</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0.1"
				max="5"
				step="0.1"
				value={piano.chorus.rate}
				oninput={(e) => piano.setChorus({ rate: Number(e.currentTarget.value) })}
				aria-label="Chorus rate"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Depth · {Math.round(piano.chorus.depth * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.chorus.depth * 100)}
				oninput={(e) => piano.setChorus({ depth: Number(e.currentTarget.value) / 100 })}
				aria-label="Chorus depth"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Tremolo</div>
		<label class="block">
			<span class="device-button-label">Depth · {Math.round(piano.tremolo.depth * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.tremolo.depth * 100)}
				oninput={(e) => piano.setTremolo({ depth: Number(e.currentTarget.value) / 100 })}
				aria-label="Tremolo depth"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Rate · {piano.tremolo.rate.toFixed(1)} Hz</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0.5"
				max="12"
				step="0.1"
				value={piano.tremolo.rate}
				oninput={(e) => piano.setTremolo({ rate: Number(e.currentTarget.value) })}
				aria-label="Tremolo rate"
			/>
		</label>
		<div class="flex gap-2" role="group" aria-label="Tremolo shape">
			<button
				class="flex-1 device-button-xs border {piano.tremolo.shape === 'sine' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.tremolo.shape === "sine"}
				title="A smooth swell"
				onclick={() => piano.setTremolo({ shape: "sine" })}>Smooth</button
			>
			<button
				class="flex-1 device-button-xs border {piano.tremolo.shape === 'square'
					? 'text-accent'
					: ''}"
				type="button"
				aria-pressed={piano.tremolo.shape === "square"}
				title="A hard on-off chop"
				onclick={() => piano.setTremolo({ shape: "square" })}>Chop</button
			>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">
			{piano.phaser.mode === "flanger" ? "Flanger" : "Phaser"}
		</div>
		<div class="flex gap-2" role="group" aria-label="Phaser or flanger">
			<button
				class="flex-1 device-button-xs border {piano.phaser.mode === 'phaser' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.phaser.mode === "phaser"}
				title="Notches swept through the sound"
				onclick={() => piano.setPhaser({ mode: "phaser" })}>Phaser</button
			>
			<button
				class="flex-1 device-button-xs border {piano.phaser.mode === 'flanger'
					? 'text-accent'
					: ''}"
				type="button"
				aria-pressed={piano.phaser.mode === "flanger"}
				title="A jet-like sweep from a short delay"
				onclick={() => piano.setPhaser({ mode: "flanger" })}>Flanger</button
			>
		</div>
		<label class="block">
			<span class="device-button-label">Mix · {Math.round(piano.phaser.mix * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.phaser.mix * 100)}
				oninput={(e) => piano.setPhaser({ mix: Number(e.currentTarget.value) / 100 })}
				aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} mix"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Rate · {piano.phaser.rate.toFixed(1)} Hz</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0.1"
				max="5"
				step="0.1"
				value={piano.phaser.rate}
				oninput={(e) => piano.setPhaser({ rate: Number(e.currentTarget.value) })}
				aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} rate"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Depth · {Math.round(piano.phaser.depth * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.phaser.depth * 100)}
				oninput={(e) => piano.setPhaser({ depth: Number(e.currentTarget.value) / 100 })}
				aria-label="{piano.phaser.mode === 'flanger' ? 'Flanger' : 'Phaser'} depth"
			/>
		</label>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Rotary</div>
		<span class="device-button-label !mb-0">Speaker</span>
		<div class="flex gap-2" role="group" aria-label="Rotary speaker">
			<button
				class="flex-1 device-button-xs border {piano.rotary.speed === 'off' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.rotary.speed === "off"}
				title="The rotors stop"
				onclick={() => piano.setRotary("off")}>Off</button
			>
			<button
				class="flex-1 device-button-xs border {piano.rotary.speed === 'slow' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.rotary.speed === "slow"}
				title="A slow swirl, the horn under once a second"
				onclick={() => piano.setRotary("slow")}>Slow</button
			>
			<button
				class="flex-1 device-button-xs border {piano.rotary.speed === 'fast' ? 'text-accent' : ''}"
				type="button"
				aria-pressed={piano.rotary.speed === "fast"}
				title="A fast shimmer, the rotors spun up over a second or two"
				onclick={() => piano.setRotary("fast")}>Fast</button
			>
		</div>
	</div>
	<div class="grid grid-cols-1 gap-y-3 content-start">
		<div class="device-button-group-label !text-blue-100/90 !mb-0">Tone</div>
		<label class="block">
			<span class="device-button-label"
				>Tilt · {piano.tone.tilt === 0
					? "flat"
					: piano.tone.tilt < 0
						? `${Math.round(-piano.tone.tilt * 100)}% dark`
						: `${Math.round(piano.tone.tilt * 100)}% bright`}</span
			>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="-100"
				max="100"
				step="1"
				value={Math.round(piano.tone.tilt * 100)}
				oninput={(e) => piano.setTone({ tilt: Number(e.currentTarget.value) / 100 })}
				aria-label="Tone tilt"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Air · {Math.round(piano.tone.air * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.tone.air * 100)}
				oninput={(e) => piano.setTone({ air: Number(e.currentTarget.value) / 100 })}
				aria-label="Tone air"
			/>
		</label>
		<label class="block">
			<span class="device-button-label">Bottom · {Math.round(piano.tone.bottom * 100)}%</span>
			<input
				class="w-full accent-maximumYellow"
				type="range"
				min="0"
				max="100"
				step="1"
				value={Math.round(piano.tone.bottom * 100)}
				oninput={(e) => piano.setTone({ bottom: Number(e.currentTarget.value) / 100 })}
				aria-label="Tone bottom"
			/>
		</label>
	</div>
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
