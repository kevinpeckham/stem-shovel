<script lang="ts">
	import { reportBug } from "$lib/remote/bugs.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { notify } from "$lib/state/notifications.svelte";
	import { page } from "$app/state";

	interface Props {
		user: { name: string } | null;
	}
	let { user }: Props = $props();

	// Captured when a popover opens, so the report says where it came from.
	let pageUrl = $state("");
	let userAgent = $state("");
</script>

<footer
	class="page-x-padding pt-4 pb-4 border-t border-white/10 text-11px flex flex-wrap gap-x-6 gap-y-2 justify-between"
>
	<!-- <span>Stem Shovel</span> -->
	<div class="opacity-70">
		Built by <a
			class="inline hover-underline underline-offset-4 hover-text-maximumYellow"
			href="https://www.lightningjar.com">⚡️ Lightning Jar</a
		>
	</div>

	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs">Docs</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs/privacy-policy">Privacy</a
		>
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs/copyright-policy">Copyright</a
		>
		{#if user}
			<button
				type="button"
				class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
				popovertarget="bug-report"
			>
				Report a bug
			</button>
			<button
				type="button"
				class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
				popovertarget="feature-request"
			>
				Request a feature
			</button>
		{/if}
		<!-- Rick Roll Easter Egg -->
		<a
			class="underline underline-offset-4 hover:text-maximumYellow opacity-70 underline underline-offset-4 hover-text-maximumYellow"
			href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
			title="Click in case of emergency">For Your Eyes Only</a
		>
	</div>
</footer>

{#snippet reportPanel(
	id: string,
	kind: "bug" | "feature",
	heading: string,
	titleLabel: string,
	titlePlaceholder: string,
	bodyLabel: string,
	bodyPlaceholder: string,
	thanks: string,
)}
	{@const report = reportBug.for(kind)}
	<!-- Same native popover as the settings panels: top layer, Esc / click-outside close. -->
	<div
		{id}
		popover="auto"
		onbeforetoggle={(e) => {
			if (e.newState === "open") {
				clearForm(report);
				pageUrl = page.url.href;
				userAgent = navigator.userAgent;
			}
		}}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">{heading}</h2>
			<button class="button button-xs" type="button" popovertarget={id} popovertargetaction="hide">
				Close
			</button>
		</div>
		<form
			{...report.enhance(async ({ submit }) => {
				await submit();
				if (report.result?.sent) {
					notify(thanks);
					document.getElementById(id)?.hidePopover();
				}
			})}
		>
			<input {...report.fields.kind.as("hidden", kind)} />
			<input {...report.fields.pageUrl.as("hidden", pageUrl)} />
			<input {...report.fields.userAgent.as("hidden", userAgent)} />
			<label class="block">
				<span class="text-sm text-dim">{titleLabel}</span>
				<input
					class="mt-1 field"
					{...report.fields.title.as("text")}
					placeholder={titlePlaceholder}
					autocomplete="off"
					required
				/>
				{#each report.fields.title.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<label class="mt-4 block">
				<span class="text-sm text-dim">{bodyLabel}</span>
				<textarea
					class="mt-1 field text-sm"
					rows="5"
					{...report.fields.body.as("text")}
					placeholder={bodyPlaceholder}
					required></textarea>
				{#each report.fields.body.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<p class="mt-2 text-xs text-dim">
				The page you are on ({pageUrl || "this page"}) and your browser are included.
			</p>
			<div class="mt-4">
				<button class="button-accent disabled:opacity-40" disabled={!!report.pending}>
					{report.pending ? "Sending…" : kind === "feature" ? "Send request" : "Send report"}
				</button>
			</div>
		</form>
	</div>
{/snippet}

{#if user}
	{@render reportPanel(
		"bug-report",
		"bug",
		"Report a bug",
		"What went wrong?",
		"A short title",
		"What happened, and what did you expect?",
		"Steps to reproduce help a lot.",
		"Thanks — the bug report is in",
	)}
	{@render reportPanel(
		"feature-request",
		"feature",
		"Request a feature",
		"What would you like Stem Shovel to do?",
		"A short title",
		"Tell us about it: what you are trying to do, and how this would help.",
		"An example from your own work is the most useful thing you can give us.",
		"Thanks — the feature request is in",
	)}
{/if}
