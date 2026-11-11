<script lang="ts">
	import { ARRANGEMENT_NAME_MAX, ARRANGEMENT_NOTE_MAX } from "#lib/constants/arrangements.js";
	import { updateArrangement } from "#lib/remote/arrangements.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";

	/** The Rename popover (`#rename-arrangement`, docs/arrangements.md): an alternate's name and note. */
	interface Props {
		arrangement: { id: string; name: string; note: string };
	}
	let { arrangement }: Props = $props();

	let popover = $state<HTMLElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	const fields = updateArrangement.fields;
	// The inputs carry defaultValue too: clearForm's native reset on open goes back to the saved name and note, not to blank.

	export function openRename() {
		popover?.showPopover();
	}
</script>

<div
	id="rename-arrangement"
	bind:this={popover}
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState === "open") clearForm(updateArrangement, formEl);
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Rename arrangement</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="rename-arrangement"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<form
		bind:this={formEl}
		class="grid gap-3"
		aria-label="Rename arrangement"
		{...updateArrangement.enhance(async ({ submit, element }) => {
			// The form remembers its last values for the page's life (CLAUDE.md): the arrangement is set at submit.
			fields.id.set(arrangement.id);
			if (!(await submit())) return;
			popover?.hidePopover();
			clearForm(updateArrangement, element);
			notify("Arrangement saved");
		})}
	>
		<input {...fields.id.as("hidden", arrangement.id)} />
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-15px"
				{...fields.name.as("text", arrangement.name)}
				defaultValue={arrangement.name}
				maxlength={ARRANGEMENT_NAME_MAX}
				autocomplete="off"
				required
			/>
		</label>
		{#each fields.name.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<label class="grid gap-1 text-13px text-dim">
			Note (optional)
			<input
				class="field text-15px"
				{...fields.note.as("text", arrangement.note)}
				defaultValue={arrangement.note}
				placeholder="What it tries"
				maxlength={ARRANGEMENT_NOTE_MAX}
				autocomplete="off"
			/>
		</label>
		{#each fields.note.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<button
			class="button button-sm button-accent justify-self-start"
			disabled={!!updateArrangement.pending}
		>
			{updateArrangement.pending ? "Saving…" : "Save"}
		</button>
	</form>
</div>
