<script lang="ts">
	import { PLAN_LABELS } from "$lib/constants/plans";
	import type { AccountPlan } from "$lib/val/AccountPlanSchema";

	/**
	 * An account's tier at a glance: Founder (never charged, unlimited data,
	 * every feature), Free for life (no base subscription, ever), or the plan
	 * name once paid tiers exist. docs/billing.md.
	 */
	interface Props {
		plan: AccountPlan;
		lifetimeFree: boolean;
		isFounder: boolean;
		/** Show as inline text-size chip (default) or the larger settings header style. */
		size?: "sm" | "md";
	}
	let { plan, lifetimeFree, isFounder, size = "sm" }: Props = $props();
	let label = $derived(isFounder ? "Founder" : lifetimeFree ? "Free for life" : PLAN_LABELS[plan]);
	let title = $derived(
		isFounder
			? "Founder account: never charged, unlimited data, every feature, always"
			: lifetimeFree
				? "Free for life: no base subscription cost, ever"
				: `${PLAN_LABELS[plan]} plan`,
	);
</script>

<span
	class="inline-flex items-center gap-1 rounded border align-middle font-600 tracking-wider uppercase {size ===
	'md'
		? 'px-2 py-1 text-11px'
		: 'px-1.5 py-0.5 text-10px'} {isFounder
		? 'border-accent/60 bg-accent/10 text-accent'
		: 'border-current/40 text-dim'}"
	{title}
>
	{#if isFounder}<span class="i-ph-star-fill" aria-hidden="true"></span>{/if}
	{label}
</span>
