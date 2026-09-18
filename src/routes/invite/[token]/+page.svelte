<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { acceptInvitation } from "$lib/remote/accounts.remote";

	let { data } = $props();
	let next = $derived(`/invite/${data.token}`);
</script>

<svelte:head>
	<title>{pageTitle("Invitation")}</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">
			{data.status === "open" ? `Join ${data.account?.name}` : "Invitation"}
		</h1>
	</header>
	<section class="max-w-md surface px-5 py-4 text-15px">
		{#if data.status === "missing"}
			<p>There is no invitation at this link.</p>
		{:else if data.status === "accepted"}
			<p>This invitation has already been used.</p>
		{:else if data.status === "revoked"}
			<p>This invitation was withdrawn.</p>
		{:else if data.status === "expired"}
			<p>This invitation has expired. Ask for a new one.</p>
		{:else if data.status === "member"}
			<p>You are already a member of {data.account?.name}.</p>
			<a class="mt-3 inline-block button-accent" href="/{data.account?.slug}/projects">Open it</a>
		{:else if !data.user}
			<p>
				You were invited to <strong>{data.account?.name}</strong> as {data.role}. Sign in as
				<strong>{data.email}</strong> to join, or create that account first.
			</p>
			<div class="mt-3 flex flex-wrap gap-3">
				<a class="button-accent" href="/sign-in?next={encodeURIComponent(next)}">Sign in</a>
				<a class="button" href="/sign-up?invite={encodeURIComponent(data.token)}">
					Create an account
				</a>
			</div>
		{:else if data.mismatch}
			<p>
				This invitation is for <strong>{data.email}</strong>, but you are signed in as
				<strong>{data.user.email}</strong>. Sign out and use the invited address.
			</p>
		{:else}
			<p>You were invited to <strong>{data.account?.name}</strong> as {data.role}.</p>
			<form class="mt-3" {...acceptInvitation}>
				<input {...acceptInvitation.fields.token.as("hidden", data.token)} />
				<button class="button-accent" disabled={!!acceptInvitation.pending}>
					{acceptInvitation.pending ? "Joining…" : `Join ${data.account?.name}`}
				</button>
			</form>
		{/if}
	</section>
</main>
