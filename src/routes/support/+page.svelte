<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { startSupport, submitSupport, submitSupportSignedIn } from "$lib/remote/support.remote";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();

	/** Step 2 of the visitor flow, once the line-up has been issued. */
	let lineUp = $state<{ email: string; options: string[]; challenge: string } | null>(null);
	let sent = $state(false);
</script>

<svelte:head>
	<title>{pageTitle("Help")}</title>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<header class="max-w-article mb-8">
		<h1 class="app-page-heading mb-5">Help</h1>
		<p class="app-page-subheading">
			Something not working, locked out, or a question? Tell us and we will reply by email.
		</p>
	</header>

	<div class="max-w-article surface px-6 py-6">
		{#if sent}
			<p class="text-15px">
				Thanks, your request is in. We will answer at {lineUp?.email ?? data.email}.
			</p>
		{:else if data.signedIn}
			<!-- A member: their account is on record, so only the message is needed. -->
			<form
				class="grid gap-4"
				{...submitSupportSignedIn.enhance(async ({ submit }) => {
					await submit();
					if (submitSupportSignedIn.result?.sent) {
						sent = true;
						notify("Support request sent");
					}
				})}
			>
				<p class="text-sm opacity-80">Signed in as {data.email}.</p>
				<label class="block">
					<span class="text-sm opacity-90">What do you need help with?</span>
					<textarea
						class="mt-1 field min-h-40 text-sm"
						rows="6"
						autocomplete="off"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						{...submitSupportSignedIn.fields.message.as("text")}></textarea>
					{#each submitSupportSignedIn.fields.message.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<input
					class="sr-only"
					tabindex="-1"
					autocomplete="off"
					{...submitSupportSignedIn.fields.website.as("text")}
				/>
				<div>
					<button class="button button-accent" disabled={!!submitSupportSignedIn.pending}>
						{submitSupportSignedIn.pending ? "Sending…" : "Send"}
					</button>
				</div>
			</form>
		{:else if !lineUp}
			<!-- Step 1: the email the account is registered under. -->
			<form
				class="grid gap-4"
				{...startSupport.enhance(async ({ submit }) => {
					await submit();
					const r = startSupport.result;
					if (r?.challenge) {
						lineUp = {
							email: startSupport.fields.email.value() ?? "",
							options: r.options,
							challenge: r.challenge,
						};
					}
				})}
			>
				<label class="block">
					<div class="opacity-90 mb-3">The email address of your account</div>
					<input
						class="mt-1 field"
						type="email"
						autocomplete="email"
						inputmode="email"
						{...startSupport.fields.email.as("text")}
					/>
					{#each startSupport.fields.email.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<input
					class="sr-only"
					tabindex="-1"
					autocomplete="off"
					{...startSupport.fields.website.as("text")}
				/>
				<div class="flex flex-wrap items-center gap-4">
					<button class="button button-accent" disabled={!!startSupport.pending}>
						{startSupport.pending ? "One moment…" : "Continue"}
					</button>
					<a
						class="text-13px opacity-85 underline hover-text-accent underline-offset-4 hover-opacity-100"
						href="/sign-in">Sign in to skip this step.</a
					>
				</div>
			</form>
		{:else}
			<!-- Step 2: pick the account out of the line-up, then the message. -->
			<form
				class="grid gap-4"
				{...submitSupport.enhance(async ({ submit }) => {
					await submit();
					if (submitSupport.result?.sent) {
						sent = true;
						notify("Support request sent");
					}
				})}
			>
				<input {...submitSupport.fields.email.as("hidden", lineUp.email)} />
				<input {...submitSupport.fields.challenge.as("hidden", lineUp.challenge)} />
				<fieldset class="grid gap-2">
					<legend class="text-sm opacity-90 mb-1">
						To confirm it is you, choose the account you belong to. Names are partly hidden.
					</legend>
					{#each lineUp.options as name, i (i)}
						<label class="flex items-center gap-3 text-15px">
							<input
								class="accent-maximumYellow"
								{...submitSupport.fields.pick.as("radio", String(i))}
							/>
							<span class="font-mono tracking-wide">{name}</span>
						</label>
					{/each}
					{#each submitSupport.fields.pick.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
					{#each submitSupport.fields.email.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</fieldset>
				<label class="block">
					<span class="text-sm opacity-90">What do you need help with?</span>
					<textarea
						class="mt-1 field min-h-40 text-sm"
						rows="6"
						autocomplete="off"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						{...submitSupport.fields.message.as("text")}></textarea>
					{#each submitSupport.fields.message.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<input
					class="sr-only"
					tabindex="-1"
					autocomplete="off"
					{...submitSupport.fields.website.as("text")}
				/>
				<div class="flex flex-wrap items-center gap-4">
					<button class="button button-accent" disabled={!!submitSupport.pending}>
						{submitSupport.pending ? "Sending…" : "Send"}
					</button>
					<button class="link-dim text-sm" type="button" onclick={() => (lineUp = null)}>
						Use a different email
					</button>
				</div>
			</form>
		{/if}
	</div>
</main>
