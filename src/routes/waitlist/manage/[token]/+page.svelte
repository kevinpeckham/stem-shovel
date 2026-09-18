<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { prefs } from "$lib/remote/waitlist.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Your waitlist entry")}</title>
</svelte:head>

<main class="page min-h-screen">
	<header class="max-w-article">
		<h1 class="display">Your waitlist entry</h1>
		<p class="opacity-90">
			<strong>{data.email}</strong> ·
			{#if data.status === "removed"}
				removed from the list
			{:else if data.status === "invited"}
				invited
			{:else if data.status === "confirmed"}
				confirmed
			{:else}
				waiting for confirmation
			{/if}
		</p>
	</header>
	<section class="max-w-article">
		{#if data.status === "removed"}
			<p class="opacity-90">
				You have left the waitlist and will get no more email from it. <a
					class="underline underline-offset-2"
					href="/waitlist">Join again</a
				> any time.
			</p>
		{:else}
			<form
				class="grid max-w-md gap-4"
				{...prefs.enhance(async ({ submit }) => {
					await submit();
					if (prefs.result) {
						notify(
							prefs.result.status === "removed"
								? "You have left the waitlist"
								: prefs.result.updatesOk
									? "Project updates on"
									: "Project updates off",
						);
						await invalidateAll();
					}
				})}
			>
				<input {...prefs.fields.token.as("hidden", data.token)} />
				<div class="rounded-md border border-current/40 bg-blue-300/5 px-4 py-3 text-15px">
					<p class="font-600">Project updates: {data.updatesOk ? "on" : "off"}</p>
					<p class="mt-1 text-sm opacity-80">
						A note now and then about what is new in Stem Shovel. Waitlist email itself (your
						confirmation, your invite) is always sent while you are on the list.
					</p>
					<button
						class="button button-sm mt-3"
						{...prefs.fields.action.as("submit", data.updatesOk ? "updates-off" : "updates-on")}
						disabled={!!prefs.pending}
					>
						{data.updatesOk ? "Turn project updates off" : "Turn project updates on"}
					</button>
				</div>
				<div>
					<button
						class="link-dim text-sm"
						{...prefs.fields.action.as("submit", "leave")}
						disabled={!!prefs.pending}
					>
						Leave the waitlist
					</button>
					<span class="ml-2 text-12px opacity-70">No more email of any kind.</span>
				</div>
			</form>
		{/if}
	</section>
</main>
