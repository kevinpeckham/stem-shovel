<script lang="ts">
	import { createContact } from "#lib/remote/contacts.remote.js";
	import type { ContactRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * The New contact popover: a contact's name, role, phone, email, address
	 * and notes, local to the account (`createContact`); `onadded` gets the
	 * new row. No `<form>`, so it can sit inside another form: Enter in a
	 * one-line field creates instead of submitting the outer form, and the
	 * fields carry no `name`, so the outer form never posts them.
	 */
	let {
		id,
		accountId,
		onadded,
	}: { id: string; accountId: string; onadded: (row: ContactRow) => void } = $props();

	let name = $state("");
	let role = $state("");
	let phone = $state("");
	let email = $state("");
	let address = $state("");
	let notes = $state("");
	let nameError = $state("");
	let busy = $state(false);

	/** Enter in a one-line field: Create, never the outer form's submit. */
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		void create();
	}

	async function create() {
		if (busy) return;
		if (!name.trim()) {
			nameError = "Give the contact a name.";
			return;
		}
		busy = true;
		nameError = "";
		try {
			const row = await createContact({
				accountId,
				name: name.trim(),
				role: role.trim(),
				phone: phone.trim(),
				email: email.trim(),
				address: address.trim(),
				notes: notes.trim(),
			});
			onadded(row);
			notify("Contact added");
			document.getElementById(id)?.hidePopover();
		} catch (err) {
			notify(`Could not add the contact: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
</script>

<div
	{id}
	popover="auto"
	role="dialog"
	aria-labelledby="{id}-heading"
	onbeforetoggle={(e) => {
		if (e.newState === "open") name = role = phone = email = address = notes = nameError = "";
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-left text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<h2 class="heading-2 mb-2" id="{id}-heading">New contact</h2>
	<p class="mb-4 text-13px text-dim">A promoter, agent or engineer; only your account sees it.</p>
	<div class="grid gap-3">
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-14px"
				type="text"
				aria-label="Name"
				bind:value={name}
				{onkeydown}
				placeholder="Sam Rivera"
				maxlength="160"
				required
			/>
		</label>
		{#if nameError}<p class="text-sm text-red-400">{nameError}</p>{/if}
		<label class="grid gap-1 text-13px text-dim">
			Role
			<input
				class="field text-14px"
				type="text"
				bind:value={role}
				{onkeydown}
				placeholder="Promoter"
				maxlength="80"
			/>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Phone
			<input
				class="field text-14px"
				type="tel"
				bind:value={phone}
				{onkeydown}
				placeholder="555 0100"
				maxlength="60"
			/>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Email
			<input
				class="field text-14px"
				type="email"
				bind:value={email}
				{onkeydown}
				placeholder="sam@example.com"
				maxlength="200"
			/>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Address
			<input
				class="field text-14px"
				type="text"
				bind:value={address}
				{onkeydown}
				placeholder="12 Elm St, Springfield"
				maxlength="300"
			/>
		</label>
		<label class="grid gap-1 text-13px text-dim">
			Notes
			<textarea
				class="field min-h-20 text-14px"
				bind:value={notes}
				placeholder="Books the Tuesday nights; pays by check"
				maxlength="2000"></textarea>
		</label>
		<div class="flex flex-wrap gap-2">
			<button class="button button-sm button-accent" type="button" disabled={busy} onclick={create}>
				<span class="i-ph-plus" aria-hidden="true"></span> Create
			</button>
			<button class="button button-sm" type="button" popovertarget={id} popovertargetaction="hide">
				Cancel
			</button>
		</div>
	</div>
</div>
