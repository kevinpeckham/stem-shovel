<script lang="ts">
	import { reportBug } from "$lib/remote/bugs.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { notify } from "$lib/state/notifications.svelte";
	import { page } from "$app/state";

	/**
	 * The "Report a bug" / "Request a feature" form in a native popover
	 * (top layer, Esc / click-outside close), opened by any element with
	 * `popovertarget={id}`: the footer's bug link, the Feature Requests
	 * page's button. The page and browser are captured when it opens; the
	 * requester may add an email address we can write to about it.
	 */
	interface Props {
		id: string;
		kind: "bug" | "feature";
		user: { name: string; email: string };
	}
	let { id, kind, user }: Props = $props();

	const COPY = {
		bug: {
			heading: "Report a bug",
			titleLabel: "What went wrong?",
			bodyLabel: "What happened, and what did you expect?",
			bodyPlaceholder: "Steps to reproduce help a lot.",
			contact: "You may email me if you need more detail",
			send: "Send report",
			thanks: "Thanks — the bug report is in",
		},
		feature: {
			heading: "Request a feature",
			titleLabel: "What would you like Stem Shovel to do?",
			bodyLabel: "Tell us about it: what you are trying to do, and how this would help.",
			bodyPlaceholder: "An example from your own work is the most useful thing you can give us.",
			contact: "Email me about this request — to learn more, or when it ships",
			send: "Send request",
			thanks: "Thanks — the feature request is in",
		},
	} as const;
	const copy = $derived(COPY[kind]);
	const report = $derived(reportBug.for(kind));

	// Captured when the popover opens, so the report says where it came from.
	let pageUrl = $state("");
	let userAgent = $state("");
	/** Ticked: the email field shows (prefilled with the account's address) and is sent. */
	let contactOk = $state(false);
</script>

<div
	{id}
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState === "open") {
			clearForm(report);
			contactOk = false;
			pageUrl = page.url.href;
			userAgent = navigator.userAgent;
		}
	}}
	class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">{copy.heading}</h2>
		<button class="button button-xs" type="button" popovertarget={id} popovertargetaction="hide">
			Close
		</button>
	</div>
	<form
		{...report.enhance(async ({ submit }) => {
			await submit();
			if (report.result?.sent) {
				notify(copy.thanks);
				document.getElementById(id)?.hidePopover();
			}
		})}
	>
		<input {...report.fields.kind.as("hidden", kind)} />
		<input {...report.fields.pageUrl.as("hidden", pageUrl)} />
		<input {...report.fields.userAgent.as("hidden", userAgent)} />
		<label class="block">
			<span class="text-sm text-dim">{copy.titleLabel}</span>
			<!-- Not a login form: the lone text input made iOS offer the password manager instead of a keyboard. -->
			<input
				class="mt-1 field"
				{...report.fields.title.as("text")}
				placeholder="A short title"
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				enterkeyhint="next"
				required
			/>
			{#each report.fields.title.issues() ?? [] as issue (issue.message)}
				<p class="mt-1 text-sm text-red-400">{issue.message}</p>
			{/each}
		</label>
		<label class="mt-4 block">
			<span class="text-sm text-dim">{copy.bodyLabel}</span>
			<textarea
				class="mt-1 field text-sm"
				rows="5"
				{...report.fields.body.as("text")}
				placeholder={copy.bodyPlaceholder}
				autocomplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				required></textarea>
			{#each report.fields.body.issues() ?? [] as issue (issue.message)}
				<p class="mt-1 text-sm text-red-400">{issue.message}</p>
			{/each}
		</label>
		<label class="mt-4 flex items-start gap-2 text-sm">
			<input class="mt-1 accent-maximumYellow" type="checkbox" bind:checked={contactOk} />
			<span>{copy.contact}</span>
		</label>
		{#if contactOk}
			<!-- Only rendered when ticked, so an unticked form sends no address at all. -->
			<label class="mt-2 block">
				<span class="text-sm text-dim">Email address</span>
				<input
					class="mt-1 field"
					type="email"
					autocomplete="email"
					inputmode="email"
					{...report.fields.contactEmail.as("text", user.email)}
				/>
				{#each report.fields.contactEmail.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
		{/if}
		<p class="mt-2 text-xs text-dim">
			The page you are on ({pageUrl || "this page"}) and your browser are included.
		</p>
		<div class="mt-4">
			<button class="button-accent disabled:opacity-40" disabled={!!report.pending}>
				{report.pending ? "Sending…" : copy.send}
			</button>
		</div>
	</form>
</div>
