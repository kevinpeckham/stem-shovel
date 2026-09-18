<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { createUserDoc } from "$lib/remote/userDocs.remote";
	import { clearForm } from "$lib/utils/clearForm";

	let { data } = $props();
	let addPanel = $state<HTMLDivElement | null>(null);
</script>

<svelte:head>
	<title>{pageTitle("Docs")}</title>
</svelte:head>

<main class="page-x-padding pt-8 pb-12 min-h-screen">
	<!-- The margin sits on the header, so the New page button (which wraps under the text on a phone) also clears the list. -->
	<header class="mb-6 flex flex-wrap items-baseline justify-between gap-4 max-w-article">
		<div>
			<h1 class="heading-2">Docs</h1>
			<p class="opacity-90 text-balance">
				Learn how to use Stem Shovel, discover new features, and impress your bandmates by knowing
				about all the features.
			</p>
		</div>
		{#if data.canEdit}
			<button class="button button-sm" type="button" popovertarget="add-doc">
				<span class="i-ph-plus" aria-hidden="true"></span>
				New page
			</button>
		{/if}
	</header>

	{#if data.docs.length === 0}
		<p class="text-dim max-w-article">
			Nothing written yet.{#if data.canEdit}
				<button class="ml-1 link-dim" type="button" popovertarget="add-doc"
					>Add the first page.</button
				>
			{/if}
		</p>
	{:else}
		<ul class="grid grid-cols-1 gap-3 max-w-article">
			{#each data.docs as doc (doc.id)}
				<li>
					<a
						class="list-tile flex justify-between items-baseline group !mb-0"
						href="/docs/{doc.slug}"
					>
						<span>{doc.title}</span>
						{#if doc.version === 0}
							<span class="shrink-0 text-sm opacity-90 text-offWhite font-400">empty</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canEdit}
		<div
			id="add-doc"
			popover="auto"
			bind:this={addPanel}
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(createUserDoc);
			}}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">New page</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="add-doc"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...createUserDoc.enhance(async ({ submit }) => {
					await submit();
					// Redirects to the editor on success; only issues keep us here.
					if (!createUserDoc.fields.allIssues()) addPanel?.hidePopover();
				})}
			>
				<label class="block">
					<span class="text-sm text-dim">Title</span>
					<input
						class="mt-1 field"
						{...createUserDoc.fields.title.as("text")}
						placeholder="Getting started"
						autocomplete="off"
						required
					/>
					{#each createUserDoc.fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<p class="mt-2 text-xs text-dim">
					The address comes from the title; both can be changed later.
				</p>
				<div class="mt-4">
					<button class="button-accent disabled:opacity-40" disabled={!!createUserDoc.pending}>
						{createUserDoc.pending ? "Creating…" : "Create page"}
					</button>
				</div>
			</form>
		</div>
	{/if}
</main>
