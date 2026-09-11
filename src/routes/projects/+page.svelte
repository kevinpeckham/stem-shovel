<script lang="ts">
	import { enhance } from "$app/forms";

	let { data, form } = $props();
</script>

<svelte:head>
	<title>Projects — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-6 flex items-baseline justify-between gap-4">
		<h1 class="text-xl font-semibold">Projects</h1>
		<span class="text-sm text-dim">{data.account.name}</span>
	</header>

	{#if data.projects.length === 0}
		<p class="text-dim">No projects yet.</p>
	{:else}
		<ul class="divide-y divide-line rounded-lg bg-row">
			{#each data.projects as project (project.id)}
				<li>
					<a class="block px-4 py-3 hover:underline" href="/projects/{project.slug}"
						>{project.name}</a
					>
				</li>
			{/each}
		</ul>
	{/if}

	<form class="mt-8 flex items-end gap-3" method="POST" action="?/create" use:enhance>
		<label class="grow">
			<span class="text-sm text-dim">New project</span>
			<input
				class="mt-1 block w-full rounded border border-line bg-row px-3 py-2"
				name="name"
				type="text"
				placeholder="Album, session, client…"
				value={form?.name ?? ""}
				required
			/>
		</label>
		<button class="rounded bg-ink px-4 py-2 text-panel">Create</button>
	</form>
	{#if form?.error}
		<p class="mt-2 text-sm text-solo">{form.error}</p>
	{/if}
</main>
