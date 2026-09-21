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
	<title>{pageTitle(`${data.post.title} · Blog`)}</title>
	{#if data.description}<meta name="description" content={data.description} />{/if}
	{#if !data.post.publishedAt}<meta name="robots" content="noindex, nofollow, noarchive" />{/if}
</svelte:head>

<main class="page-x-padding pt-6 mb-8">
	<article class="min-w-0 max-w-article">
		<a class="block mb-3 text-sm link-dim" href="/blog">← Blog</a>
		<header class="mb-4 flex flex-wrap items-baseline justify-between gap-4">
			<div>
				<h1 class="display">{data.post.title}</h1>
				<p class="mt-1 text-13px text-dim">
					{#if data.post.publishedAt}
						<time datetime={data.post.publishedAt.toISOString()}
							>{formatDate(data.post.publishedAt)}</time
						>
					{:else}
						<span
							class="rounded border border-accent/60 px-1.5 py-0.5 text-11px uppercase tracking-wider text-accent"
							>Draft · only admins see this</span
						>
					{/if}
					{#if data.post.author}
						· {data.post.author}
					{/if}
				</p>
			</div>
			{#if data.canEdit}
				<div class="flex items-center gap-2">
					<a class="button button-sm" href="/blog/{data.post.slug}/edit">
						<span class="i-ph-pencil-simple" aria-hidden="true"></span>
						Edit
					</a>
					<button
						class="button button-sm"
						type="button"
						popovertarget="post-settings"
						title="Post settings"
						aria-label="Post settings"
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
					<a class="ml-1 link-dim" href="/blog/{data.post.slug}/edit">Write it.</a>
				{/if}
			</p>
		{/if}
		{#if data.post.version > 0 && data.canEdit}
			<p class="mt-3 text-xs text-dim">
				Updated {formatDate(data.post.updatedAt)} · v{data.post.version}
			</p>
		{/if}
	</article>

	{#if data.canEdit}
		<div
			id="post-settings"
			popover="auto"
			bind:this={settingsPanel}
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(updateUserDoc);
			}}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">Post settings</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="post-settings"
					popovertargetaction="hide"
				>
					Close
				</button>
			</div>
			<form
				{...updateUserDoc.enhance(async ({ submit }) => {
					await submit();
					if (!fields.allIssues()) {
						notify("Post settings saved");
						settingsPanel?.hidePopover();
					}
				})}
			>
				<input {...fields.id.as("hidden", data.post.id)} />
				<div class="grid gap-4">
					<label class="block">
						<span class="text-sm text-dim">Title</span>
						<input class="mt-1 field" {...fields.title.as("text", data.post.title)} required />
						{#each fields.title.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">Address</span>
						<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
							<span class="pl-3 text-sm text-dim">/blog/</span>
							<input
								class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
								{...fields.slug.as("text", data.post.slug)}
								required
							/>
						</span>
						{#each fields.slug.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="flex items-start gap-2 text-sm">
						<input
							class="mt-0.5"
							{...fields.published.as("checkbox")}
							checked={!!data.post.publishedAt}
						/>
						<span>
							Published
							<span class="block text-13px text-dim">
								{#if data.post.publishedAt}
									Since {formatDate(data.post.publishedAt)}. Untick to take it back to a draft.
								{:else}
									Shows the post to everyone, dated today, and lists it in the sitemap.
								{/if}
							</span>
						</span>
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
					if (!confirm(`Delete "${data.post.title}"? This cannot be undone.`)) return;
					await submit();
				})}
			>
				<input {...deleteUserDoc.fields.id.as("hidden", data.post.id)} />
				<button class="text-sm text-red-400 hover:underline" disabled={!!deleteUserDoc.pending}>
					{deleteUserDoc.pending ? "Deleting…" : "Delete this post"}
				</button>
			</form>
		</div>
	{/if}
</main>
