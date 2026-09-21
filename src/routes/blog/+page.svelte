<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatDate } from "$lib/utils/formatDate";
	import { createUserDoc } from "$lib/remote/userDocs.remote";
	import { clearForm } from "$lib/utils/clearForm";

	let { data } = $props();
	let addPanel = $state<HTMLDivElement | null>(null);
</script>

<svelte:head>
	<title>{pageTitle("Blog")}</title>
	<meta
		name="description"
		content="Notes from the people building Stem Shovel: how bands share stems and demos, what we are working on, and what we have learned making music together online."
	/>
</svelte:head>

<main class="page-x-padding pt-8 pb-12 min-h-screen">
	<header class="mb-6 flex flex-wrap items-baseline justify-between gap-4 max-w-article">
		<div>
			<h1 class="heading-2">Blog</h1>
			<p class="opacity-90 text-balance">
				Notes from the people building Stem Shovel: what we are working on, and what we have learned
				making music together.
			</p>
		</div>
		{#if data.canEdit}
			<button class="button button-sm" type="button" popovertarget="add-post">
				<span class="i-ph-plus" aria-hidden="true"></span>
				New post
			</button>
		{/if}
	</header>

	{#if data.posts.length === 0}
		<p class="text-dim max-w-article">
			Nothing written yet.{#if data.canEdit}
				<button class="ml-1 link-dim" type="button" popovertarget="add-post"
					>Write the first post.</button
				>
			{/if}
		</p>
	{:else}
		<ul class="grid grid-cols-1 gap-6 max-w-article">
			{#each data.posts as post (post.id)}
				<li>
					<article>
						<p class="text-13px text-dim">
							{#if post.publishedAt}
								<time datetime={post.publishedAt.toISOString()}>{formatDate(post.publishedAt)}</time
								>
							{:else}
								<span
									class="rounded border border-accent/60 px-1.5 py-0.5 text-11px uppercase tracking-wider text-accent"
									>Draft</span
								>
							{/if}
							{#if post.author}
								· {post.author}
							{/if}
						</p>
						<h2 class="mt-1 text-18px font-600 leading-snug">
							<a
								class="hover:text-accent hover:underline underline-offset-4"
								href="/blog/{post.slug}">{post.title}</a
							>
						</h2>
						{#if post.summary}
							<p class="mt-1 opacity-80 text-15px">{post.summary}</p>
						{/if}
					</article>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canEdit}
		<div
			id="add-post"
			popover="auto"
			bind:this={addPanel}
			onbeforetoggle={(e) => {
				if (e.newState === "open") clearForm(createUserDoc);
			}}
			class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
		>
			<div class="mb-4 flex items-center justify-between gap-4">
				<h2 class="heading-2 mb-0">New post</h2>
				<button
					class="button button-xs"
					type="button"
					popovertarget="add-post"
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
				<input {...createUserDoc.fields.kind.as("hidden", "post")} />
				<label class="block">
					<span class="text-sm text-dim">Title</span>
					<input
						class="mt-1 field"
						{...createUserDoc.fields.title.as("text")}
						placeholder="Why we built a stem player"
						autocomplete="off"
						required
					/>
					{#each createUserDoc.fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<p class="mt-2 text-xs text-dim">
					The address comes from the title; both can be changed later. A new post is a draft until
					you publish it from its settings.
				</p>
				<div class="mt-4">
					<button class="button-accent disabled:opacity-40" disabled={!!createUserDoc.pending}>
						{createUserDoc.pending ? "Creating…" : "Create post"}
					</button>
				</div>
			</form>
		</div>
	{/if}
</main>
