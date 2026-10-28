<script lang="ts">
	import { createSetList } from "#lib/remote/setLists.remote.js";
	import { clearForm } from "#lib/utils/clearForm.js";

	/** The New set list popover (`#new-set-list`): a title, then the editor of the new list (the form redirects there). */
	let { accountId }: { accountId: string } = $props();
</script>

<div
	id="new-set-list"
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState === "open") clearForm(createSetList);
	}}
	class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">New set list</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="new-set-list"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<form class="grid gap-3" {...createSetList}>
		<input {...createSetList.fields.accountId.as("hidden", accountId)} />
		<label class="grid gap-1 text-13px text-dim">
			Title
			<input
				class="field text-15px"
				{...createSetList.fields.title.as("text")}
				placeholder="Spring tour, Tuesday rehearsal"
				maxlength="120"
				required
			/>
		</label>
		{#each createSetList.fields.title.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<button
			class="button button-sm button-accent justify-self-start"
			disabled={!!createSetList.pending}
		>
			<span class="i-ph-plus" aria-hidden="true"></span> Create
		</button>
	</form>
</div>
