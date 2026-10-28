<script lang="ts">
	import { plural } from "#lib/utils/plural.js";

	/**
	 * Under an event's set lists, for an editor: the picker that attaches one
	 * of the account's set lists as the next set, or a pointer to Set lists
	 * when the account has none.
	 */
	interface Props {
		accountSlug: string;
		choices: { id: string; title: string; itemCount: number }[];
		adding: boolean;
		picked: string;
		onchoose: (setListId: string) => void;
	}
	let { accountSlug, choices, adding, picked = $bindable(), onchoose }: Props = $props();

	const choiceLabel = (c: Props["choices"][number]) =>
		`${c.title || "Untitled"} · ${plural(c.itemCount, "row")}`;
</script>

{#if choices.length === 0}
	<p class="text-14px text-dim">
		No set lists yet: the account has none to attach. <a
			class="link"
			href="/{accountSlug}/set-lists">Make one on Set lists</a
		>.
	</p>
{:else}
	<label class="grid min-w-0 gap-1 text-13px text-dim sm:max-w-sm">
		Attach a set list
		<select
			class="field text-14px"
			bind:value={picked}
			disabled={adding}
			onchange={(e) => onchoose(e.currentTarget.value)}
		>
			<option value="" disabled>Choose a set list to attach…</option>
			{#each choices as c (c.id)}
				<option value={c.id}>{choiceLabel(c)}</option>
			{/each}
		</select>
	</label>
{/if}
