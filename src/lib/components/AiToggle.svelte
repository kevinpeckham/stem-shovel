<script lang="ts">
	import { setProjectAi, setSongAi } from "$lib/remote/ai.remote";
	import { notify } from "$lib/state/notifications.svelte";

	/** Any member switches AI off for a project or a song, or back on. */
	interface Props {
		kind: "project" | "song";
		id: string;
		noAi: boolean;
		/** A song inside a no-AI project is covered by the project. */
		inherited?: boolean;
		canChange: boolean;
	}
	let { kind, id, noAi, inherited = false, canChange }: Props = $props();
	let form = $derived(kind === "project" ? setProjectAi : setSongAi);
</script>

<div>
	<h3 class="text-15px font-700">
		<span
			class="mr-1 inline-block align-[-2px] {noAi || inherited ? 'i-ph-prohibit' : 'i-ph-sparkle'}"
			aria-hidden="true"
		></span>
		{noAi || inherited ? "No AI" : "AI allowed"}
	</h3>
	<p class="mt-1 text-sm opacity-90">
		{#if inherited}
			The project is marked "no AI", so this song is too: nothing here is sent to a model or
			transcribed. Change it on the project.
		{:else if noAi}
			Nothing from this {kind} is sent to a model or transcribed; the AI buttons are hidden. For artists
			whose contracts rule it out.
		{:else}
			Members may use the AI features on this {kind}{kind === "project" ? " and its songs" : ""}:
			tempo and key checks, chord transcription, chart drafts. Switch it off for artists whose
			contracts rule AI out.
		{/if}
	</p>
	{#if canChange && !inherited}
		<form
			class="mt-2"
			{...form.enhance(async ({ submit }) => {
				await submit();
				if (form.result)
					notify(
						form.result.noAi ? `AI switched off for this ${kind}` : `AI allowed on this ${kind}`,
					);
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<input {...form.fields.noAi.as("hidden", noAi ? "false" : "true")} />
			<button class="button button-sm" disabled={!!form.pending}>
				{form.pending ? "Saving…" : noAi ? "Allow AI" : "Do not use AI"}
			</button>
		</form>
	{/if}
</div>
