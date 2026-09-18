<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { deleteUserDoc, updateUserDoc } from "$lib/remote/userDocs.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	let settingsPanel = $state<HTMLDivElement | null>(null);
	const fields = updateUserDoc.fields;
</script>

<svelte:head>
	<title>{pageTitle(`${data.doc.title} · Docs`)}</title>
</svelte:head>

<main class="page-x-padding pt-6 mb-8 grid gap-8 lg:grid-cols-[220px_1fr]">
	<nav aria-label="Docs" class="text-15px">
		<a class="block mb-3 text-sm link-dim" href="/docs">← Docs</a>
		<ul class="grid gap-1">
			{#each data.docs as d (d.id)}
				<li>
					<a
						class="block rounded px-2 py-1 hover:bg-white/10 hover:text-maximumYellow {d.slug ===
						data.doc.slug
							? 'bg-white/10 text-maximumYellow'
							: 'opacity-80'}"
						href="/docs/{d.slug}"
						aria-current={d.slug === data.doc.slug ? "page" : undefined}>{d.title}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	<article class="min-w-0 max-w-article">
		<header class="mb-4 flex flex-wrap items-baseline justify-between gap-4">
			<h1 class="display">{data.doc.title}</h1>
			{#if data.canEdit}
				<div class="flex items-center gap-2">
					<a class="button button-sm" href="/docs/{data.doc.slug}/edit">
						<span class="i-ph-pencil-simple" aria-hidden="true"></span>
						Edit
					</a>
					<button
						class="button button-sm"
						type="button"
						popovertarget="doc-settings"
						title="Page settings"
						aria-label="Page settings"
					>
						<span class="i-ph-gear" aria-hidden="true"></span>
					</button>
				</div>
			{/if}
		</header>
		{#if data.html}
			<div class="chart-body surface px-6 pt-6 pb-8">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html data.html}
			</div>
		{:else}
			<p class="text-dim">
				Nothing here yet.{#if data.canEdit}
					<a class="ml-1 link-dim" href="/docs/{data.doc.slug}/edit">Write it.</a>
				{/if}
			</p>
		{/if}
		{#if data.doc.version > 0}
			<p class="mt-3 text-xs text-dim">
				Updated {formatDate(data.doc.updatedAt)}{data.doc.editor ? ` by ${data.doc.editor}` : ""} · v{data
					.doc.version}
			</p>
		{/if}
	</article>

	{#if data.canEdit}
		<div
			id="doc-settings"
			popover="auto"
			bind:this={settingsPanel}
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(updateUserDoc);
			}}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Page settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="doc-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateUserDoc.enhance(async ({ submit }) => {
					await submit();
					if (!fields.allIssues()) {
						notify("Page settings saved");
						settingsPanel?.hidePopover();
					}
				})}
			>
				<input {...fields.id.as("hidden", data.doc.id)} />
				<div class="grid gap-4">
					<label class="block">
						<span class="text-sm text-dim">Title</span>
						<input class="mt-1 field" {...fields.title.as("text", data.doc.title)} required />
						{#each fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">Address</span>
						<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
							<span class="pl-3 text-sm text-dim">/docs/</span>
							<input
								class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
								{...fields.slug.as("text", data.doc.slug)}
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block w-32">
						<span class="text-sm text-dim">Order</span>
						<input
							class="mt-1 field"
							type="number"
							step="1"
							{...fields.sortOrder.as("text", String(data.doc.sortOrder))}
						/>
						{#each fields.sortOrder.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
				</div>
				<div class="mt-4 flex items-center gap-3">
					<button class="button-accent disabled:opacity-40" disabled={!!updateUserDoc.pending}>
						{updateUserDoc.pending ? "Saving…" : "Save"}
					</button>
				</div>
			</form>
			<form
				class="mt-6 border-t border-white/15 pt-4"
				{...deleteUserDoc.enhance(async ({ submit }) => {
					if (!confirm(`Delete "${data.doc.title}"? This cannot be undone.`)) return;
					await submit();
				})}
			>
				<input {...deleteUserDoc.fields.id.as("hidden", data.doc.id)} />
				<button class="text-sm text-red-400 hover:underline" disabled={!!deleteUserDoc.pending}>
					{deleteUserDoc.pending ? "Deleting…" : "Delete this page"}
				</button>
			</form>
		</div>
	{/if}
</main>
