<script lang="ts">
	import { STAGE_LABEL, STAGE_PHASE } from "#lib/constants/songStages.js";
	import { setSongStage } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { SONG_STAGES, type SongStage } from "#lib/val/SongStageSchema.js";

	/**
	 * The song's stage in its settings (docs/mixes.md, "Phase 2"): read from
	 * what the song holds until a member sets it; Finished files the song
	 * under Finished Songs. The stage decides what the song page opens on
	 * and what the project page plays and says.
	 */
	interface Props {
		id: string;
		/** As set in settings, or null for "from what the song holds". */
		stage: SongStage | null;
		/** The stage in force (utils/songStage.ts). */
		effective: SongStage;
		canChange: boolean;
	}
	let { id, stage, effective, canChange }: Props = $props();
	const form = setSongStage;
	// svelte-ignore state_referenced_locally
	let choice = $state<SongStage | "">(stage ?? "");
</script>

<div>
	<h3 class="text-15px font-700">
		<span class="mr-1 inline-block align-[-2px] i-ph-steps" aria-hidden="true"></span>
		Stage: {STAGE_LABEL[effective]}{#if !stage}{" "}<span class="ml-1 text-12px font-400 opacity-70"
				>(from what the song holds)</span
			>{/if}
	</h3>
	<p class="mt-1 text-sm opacity-90">{STAGE_PHASE[effective]}.</p>
	<p class="mt-1 text-sm opacity-70">
		Left to itself, a song is Writing until a stem makes it Arranging and a mix makes it Mixing. Set
		it by hand when the song is somewhere else, or Finished when it is done.
	</p>
	{#if canChange}
		<form
			class="mt-2 flex flex-wrap items-center gap-2"
			{...form.enhance(async ({ submit }) => {
				await submit();
				if (form.result) {
					const r = form.result as { stage: SongStage | null };
					notify(r.stage ? `Stage: ${STAGE_LABEL[r.stage]}` : "Stage follows the song again");
				}
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<label class="flex items-center gap-2 text-sm">
				<span class="sr-only">Stage</span>
				<select class="field" bind:value={choice} {...form.fields.stage.as("select", stage ?? "")}>
					<option value="">From what the song holds</option>
					{#each SONG_STAGES as s (s)}
						<option value={s}>{STAGE_LABEL[s]}</option>
					{/each}
				</select>
			</label>
			<button class="button button-sm" disabled={!!form.pending || choice === (stage ?? "")}>
				{form.pending ? "Saving…" : "Save"}
			</button>
		</form>
	{/if}
</div>
