<script lang="ts">
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import { updatePracticeLocation } from "#lib/remote/practiceLocations.remote.js";
	import type { PracticeLocationRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/** A practice location's name, address and notes (its page), read-only unless `canEdit`. */
	let { location: l, canEdit }: { location: PracticeLocationRow; canEdit: boolean } = $props();

	const edit = $derived(updatePracticeLocation.for(l.id));
</script>

<form
	class="grid gap-3"
	{...edit.enhance(async ({ submit }) => {
		try {
			await submit();
			if (edit.result?.ok) notify("Location saved");
		} catch (err) {
			notify(`Could not save the location: ${errorMessage(err)}`, { kind: "error" });
		}
	})}
>
	<input {...edit.fields.id.as("hidden", l.id)} />
	<fieldset class="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={!canEdit}>
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-14px"
				{...edit.fields.name.as("text", l.name)}
				placeholder="The garage"
				maxlength="160"
				required
			/>
		</label>
		<FieldIssues issues={edit.fields.name.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Address
			<input
				class="field text-14px"
				{...edit.fields.address.as("text", l.address)}
				placeholder="12 Elm St, Springfield"
				maxlength="300"
			/>
		</label>
		<FieldIssues issues={edit.fields.address.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Notes
			<textarea
				class="field min-h-24 text-14px"
				placeholder="The side door code, who brings the PA"
				maxlength="2000"
				{...edit.fields.notes.as("text", l.notes)}></textarea>
		</label>
		<FieldIssues issues={edit.fields.notes.issues()} />
	</fieldset>
	{#if canEdit}
		<button class="button button-sm button-accent justify-self-start" disabled={!!edit.pending}
			>Save</button
		>
	{/if}
</form>
