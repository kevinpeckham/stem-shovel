<script lang="ts">
	import { DEMO_NOTES_MAX } from "#lib/constants/demoFormats.js";
	import { setDemoNotes } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { tick } from "svelte";

	/**
	 * The one popover that changes a demo's notes after upload: the Demos
	 * view's row menu (Edit notes…) and the demo's own page open it with
	 * `open(demo)`. Plain text, prefilled with the saved notes; an empty
	 * field clears them. The form's success refreshes the page's data, so
	 * the Notes block and the tile's icon follow.
	 */
	interface NotesDemo {
		id: string;
		label: string;
		notes: string;
	}

	let popover = $state<HTMLElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	let target = $state<NotesDemo>({ id: "", label: "", notes: "" });
	const fields = setDemoNotes.fields;

	/** Open on a demo, showing its saved notes (the DOM takes them before the popover's reset). */
	export async function open(demo: NotesDemo) {
		target = { ...demo };
		await tick();
		popover?.showPopover();
		formEl?.querySelector("textarea")?.focus();
	}
	function close() {
		popover?.hidePopover();
	}
</script>

<div
	id="demo-notes-editor"
	bind:this={popover}
	popover="auto"
	role="dialog"
	aria-labelledby="demo-notes-editor-title"
	onbeforetoggle={(e) => {
		if (e.newState === "open") clearForm(setDemoNotes, formEl);
	}}
	class="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<h2 id="demo-notes-editor-title" class="heading-2 mb-4 truncate">Notes on {target.label}</h2>
	<form
		bind:this={formEl}
		class="grid gap-3"
		aria-label="Demo notes"
		{...setDemoNotes.enhance(async ({ submit, element }) => {
			// The form remembers its last values for the page's life (CLAUDE.md): the demo is set at submit.
			fields.id.set(target.id);
			if (!(await submit())) return;
			close();
			clearForm(setDemoNotes, element);
			notify("Notes saved");
		})}
	>
		<input {...fields.id.as("hidden", target.id)} />
		<label class="grid gap-1 text-13px text-dim">
			Notes
			<textarea
				class="field text-sm"
				rows="4"
				maxlength={DEMO_NOTES_MAX}
				placeholder="What this take is, what to listen for"
				{...fields.notes.as("text", target.notes)}
				defaultValue={target.notes}></textarea>
		</label>
		{#each fields.notes.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<div class="flex flex-wrap gap-2">
			<button class="button button-sm button-accent" disabled={!!setDemoNotes.pending}>
				{setDemoNotes.pending ? "Saving…" : "Save"}
			</button>
			<button class="button button-sm" type="button" onclick={close}>Cancel</button>
		</div>
	</form>
</div>
