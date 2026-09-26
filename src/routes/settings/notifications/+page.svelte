<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { saveNotificationPreferences } from "$lib/remote/notifications.remote";
	import { DIGEST_MODES } from "$lib/val/NotificationSchema";
	import { notify } from "$lib/state/notifications.svelte";
	import { invalidateAll } from "$app/navigation";

	let { data } = $props();
	const fields = saveNotificationPreferences.fields;
	const DIGEST_LABELS = {
		none: "As they happen",
		daily: "Once a day",
		weekly: "Once a week",
	} as const;
</script>

<svelte:head>
	<title>{pageTitle("Notifications")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Notifications</h1>
		<p class="opacity-90 text-balance">
			Everything lands in your <a class="link-dim" href="/inbox">inbox</a>. Choose what also reaches
			your email, and whether at once or in a summary.
		</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">Always by email</h2>
		<p class="text-sm opacity-90">
			Warnings about an account you own or manage: storage nearly full or full, every seat taken.
			And when someone accepts an invitation you sent.
		</p>
	</section>

	<form
		class="max-w-article grid gap-6"
		{...saveNotificationPreferences.enhance(async ({ submit }) => {
			await submit();
			if (saveNotificationPreferences.result?.saved) {
				notify("Notification settings saved");
				await invalidateAll();
			}
		})}
	>
		<section>
			<h2 class="heading-2">Email me when</h2>
			<p class="mb-3 text-sm opacity-90">
				Off unless you turn them on. Each is about the projects you belong to, and never about what
				you did yourself.
			</p>
			<div class="grid gap-3 text-15px">
				<label class="flex items-start gap-3">
					<input
						class="mt-1"
						{...fields.emailComments.as("checkbox")}
						checked={data.prefs.emailComments}
					/>
					<span>Someone comments on a song</span>
				</label>
				<label class="flex items-start gap-3">
					<input
						class="mt-1"
						{...fields.emailStems.as("checkbox")}
						checked={data.prefs.emailStems}
					/>
					<span>Someone uploads new stems</span>
				</label>
				<label class="flex items-start gap-3">
					<input
						class="mt-1"
						{...fields.emailSongs.as("checkbox")}
						checked={data.prefs.emailSongs}
					/>
					<span>Someone creates a new song</span>
				</label>
				<label class="flex items-start gap-3">
					<input
						class="mt-1"
						{...fields.emailDemos.as("checkbox")}
						checked={data.prefs.emailDemos}
					/>
					<span>Someone adds a demo recording</span>
				</label>
			</div>
		</section>

		<section>
			<h2 class="heading-2">How often</h2>
			<p class="mb-3 text-sm opacity-90">
				The emails above, one at a time as things happen, or gathered into a single summary.
				Warnings and accepted invitations always come at once.
			</p>
			<div class="grid gap-2 text-15px">
				{#each DIGEST_MODES as mode (mode)}
					<label class="flex items-center gap-3">
						<input {...fields.digest.as("radio", mode)} checked={data.prefs.digest === mode} />
						<span>{DIGEST_LABELS[mode]}</span>
					</label>
				{/each}
			</div>
		</section>

		<section>
			<h2 class="heading-2">Text messages</h2>
			<p class="text-sm opacity-90">
				Coming later: important warnings by text message. There is nothing to set yet.
			</p>
		</section>

		<div>
			<button class="button-accent" disabled={!!saveNotificationPreferences.pending}>
				{saveNotificationPreferences.pending ? "Saving…" : "Save"}
			</button>
		</div>
	</form>
</main>
