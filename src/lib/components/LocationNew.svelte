<script lang="ts">
	import { createPracticeLocation } from "#lib/remote/practiceLocations.remote.js";
	import type { PracticeLocationRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * The New location popover: a practice location's name, address and
	 * notes, local to the account (`createPracticeLocation`); `onadded` gets
	 * the new row. No `<form>`, so it can sit inside another form (the event
	 * page's, the New practice popover's): Enter in a one-line field creates
	 * instead of submitting the outer form, and the fields carry no `name`,
	 * so the outer form never posts them.
	 */
	let {
		id,
		accountId,
		onadded,
	}: { id: string; accountId: string; onadded: (row: PracticeLocationRow) => void } = $props();

	let name = $state("");
	let address = $state("");
	let notes = $state("");
	let nameError = $state("");
	let busy = $state(false);

	async function create() {
		if (busy) return;
		if (!name.trim()) {
			nameError = "Give the location a name.";
			return;
		}
		busy = true;
		nameError = "";
		try {
			const row = await createPracticeLocation({
				accountId,
				name: name.trim(),
				address: address.trim(),
				notes: notes.trim(),
			});
			onadded(row);
			notify("Location added");
			document.getElementById(id)?.hidePopover();
		} catch (err) {
			notify(`Could not add the location: ${errorMessage(err)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}

	/** Enter in a one-line field: Create, never the outer form's submit. */
	function onkeydown(e: KeyboardEvent) {
		if (e.key !== "Enter") return;
		e.preventDefault();
		void create();
	}
</script>

<div
	{id}
	popover="auto"
	role="dialog"
	aria-labelledby="{id}-heading"
	onbeforetoggle={(e) => {
		if (e.newState === "open") name = address = notes = nameError = "";
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-left text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<h2 class="heading-2 mb-2" id="{id}-heading">New location</h2>
	<p class="mb-4 text-13px text-dim">Where the band rehearses; only your account sees it.</p>
	<div class="grid gap-3">
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-14px"
				type="text"
				aria-label="Name"
				bind:value={name}
				{onkeydown}
				placeholder="The garage"
				maxlength="160"
				required
			/>
		</label>
		{#if nameError}<p class="text-sm text-red-400">{nameError}</p>{/if}
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
				placeholder="The side door code, who brings the PA"
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
