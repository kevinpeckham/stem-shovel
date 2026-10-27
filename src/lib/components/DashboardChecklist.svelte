<script lang="ts">
	import type { OnboardingStep } from "#lib/utils/onboardingSteps.js";

	/** A new account's checklist (utils/onboardingSteps.ts): each step links to its action, struck through once done. */
	let { steps }: { steps: OnboardingStep[] } = $props();
</script>

<div class="surface grid gap-3 p-5">
	<h3 class="heading-3 mb-0">Get started</h3>
	<ul class="grid gap-2" aria-label="Getting started">
		{#each steps as step (step.id)}
			<li class="flex items-center gap-2">
				<span
					class="{step.done
						? 'i-ph-check-circle text-accent'
						: 'i-ph-circle opacity-70'} shrink-0 text-18px"
					aria-hidden="true"
				></span>
				<a class={step.done ? "text-dim line-through opacity-70" : "link"} href={step.href}
					>{step.label}{#if step.done}<span class="sr-only"> (done)</span>{/if}</a
				>
			</li>
		{/each}
	</ul>
</div>
