<script lang="ts">
	import { enhance } from "$app/forms";
	import StemPlayer from "$lib/components/StemPlayer.svelte";

	let { data } = $props();
	let deleting = $state(false);
</script>

<svelte:head>
	<title>{data.manifest.title} — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-2 flex items-baseline justify-between gap-4">
		<h1 class="text-xl font-semibold">{data.manifest.title}</h1>
		<nav class="flex items-baseline gap-4 text-sm">
			<a class="underline decoration-playhead underline-offset-4" href="/songs">All songs</a>
			<form
				method="POST"
				action="?/delete"
				use:enhance={({ cancel }) => {
					if (!confirm(`Delete every stem of "${data.manifest.title}" from the Blob store?`)) {
						cancel();
						return;
					}
					deleting = true;
					return async ({ update }) => {
						await update();
						deleting = false;
					};
				}}
			>
				<button
					class="text-dim underline underline-offset-4 disabled:opacity-50"
					disabled={deleting}
				>
					{deleting ? "Deleting…" : "Delete song"}
				</button>
			</form>
		</nav>
	</header>

	{#key data.slug}
		<StemPlayer manifest={data.manifest}>
			{#snippet errorHint()}
				The stems are served straight from Vercel Blob. If a URL 404s, the file was deleted from the
				store; re-upload it from the <a class="underline" href="/upload">upload page</a>.
			{/snippet}
		</StemPlayer>
	{/key}
</main>
