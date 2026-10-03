<script lang="ts">
	import { piano } from "$lib/audio/piano.svelte";
	import { notify } from "$lib/state/notifications.svelte";

	function reset() {
		piano.resetEffects();
		notify("Effects reset");
	}

	/**
	 * The piano engine's effects as sliders and switches (docs/piano.md,
	 * "Effects"): reverb, delay, chorus, tremolo, fuzz, wah, phaser, tone,
	 * rotary. Lifted out of Piano.svelte (2026-10-03) so the chord player's
	 * Effects menu is the same menu: one engine, one set of controls.
	 */
</script>

<div
	class="px-3 pt-3 [&_span]-(block mb-2 text-blue-100/90) grid grid-cols-1 @xl-grid-cols-2 @4xl-grid-cols-3 gap-x-6 gap-y-4 mb-4"
>
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
