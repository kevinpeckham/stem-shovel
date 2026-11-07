<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import { updateMemberProfile } from "#lib/remote/memberProfiles.remote.js";
	import type { MemberProfileRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * A member's phone, instruments and notes in the account
	 * (`updateMemberProfile`), in place of their MemberCard row. Save writes
	 * and reloads the page's data; Cancel forgets what was typed (the remote
	 * form keeps it for the life of the page) and goes back to the row.
	 */
	let {
		member: m,
		accountId,
		onclose,
	}: { member: MemberProfileRow; accountId: string; onclose: () => void } = $props();

	const edit = $derived(updateMemberProfile.for(m.userId));
	let formEl = $state<HTMLFormElement | null>(null);

	function cancel() {
		clearForm(edit, formEl);
		onclose();
	}
</script>

<form
	bind:this={formEl}
	class="grid gap-3"
	aria-label="{m.name}'s profile"
	{...edit.enhance(async ({ submit }) => {
		try {
			await submit();
			if (edit.result?.ok) {
				notify("Profile saved");
				await invalidateAll();
				clearForm(edit, formEl);
				onclose();
			}
		} catch (err) {
			notify(`Could not save the profile: ${errorMessage(err)}`, { kind: "error" });
		}
	})}
>
	<input {...edit.fields.accountId.as("hidden", accountId)} />
	<input {...edit.fields.userId.as("hidden", m.userId)} />
	<label class="grid gap-1 text-13px text-dim">
		Phone
		<input
			class="field text-14px"
			{...edit.fields.phone.as("tel", m.phone)}
			placeholder="555 0100"
			maxlength="60"
		/>
	</label>
	<FieldIssues issues={edit.fields.phone.issues()} />
	<label class="grid gap-1 text-13px text-dim">
		Instruments
		<input
			class="field text-14px"
			{...edit.fields.instruments.as("text", m.instruments)}
			placeholder="guitar, vocals"
			maxlength="200"
		/>
	</label>
	<FieldIssues issues={edit.fields.instruments.issues()} />
	<label class="grid gap-1 text-13px text-dim">
		Notes
		<textarea
			class="field min-h-20 text-14px"
			placeholder="Best reached after six; drives the van"
			maxlength="2000"
			{...edit.fields.notes.as("text", m.notes)}></textarea>
	</label>
	<FieldIssues issues={edit.fields.notes.issues()} />
	<div class="flex flex-wrap gap-2">
		<button class="button button-sm button-accent" disabled={!!edit.pending}>Save</button>
		<button class="button button-sm" type="button" onclick={cancel}>Cancel</button>
	</div>
</form>
