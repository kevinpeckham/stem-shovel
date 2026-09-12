<script lang="ts">
	let { data } = $props();
</script>

<main class="page min-h-screen">
	<h1 class="display">Stem Shovel</h1>
	<p class="mt-2 max-w-prose text-17px opacity-90">
		Upload a song's stems straight from the browser, play them back in sync with per-stem faders,
		mute and solo, and keep the chart and lyrics beside them.
	</p>
	<div class="mt-8 flex flex-wrap gap-3">
		{#if data.user}
			{#each data.memberships as m (m.accountId)}
				<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
			{/each}
		{:else}
			<a class="button-accent" href="/sign-in">Sign in</a>
			<a class="button" href="/sign-up">Create an account</a>
		{/if}
		<a class="button" href="/test">Static test page</a>
	</div>
	{#if !data.user}
		<p class="mt-6 max-w-prose text-15px text-dim">
			Anyone with a link can listen. Signing in lets you upload and edit.
		</p>
	{/if}
</main>
