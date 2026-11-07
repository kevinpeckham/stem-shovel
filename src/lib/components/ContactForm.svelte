<script lang="ts">
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import { updateContact } from "#lib/remote/contacts.remote.js";
	import type { ContactRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/** A contact's name, role, phone, email, address and notes (its page), read-only unless `canEdit`. */
	let { contact: c, canEdit }: { contact: ContactRow; canEdit: boolean } = $props();

	const edit = $derived(updateContact.for(c.id));
</script>

<form
	class="grid gap-3"
	{...edit.enhance(async ({ submit }) => {
		try {
			await submit();
			if (edit.result?.ok) notify("Contact saved");
		} catch (err) {
			notify(`Could not save the contact: ${errorMessage(err)}`, { kind: "error" });
		}
	})}
>
	<input {...edit.fields.id.as("hidden", c.id)} />
	<fieldset class="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={!canEdit}>
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-14px"
				{...edit.fields.name.as("text", c.name)}
				placeholder="Sam Rivera"
				maxlength="160"
				required
			/>
		</label>
		<FieldIssues issues={edit.fields.name.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Role
			<input
				class="field text-14px"
				{...edit.fields.role.as("text", c.role)}
				placeholder="Promoter"
				maxlength="80"
			/>
		</label>
		<FieldIssues issues={edit.fields.role.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Phone
			<input
				class="field text-14px"
				{...edit.fields.phone.as("tel", c.phone)}
				placeholder="555 0100"
				maxlength="60"
			/>
		</label>
		<FieldIssues issues={edit.fields.phone.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Email
			<input
				class="field text-14px"
				{...edit.fields.email.as("email", c.email)}
				placeholder="sam@example.com"
				maxlength="200"
			/>
		</label>
		<FieldIssues issues={edit.fields.email.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Address
			<input
				class="field text-14px"
				{...edit.fields.address.as("text", c.address)}
				placeholder="12 Elm St, Springfield"
				maxlength="300"
			/>
		</label>
		<FieldIssues issues={edit.fields.address.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Notes
			<textarea
				class="field min-h-24 text-14px"
				placeholder="Books the Tuesday nights; pays by check"
				maxlength="2000"
				{...edit.fields.notes.as("text", c.notes)}></textarea>
		</label>
		<FieldIssues issues={edit.fields.notes.issues()} />
	</fieldset>
	{#if canEdit}
		<button class="button button-sm button-accent justify-self-start" disabled={!!edit.pending}
			>Save</button
		>
	{/if}
</form>
