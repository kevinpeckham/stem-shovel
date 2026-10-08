<script lang="ts">
	import { drumMachine } from "#lib/audio/drumMachine.svelte.js";
	import { TUTORIAL_STEPS } from "#lib/constants/drumTutorial.js";
	import { drumTutorial as tutorial } from "#lib/state/drumTutorial.svelte.js";

	/**
	 * The walk-through panel under the drum machine: the step's title and
	 * text, a tick once the grid has caught up, Back and Next, and "Do it
	 * for me", which makes the step's change in the machine. Sticks to the
	 * bottom of the screen so the words stay in view while the cells above
	 * are tapped. Starting it swaps in the empty tutorial kit with the
	 * machine's usual undo, so a beat in progress is not lost.
	 */
	let step = $derived(tutorial.step);
	let done = $derived(
		tutorial.active && step.done(drumMachine.project, { played: tutorial.played }),
	);

	/** The step's change, made for the person: cells set, the control pressed. */
	function doIt() {
		for (const w of step.cells ?? []) {
			const index = w.pattern ?? 0;
			if (index !== drumMachine.current) drumMachine.select(index);
			const row = drumMachine.pattern.rows.findIndex((r) => r.voice === w.voice);
			if (row < 0) continue;
			for (const s of w.steps) drumMachine.setVelocity(row, s, w.velocity);
		}
		switch (step.control) {
			case "play":
				if (!drumMachine.running) void drumMachine.start();
				tutorial.played = true;
				break;
			case "copy":
				if (drumMachine.project.patterns.length < 2) drumMachine.addPattern(true);
				break;
			case "humanize":
				drumMachine.setHumanize(0.15);
				break;
			case "reverb":
				drumMachine.setFx({ reverbReturn: 0.3 });
				break;
			case "delay":
				drumMachine.setFx({ delayReturn: 0.25 });
				break;
		}
	}
</script>

{#if tutorial.active}
	<section
		class="sticky bottom-2 z-20 mt-4 rounded-md border border-white/15 bg-oxford-800/95 p-4 shadow-lg shadow-black/50 backdrop-blur"
		aria-label="Tutorial"
		aria-live="polite"
	>
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="font-600">
				<span class="text-12px opacity-60 mr-2"
					>Step {tutorial.index + 1} of {TUTORIAL_STEPS.length}</span
				>{step.title}
				{#if done}<span
						class="i-ph-check-circle-fill ml-1 align-[-2px] text-green-400"
						aria-label="done"
					></span>{/if}
			</h2>
			<button
				class="button button-xs shrink-0"
				type="button"
				onclick={() => tutorial.stop()}
				aria-label="Close the tutorial">Close</button
			>
		</div>
		<p class="mt-2 text-14px leading-relaxed opacity-90 max-w-prose">{step.text}</p>
		<div class="mt-3 flex flex-wrap items-center gap-2">
			<button
				class="button button-sm"
				type="button"
				disabled={tutorial.index === 0}
				onclick={() => tutorial.back()}>Back</button
			>
			{#if tutorial.last}
				<button
					class="button button-sm button-accent-solid"
					type="button"
					onclick={() => tutorial.stop()}>Done</button
				>
			{:else}
				<button
					class="button button-sm {done ? 'button-accent-solid' : ''}"
					type="button"
					onclick={() => tutorial.next()}>Next</button
				>
			{/if}
			{#if (step.cells || step.control) && step.control !== "keep" && !done}
				<button class="button button-sm ml-auto" type="button" onclick={doIt}>Do it for me</button>
			{/if}
		</div>
	</section>
{/if}
