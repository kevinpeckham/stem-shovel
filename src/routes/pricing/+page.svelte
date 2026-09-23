<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";

	let { data } = $props();

	/**
	 * The plans, as a table of rows so the two cards line up feature for
	 * feature. Prices are in USD before tax (the disclaimer at the foot).
	 */
	const ROWS = [
		{ label: "Projects", free: "Unlimited", pro: "Unlimited" },
		{ label: "Songs", free: "Unlimited", pro: "Unlimited" },
		{ label: "Ideas", free: "Unlimited", pro: "Unlimited" },
		{ label: "Storage", free: "10 GB", pro: "30 GB included *" },
		{ label: "Users", free: "Up to 5", pro: "Up to 10" },
		{ label: "Viewers", free: "Unlimited", pro: "Unlimited" },
		{ label: "Support", free: "Basic", pro: "Priority" },
	] as const;
	const INCLUDED = [
		"Two-factor authentication and passkeys",
		"Public projects",
		"Private projects",
		"Stem player",
		"Demos player",
		"Share stems",
		"Custom mixes",
		"Share demos",
		"Song docs",
	];
</script>

<svelte:head>
	<title>{pageTitle("Pricing")}</title>
	<meta
		name="description"
		content="Stem Shovel is free forever for bands of up to five with 10 GB of storage, no credit card required. A Professional plan with more storage and more users is launching soon at $10 a month."
	/>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-2">
		<h1 class="heading-2">Pricing</h1>
		<p class="opacity-90 text-balance">
			Start free and stay free for as long as it fits. When a band needs more storage and more
			seats, the Professional plan is on its way.
		</p>
	</header>

	<div class="grid gap-6 md:grid-cols-2 max-w-4xl">
		{#snippet plan(
			name: string,
			tagline: string,
			price: string,
			availability: string,
			available: boolean,
			column: "free" | "pro",
		)}
			<section
				class="marketing-box flex flex-col gap-4 pb-5 {available ? '' : 'border-accent/40'}"
				aria-labelledby="plan-{column}"
			>
				<div class="flex flex-wrap items-start justify-between gap-2">
					<div>
						<h2 id="plan-{column}" class="text-20px font-700 text-white leading-tight">{name}</h2>
						<p class="mt-1 text-sm opacity-80 text-balance">{tagline}</p>
					</div>
					<span
						class="rounded border px-2 py-0.5 text-11px uppercase tracking-wider {available
							? 'border-green-400/60 text-green-400'
							: 'border-accent/60 text-accent'}">{availability}</span
					>
				</div>
				<p class="font-mono tabular-nums">
					<span class="text-40px leading-none text-white">{price}</span>
					<span class="text-dim"> / month</span>
				</p>
				<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm border-t border-white/10 pt-4">
					{#each ROWS as row (row.label)}
						<dt class="text-dim">{row.label}</dt>
						<dd class="text-right text-white">{row[column]}</dd>
					{/each}
				</dl>
				<div class="mt-auto pt-2">
					{#if column === "free"}
						{#if data.user}
							<a class="button-accent-solid button-sm" href="/accounts">Your accounts</a>
						{:else if data.signUpOpen}
							<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
							<p class="mt-2 text-13px opacity-80">No credit card required.</p>
						{:else}
							<a class="button-accent-solid button-sm" href="/waitlist">Join the Waitlist</a>
							<p class="mt-2 text-13px opacity-80">
								No credit card required. Have an invite code? <a class="link-dim" href="/sign-up"
									>Sign up</a
								>.
							</p>
						{/if}
					{:else}
						<p class="text-13px opacity-80">
							Not available yet. Everyone on the free plan will hear when it launches.
						</p>
					{/if}
				</div>
			</section>
		{/snippet}
		{@render plan(
			"Free",
			"Free forever. No credit card required to get started.",
			"$0",
			"Available now",
			true,
			"free",
		)}
		{@render plan(
			"Professional",
			"When you need more storage and more users.",
			"$10",
			"Launching soon",
			false,
			"pro",
		)}
	</div>
	<p class="max-w-4xl -mt-3 text-13px text-dim">
		* Additional storage beyond 30 GB is billed on usage; prices to be announced.
	</p>

	<section class="max-w-4xl" aria-labelledby="all-plans">
		<h2 id="all-plans" class="marketing-section-heading">All plans include</h2>
		<ul class="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
			{#each INCLUDED as item (item)}
				<li class="flex items-center gap-2">
					<span class="i-ph-check text-green-400 shrink-0" aria-hidden="true"></span>
					{item}
				</li>
			{/each}
		</ul>
	</section>

	<p class="max-w-article text-13px text-dim">
		All prices shown are in USD and exclude value-added tax (VAT), goods and services tax (GST), and
		other applicable taxes. Taxes are calculated based on your billing address and added to your
		invoice where required by law.
	</p>
</main>
