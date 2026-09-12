<script lang="ts">
	let { data } = $props();
</script>

<main class="page-x-padding main-y-padding">
	<h1 class="heading-1">Welcome</h1>
	<p class="max-w-prose text-17px opacity-90">
		A place to manage songwriting and recording projects. Upload and download stems. Write and edit
		song charts and lyrics. Other stuff.
	</p>
	<div class="mt-8 flex flex-wrap gap-3">
		{#if data.user}
			{#each data.memberships as m (m.accountId)}
				<a class="button-accent" href="/{m.slug}/projects">{m.name} →</a>
			{/each}
		{:else}
			<a class="button-accent" href="/sign-in">Sign in</a>
			<a class="button" href="/sign-up">Register</a>
		{/if}
		<!-- <a class="button" href="/test">Static test page</a> -->
	</div>
	<!-- {#if !data.user}
		<p class="mt-6 max-w-prose text-15px text-dim">
			Anyone with a link can listen. Signing in lets you upload and edit.
		</p>
	{/if} -->
</main>
