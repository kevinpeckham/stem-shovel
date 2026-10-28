<script lang="ts">
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import { updateVenueNotes } from "#lib/remote/venues.remote.js";
	import type { VenueRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * The account's own contact and notes for a venue (the venue page's Your
	 * notes and contact), read-only unless `canEdit`.
	 */
	let {
		venue: v,
		accountId,
		canEdit,
	}: { venue: VenueRow; accountId: string; canEdit: boolean } = $props();

	const notesForm = $derived(updateVenueNotes.for(v.id));
</script>

<form
	class="grid gap-3"
	{...notesForm.enhance(async ({ submit }) => {
		try {
			await submit();
			if (notesForm.result?.ok) notify("Notes saved");
		} catch (err) {
			notify(`Could not save the notes: ${errorMessage(err)}`, { kind: "error" });
		}
	})}
>
	<input {...notesForm.fields.accountId.as("hidden", accountId)} />
	<input {...notesForm.fields.venueId.as("hidden", v.id)} />
	<fieldset class="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={!canEdit}>
		<input
			class="field text-14px"
			aria-label="Contact"
			{...notesForm.fields.contact.as("text", v.contact)}
			placeholder="Who you deal with: a name, phone or email"
			maxlength="500"
		/>
		<FieldIssues issues={notesForm.fields.contact.issues()} />
		<textarea
			class="field min-h-24 text-14px"
			aria-label="Your notes"
			placeholder="Parking, the back door, the house engineer's name"
			maxlength="2000"
			{...notesForm.fields.notes.as("text", v.notes)}></textarea>
		<FieldIssues issues={notesForm.fields.notes.issues()} />
	</fieldset>
	{#if canEdit}
		<button class="button button-sm button-accent justify-self-start" disabled={!!notesForm.pending}
			>Save</button
		>
	{/if}
</form>
