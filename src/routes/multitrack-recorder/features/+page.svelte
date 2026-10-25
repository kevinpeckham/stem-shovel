<script lang="ts">
	import {
		DAWN_FEATURE_COLUMNS,
		DAWN_FEATURE_GROUPS,
		type DawnFeature,
		type DawnFeatureSupport,
	} from "#lib/constants/dawnFeatures.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * Dawn's features as a grid beside the DAWproject spec and other DAWs
	 * (constants/dawnFeatures.ts): one table with a header row per group,
	 * a read-only mark per cell. The columns come from the data, so a DAW
	 * added there appears here. Public and static.
	 */
	const MARKS: Record<DawnFeatureSupport, { icon: string; tone: string; legend: string }> = {
		yes: { icon: "i-ph-check-circle", tone: "text-accent", legend: "Has it" },
		partial: {
			icon: "i-ph-minus-circle",
			tone: "text-white opacity-70",
			legend: "In part (see the note)",
		},
		no: { icon: "i-ph-x-circle", tone: "text-white opacity-30", legend: "Does not" },
		unknown: { icon: "i-ph-question", tone: "text-white opacity-50", legend: "Not known" },
	};
	const LEGEND: DawnFeatureSupport[] = ["yes", "partial", "no", "unknown"];
	const featureCount = DAWN_FEATURE_GROUPS.reduce((n, g) => n + g.features.length, 0);
</script>

<svelte:head>
	<title>{pageTitle("Dawn features")}</title>
	<meta
		name="description"
		content="Every feature of Dawn, Stem Shovel's multitrack recorder in the browser, beside what the DAWproject format carries and what Reaper and Sandyne do."
	/>
</svelte:head>

{#snippet cell(feature: DawnFeature, column: (typeof DAWN_FEATURE_COLUMNS)[number])}
	{@const value = feature.support[column.key]}
	{@const cellNote = feature.cellNotes?.[column.key]}
	{@const label = `${column.label}: ${value}${cellNote ? ` (${cellNote})` : ""}`}
	<td class="px-3 py-2 text-center align-top">
		<span
			class="{MARKS[value].icon} {MARKS[value].tone} text-20px inline-block"
			role="img"
			aria-label={label}
			title={label}
		></span>
		{#if cellNote}
			<span class="block text-11px text-dim leading-snug mt-0.5">{cellNote}</span>
		{/if}
	</td>
{/snippet}

<main class="page">
	<header class="max-w-article mb-2">
		<h1 class="app-page-heading mb-3">Dawn features</h1>
		<p class="opacity-90 text-balance">
			Everything <a class="link-dim" href="/multitrack-recorder">Dawn</a>, the multitrack recorder,
			can do, {featureCount} features in all, beside what the DAWproject file format can carry and what
			Reaper and Sandyne do. For DAWproject the question is whether the file holds it, so recording aids,
			editing gestures and working together are marked no by nature. More DAWs will join the columns.
		</p>
		<ul class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legend">
			{#each LEGEND as value (value)}
				<li class="flex items-center gap-1.5">
					<span class="{MARKS[value].icon} {MARKS[value].tone} text-18px" aria-hidden="true"></span>
					<span class="opacity-90">{MARKS[value].legend}</span>
				</li>
			{/each}
		</ul>
	</header>

	<div class="overflow-x-auto max-w-5xl border border-white/10 rounded-md">
		<table class="w-full min-w-640px text-sm border-collapse">
			<caption class="sr-only">Dawn's features compared</caption>
			<thead>
				<tr class="border-b border-white/15">
					<th scope="col" class="sticky left-0 z-1 bg-dark text-left font-600 px-3 py-2 text-white">
						Feature
					</th>
					{#each DAWN_FEATURE_COLUMNS as column (column.key)}
						<th scope="col" class="px-3 py-2 font-600 text-white text-center w-36"
							>{column.label}</th
						>
					{/each}
				</tr>
			</thead>
			{#each DAWN_FEATURE_GROUPS as group (group.title)}
				<tbody>
					<tr>
						<th
							scope="colgroup"
							colspan={DAWN_FEATURE_COLUMNS.length + 1}
							class="text-left px-3 pt-5 pb-2 border-b border-white/10"
						>
							<span class="sticky left-3 marketing-section-heading mb-0">{group.title}</span>
						</th>
					</tr>
					{#each group.features as feature (feature.name)}
						<tr class="border-b border-white/5 hover:bg-white/3">
							<th
								scope="row"
								class="sticky left-0 z-1 bg-dark text-left font-400 px-3 py-2 align-top min-w-48 max-w-72"
							>
								<span class="text-white">{feature.name}</span>
								{#if feature.note}
									<span class="block text-12px text-dim leading-snug mt-0.5">{feature.note}</span>
								{/if}
							</th>
							{#each DAWN_FEATURE_COLUMNS as column (column.key)}
								{@render cell(feature, column)}
							{/each}
						</tr>
					{/each}
				</tbody>
			{/each}
		</table>
	</div>

	<p class="max-w-article text-13px text-dim">
		Dawn's column follows its own design notes; the DAWproject column follows the format's schema;
		Reaper's and Sandyne's follow their manuals and what we could check. Spot a mistake? Tell us
		through <a class="link-dim" href="/feature-requests">feature requests</a>.
	</p>
</main>
