<script lang="ts">
	import { CHORD_RECIPES, type ChordRecipeId } from "$lib/constants/chordStyles";
	import type { ChordStyleData } from "$lib/val/ChordStyleSchema";

	/**
	 * The custom style editor (docs/chord-player.md, "Styles"): a row per
	 * degree in scale order, with what a major wedge and a minor wedge on
	 * that degree carry and what the 7 pad raises each to. Saves by name.
	 */
	interface Props {
		name: string;
		data: ChordStyleData;
		saving?: boolean;
		onsave: (name: string, data: ChordStyleData) => void;
		oncancel: () => void;
	}
	let { name: initialName, data: initial, saving = false, onsave, oncancel }: Props = $props();
	// svelte-ignore state_referenced_locally
	let name = $state(initialName);
	// svelte-ignore state_referenced_locally
	let data = $state<ChordStyleData>(structuredClone($state.snapshot(initial)));

	/** The degrees in scale order with their distance from the key in fifths. */
	const DEGREES: { label: string; minor: string; fifths: number }[] = [
		{ label: "I", minor: "i", fifths: 0 },
		{ label: "♭II", minor: "♭ii", fifths: 7 },
		{ label: "II", minor: "ii", fifths: 2 },
		{ label: "♭III", minor: "♭iii", fifths: 9 },
		{ label: "III", minor: "iii", fifths: 4 },
		{ label: "IV", minor: "iv", fifths: 11 },
		{ label: "♯IV", minor: "♯iv", fifths: 6 },
		{ label: "V", minor: "v", fifths: 1 },
		{ label: "♭VI", minor: "♭vi", fifths: 8 },
		{ label: "VI", minor: "vi", fifths: 3 },
		{ label: "♭VII", minor: "♭vii", fifths: 10 },
		{ label: "VII", minor: "vii", fifths: 5 },
	];
	const MAJOR_RECIPES: ChordRecipeId[] = [
		"major",
		"dom7",
		"maj7",
		"dom9",
		"maj9",
		"dom13",
		"maj13",
	];
	const MINOR_RECIPES: ChordRecipeId[] = [
		"minor",
		"min7",
		"halfDim",
		"min9",
		"min11",
		"min13",
		"dim",
	];
	const recipeLabel = (id: ChordRecipeId, ring: "major" | "minor") => {
		const suffix = CHORD_RECIPES[id].suffix;
		if (id === "major" || id === "minor") return "triad";
		if (id === "dim") return "dim";
		return ring === "minor" ? `m${suffix}` : suffix;
	};
</script>

<div class="grid gap-3 text-13px">
	<label class="block">
		<span class="device-button-label block mb-1 text-blue-100/90">Style name</span>
		<input class="device-field w-full" type="text" maxlength="60" bind:value={name} />
	</label>
	<div class="overflow-x-auto">
		<table
			class="w-full text-12px tabular-nums [&_select]-(device-field py-0.5 px-1 text-12px w-full)"
		>
			<thead class="text-blue-100/70 text-11px uppercase tracking-wider">
				<tr>
					<th class="text-left pb-1 pr-2">Degree</th>
					<th class="text-left pb-1 pr-2">Major</th>
					<th class="text-left pb-1 pr-2">+ 7 pad</th>
					<th class="text-left pb-1 pr-2">Minor</th>
					<th class="text-left pb-1">+ 7 pad</th>
				</tr>
			</thead>
			<tbody>
				{#each DEGREES as d (d.fifths)}
					<tr>
						<td class="pr-2 py-0.5 whitespace-nowrap"
							><span class="font-serif">{d.label}</span> ·
							<span class="font-serif">{d.minor}</span></td
						>
						<td class="pr-2 py-0.5">
							<select aria-label="{d.label} major" bind:value={data.major[d.fifths].plain}>
								{#each MAJOR_RECIPES as r (r)}<option value={r}>{recipeLabel(r, "major")}</option
									>{/each}
							</select>
						</td>
						<td class="pr-2 py-0.5">
							<select
								aria-label="{d.label} major with the 7 pad"
								bind:value={data.major[d.fifths].held}
							>
								{#each MAJOR_RECIPES as r (r)}<option value={r}>{recipeLabel(r, "major")}</option
									>{/each}
							</select>
						</td>
						<td class="pr-2 py-0.5">
							<select aria-label="{d.minor} minor" bind:value={data.minor[d.fifths].plain}>
								{#each MINOR_RECIPES as r (r)}<option value={r}>{recipeLabel(r, "minor")}</option
									>{/each}
							</select>
						</td>
						<td class="py-0.5">
							<select
								aria-label="{d.minor} minor with the 7 pad"
								bind:value={data.minor[d.fifths].held}
							>
								{#each MINOR_RECIPES as r (r)}<option value={r}>{recipeLabel(r, "minor")}</option
									>{/each}
							</select>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
	<div class="flex flex-wrap gap-2">
		<button
			class="device-button-sm px-3"
			type="button"
			disabled={saving || !name.trim()}
			onclick={() => onsave(name.trim(), $state.snapshot(data))}>Save style</button
		>
		<button class="device-button-sm px-3" type="button" disabled={saving} onclick={oncancel}
			>Cancel</button
		>
	</div>
</div>
