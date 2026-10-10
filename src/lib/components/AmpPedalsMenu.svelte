<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import type { Attachment } from "svelte/attachments";

	/**
	 * The Practice Amp's pedal board (docs/practice-amp.md): a drawer per
	 * pedal in the order the signal meets them, one open at a time, its
	 * header lit and saying how much of it is on, as the piano's Effects
	 * menu. Before the amp: gate, compressor, overdrive, fuzz, wah; after
	 * it: chorus, phaser or flanger, delay, rotary. "Reset all" takes every
	 * pedal off and the head back to its model's defaults.
	 */
	const pct = (v: number) => (v > 0 ? `${Math.round(v * 100)}%` : "off");
	const rig = $derived(amp.rig);
	const p = $derived(rig.pedals);
	function reset() {
		amp.resetRig();
		notify("Pedals off, head at its defaults");
	}
	/** The compressor's gain-reduction meter, read each frame while the menu is open. */
	const meter: Attachment<HTMLElement> = (el) => {
		let frame = 0;
		const tick = () => {
			const bar = el.querySelector<HTMLElement>("[data-reduction]");
			if (bar)
				bar.style.width =
					p.compressor.amount > 0
						? `${Math.min(100, (-amp.meters().reduction / 24) * 100)}%`
						: "0%";
			frame = requestAnimationFrame(tick);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	};
</script>

{#snippet slider(
	label: string,
	value: number,
	oninput: (v: number) => void,
	opts: { min?: number; max?: number; step?: number; text?: string } = {},
)}
	<label class="block">
		<span class="device-button-label">{label} · {opts.text ?? `${Math.round(value * 100)}%`}</span>
		<input
			class="w-full accent-maximumYellow"
			type="range"
			min={opts.min ?? 0}
			max={opts.max ?? 1}
			step={opts.step ?? 0.01}
			{value}
			oninput={(e) => oninput(Number(e.currentTarget.value))}
			aria-label={label}
		/>
	</label>
{/snippet}

{#snippet drawer(name: string, amount: string, on: boolean, body: import("svelte").Snippet)}
	<details class="group border-t border-current/15 first-of-type-border-t-0" name="amp-pedals">
		<summary
			class="flex items-center justify-between gap-2 py-2 cursor-pointer select-none list-none [&::-webkit-details-marker]-hidden"
		>
			<span class={on ? "text-accent" : ""}>{name}</span>
			<span class="flex items-center gap-2 text-12px opacity-70 tabular-nums">
				{amount}
				<span
					class="i-ph-caret-down text-14px transition-transform group-open-rotate-180"
					aria-hidden="true"
				></span>
			</span>
		</summary>
		<div
			class="grid grid-cols-2 gap-3 pb-4 pt-1 [&_span.device-button-label]-(block mb-2 !text-light)"
		>
			{@render body()}
		</div>
	</details>
{/snippet}

<div class="px-3 pt-1 text-light" {@attach meter}>
	<p class="pb-2 text-11px uppercase tracking-wider opacity-60">Before the amp</p>
	{#snippet gateBody()}
		<label class="flex items-center gap-2 text-13px">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={p.gate.on}
				onchange={(e) => amp.setPedal("gate", { on: e.currentTarget.checked })}
			/>
			Gate on
		</label>
		{@render slider("Threshold", p.gate.threshold, (v) => amp.setPedal("gate", { threshold: v }), {
			min: -70,
			max: -20,
			step: 1,
			text: `${p.gate.threshold} dB`,
		})}
	{/snippet}
	{@render drawer("Noise gate", p.gate.on ? `${p.gate.threshold} dB` : "off", p.gate.on, gateBody)}

	{#snippet compBody()}
		{@render slider("Amount", p.compressor.amount, (v) =>
			amp.setPedal("compressor", { amount: v }),
		)}
		{@render slider("Ratio", p.compressor.ratio, (v) => amp.setPedal("compressor", { ratio: v }), {
			min: 1,
			max: 20,
			step: 0.5,
			text: `${p.compressor.ratio}:1`,
		})}
		{@render slider(
			"Attack",
			p.compressor.attack,
			(v) => amp.setPedal("compressor", { attack: v }),
			{
				min: 0.001,
				max: 0.1,
				step: 0.001,
				text: `${Math.round(p.compressor.attack * 1000)} ms`,
			},
		)}
		{@render slider(
			"Release",
			p.compressor.release,
			(v) => amp.setPedal("compressor", { release: v }),
			{
				min: 0.02,
				max: 1,
				step: 0.01,
				text: `${Math.round(p.compressor.release * 1000)} ms`,
			},
		)}
		{@render slider(
			"Make-up",
			p.compressor.makeup,
			(v) => amp.setPedal("compressor", { makeup: v }),
			{
				min: 0,
				max: 24,
				step: 1,
				text: `+${p.compressor.makeup} dB`,
			},
		)}
		<div class="block">
			<span class="device-button-label">Reduction</span>
			<div class="h-1.5 w-full rounded bg-blue-100/10 overflow-hidden" aria-hidden="true">
				<div class="h-full rounded bg-maximumYellow" data-reduction style:width="0%"></div>
			</div>
		</div>
	{/snippet}
	{@render drawer("Compressor", pct(p.compressor.amount), p.compressor.amount > 0, compBody)}

	{#snippet odBody()}
		{@render slider("Drive", p.overdrive.drive, (v) => amp.setPedal("overdrive", { drive: v }))}
		{@render slider("Tone", p.overdrive.tone, (v) => amp.setPedal("overdrive", { tone: v }))}
	{/snippet}
	{@render drawer("Overdrive", pct(p.overdrive.drive), p.overdrive.drive > 0, odBody)}

	{#snippet fuzzBody()}
		{@render slider("Drive", p.fuzz.drive, (v) => amp.setPedal("fuzz", { drive: v }))}
		{@render slider("Tone", p.fuzz.tone, (v) => amp.setPedal("fuzz", { tone: v }))}
	{/snippet}
	{@render drawer("Fuzz", pct(p.fuzz.drive), p.fuzz.drive > 0, fuzzBody)}

	{#snippet wahBody()}
		{@render slider("Mix", p.wah.mix, (v) => amp.setPedal("wah", { mix: v }))}
		<label class="block">
			<span class="device-button-label">Mode</span>
			<select
				class="device-field w-full"
				aria-label="Wah mode"
				value={p.wah.mode}
				onchange={(e) => amp.setPedal("wah", { mode: e.currentTarget.value as "touch" | "sweep" })}
			>
				<option value="touch">Touch (opens with your playing)</option>
				<option value="sweep">Sweep (on its own)</option>
			</select>
		</label>
		{#if p.wah.mode === "touch"}
			{@render slider("Sensitivity", p.wah.sensitivity, (v) =>
				amp.setPedal("wah", { sensitivity: v }),
			)}
		{:else}
			{@render slider("Rate", p.wah.rate, (v) => amp.setPedal("wah", { rate: v }), {
				min: 0.1,
				max: 5,
				step: 0.1,
				text: `${p.wah.rate} Hz`,
			})}
		{/if}
		{@render slider("Range", p.wah.range, (v) => amp.setPedal("wah", { range: v }))}
		{@render slider("Resonance", p.wah.resonance, (v) => amp.setPedal("wah", { resonance: v }))}
	{/snippet}
	{@render drawer("Wah", pct(p.wah.mix), p.wah.mix > 0, wahBody)}

	<p class="pt-3 pb-2 text-11px uppercase tracking-wider opacity-60">After the amp</p>
	{#snippet chorusBody()}
		{@render slider("Mix", p.chorus.mix, (v) => amp.setPedal("chorus", { mix: v }))}
		{@render slider("Rate", p.chorus.rate, (v) => amp.setPedal("chorus", { rate: v }), {
			min: 0.1,
			max: 5,
			step: 0.1,
			text: `${p.chorus.rate} Hz`,
		})}
		{@render slider("Depth", p.chorus.depth, (v) => amp.setPedal("chorus", { depth: v }))}
	{/snippet}
	{@render drawer("Chorus", pct(p.chorus.mix), p.chorus.mix > 0, chorusBody)}

	{#snippet phaserBody()}
		{@render slider("Mix", p.phaser.mix, (v) => amp.setPedal("phaser", { mix: v }))}
		<label class="block">
			<span class="device-button-label">Kind</span>
			<select
				class="device-field w-full"
				aria-label="Phaser or flanger"
				value={p.phaser.mode}
				onchange={(e) =>
					amp.setPedal("phaser", { mode: e.currentTarget.value as "phaser" | "flanger" })}
			>
				<option value="phaser">Phaser</option>
				<option value="flanger">Flanger</option>
			</select>
		</label>
		{@render slider("Rate", p.phaser.rate, (v) => amp.setPedal("phaser", { rate: v }), {
			min: 0.1,
			max: 5,
			step: 0.1,
			text: `${p.phaser.rate} Hz`,
		})}
		{@render slider("Depth", p.phaser.depth, (v) => amp.setPedal("phaser", { depth: v }))}
	{/snippet}
	{@render drawer(
		p.phaser.mode === "flanger" ? "Flanger" : "Phaser",
		pct(p.phaser.mix),
		p.phaser.mix > 0,
		phaserBody,
	)}

	{#snippet delayBody()}
		{@render slider("Level", p.delay.level, (v) => amp.setPedal("delay", { level: v }))}
		{@render slider("Time", p.delay.time, (v) => amp.setPedal("delay", { time: v }), {
			min: 0.05,
			max: 1,
			step: 0.01,
			text: `${Math.round(p.delay.time * 1000)} ms`,
		})}
		{@render slider("Feedback", p.delay.feedback, (v) => amp.setPedal("delay", { feedback: v }), {
			min: 0,
			max: 0.9,
		})}
		<label class="flex items-center gap-2 text-13px self-end pb-1">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				checked={p.delay.analog}
				onchange={(e) => amp.setPedal("delay", { analog: e.currentTarget.checked })}
			/>
			Analog (darker, softer repeats)
		</label>
	{/snippet}
	{@render drawer("Delay", pct(p.delay.level), p.delay.level > 0, delayBody)}

	{#snippet rotaryBody()}
		<div class="col-span-2 flex gap-1" role="group" aria-label="Rotary speed">
			{#each ["off", "slow", "fast"] as const as speed (speed)}
				<button
					class="device-button-xs px-3 {p.rotary.speed === speed ? 'text-accent' : ''}"
					type="button"
					aria-pressed={p.rotary.speed === speed}
					onclick={() => amp.setPedal("rotary", { speed })}
					>{speed === "off" ? "Off" : speed === "slow" ? "Slow" : "Fast"}</button
				>
			{/each}
		</div>
	{/snippet}
	{@render drawer(
		"Rotary speaker",
		p.rotary.speed === "off" ? "off" : p.rotary.speed,
		p.rotary.speed !== "off",
		rotaryBody,
	)}

	<div class="border-t border-current/15 py-3">
		<button class="device-button-xs px-3" type="button" onclick={reset}>Reset all</button>
	</div>
</div>
