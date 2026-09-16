<script lang="ts">
	import { setSongFinished } from "$lib/remote/songs.remote";
	import { notify } from "$lib/state/notifications.svelte";

	/** Any member marks a song finished, which files it under "Finished Songs" on the project page, or back in progress. */
	interface Props {
		id: string;
		finished: boolean;
		canChange: boolean;
	}
	let { id, finished, canChange }: Props = $props();
	const form = setSongFinished;
</script>

<div>
	<h3 class="text-15px font-700">
		<span
			class="mr-1 inline-block align-[-2px] {finished ? 'i-ph-check-circle' : 'i-ph-circle-dashed'}"
			aria-hidden="true"
		></span>
		{finished ? "Finished" : "In progress"}
	</h3>
	<p class="mt-1 text-sm opacity-90">
		{#if finished}
			This song is done: it is listed under Finished Songs on the project page. Everything stays
			editable; mark it in progress again to move it back.
		{:else}
			A song with stems is listed under Songs in Progress, one without under Song Ideas. Mark it
			finished when it is done to file it under Finished Songs.
		{/if}
	</p>
	{#if canChange}
		<form
			class="mt-2"
			{...form.enhance(async ({ submit }) => {
				await submit();
				if (form.result) notify(form.result.finished ? "Marked as finished" : "Back in progress");
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<input {...form.fields.finished.as("hidden", finished ? "false" : "true")} />
			<button class="button button-sm" disabled={!!form.pending}>
				{form.pending ? "Saving…" : finished ? "Back to in progress" : "Mark as finished"}
			</button>
		</form>
	{/if}
</div>
