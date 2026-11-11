<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { ARRANGEMENT_NAME_MAX, ARRANGEMENT_NOTE_MAX } from "#lib/constants/arrangements.js";
	import { createArrangement } from "#lib/remote/arrangements.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { arrangementHref } from "#lib/utils/arrangementHref.js";
	import { clearForm } from "#lib/utils/clearForm.js";

	/**
	 * The New arrangement popover (`#new-arrangement`, docs/arrangements.md):
	 * a name, a note and where it starts (Main, an alternate, or empty). The
	 * switcher's + opens it on the arrangement shown, its Duplicate on the one
	 * it names; a created arrangement opens at once.
	 */
	interface Props {
		songId: string;
		/** The song's alternates, for "Start from". */
		arrangements: { id: string; name: string }[];
		/** The arrangement shown (null for Main): where a new one starts unless Duplicate says otherwise. */
		current: string | null;
	}
	let { songId, arrangements, current }: Props = $props();

	let popover = $state<HTMLElement | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	/** "Start from": the arrangement shown, until `open` names another. */
	let from = $derived(current ?? "main");
	const fields = createArrangement.fields;

	/** Opens the popover starting from `source` (an alternate's id, "main" or "empty"), else the arrangement shown. */
	export function openNew(source?: string) {
		from = source ?? current ?? "main";
		popover?.showPopover();
	}
</script>

<div
	id="new-arrangement"
	bind:this={popover}
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState === "open") clearForm(createArrangement, formEl);
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">New arrangement</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="new-arrangement"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<form
		bind:this={formEl}
		class="grid gap-3"
		aria-label="New arrangement"
		{...createArrangement.enhance(async ({ submit, element }) => {
			// The form remembers its last values for the page's life (CLAUDE.md): the song is set at submit.
			fields.songId.set(songId);
			if (!(await submit())) return;
			const id = createArrangement.result?.id;
			if (!id) return;
			popover?.hidePopover();
			clearForm(createArrangement, element);
			notify("Arrangement created");
			await goto(arrangementHref(page.url, id), { reset: false });
		})}
	>
		<input {...fields.songId.as("hidden", songId)} />
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-15px"
				{...fields.name.as("text")}
				placeholder="Acoustic, Dawn's ideas"
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
				{...fields.note.as("text")}
				placeholder="What it tries"
				maxlength={ARRANGEMENT_NOTE_MAX}
				autocomplete="off"
			/>
		</label>
		{#each fields.note.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<label class="grid gap-1 text-13px text-dim">
			Start from
			<select class="field text-15px" {...fields.from.as("select", from)}>
				<option value="main" selected={from === "main"}>Main</option>
				{#each arrangements as a (a.id)}
					<option value={a.id} selected={from === a.id}>{a.name}</option>
				{/each}
				<option value="empty" selected={from === "empty"}>Empty</option>
			</select>
		</label>
		{#each fields.from.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<p class="text-13px text-dim">
			A copy shares the stems' files: nothing is uploaded again, and changes stay in the new
			arrangement.
		</p>
		<button
			class="button button-sm button-accent justify-self-start"
			disabled={!!createArrangement.pending}
		>
			<span class="i-ph-plus" aria-hidden="true"></span>
			{createArrangement.pending ? "Creating…" : "Create"}
		</button>
	</form>
</div>
