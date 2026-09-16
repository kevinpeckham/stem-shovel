<script lang="ts">
	import { reportBug } from "$lib/remote/bugs.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { notify } from "$lib/state/notifications.svelte";
	import { page } from "$app/state";

	interface Props {
		user: { name: string } | null;
	}
	let { user }: Props = $props();

	let bugPanel = $state<HTMLDivElement | null>(null);
	// Captured when the popover opens, so the report says where it came from.
	let pageUrl = $state("");
	let userAgent = $state("");
</script>

<footer
	class="page-x-padding pt-4 pb-4 border-t border-white/10 text-11px flex flex-wrap gap-x-6 gap-y-2 justify-between"
>
	<!-- <span>Stem Shovel</span> -->
	<div class="opacity-70">
		An experiment from <a
			class="inline hover-underline underline-offset-4 hover-text-maximumYellow"
			href="https://www.lightningjar.com">⚡️ Lightning Jar</a
		>
	</div>

	<div class="flex flex-wrap items-center gap-x-6 gap-y-2">
		<a
			class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
			href="/docs">Docs</a
		>
		{#if user}
			<button
				type="button"
				class="underline underline-offset-4 opacity-70 hover-opacity-100 hover-text-maximumYellow"
				popovertarget="bug-report"
			>
				Report a bug
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

{#if user}
	<!-- Same native popover as the settings panels: top layer, Esc / click-outside close. -->
	<div
		id="bug-report"
		popover="auto"
		bind:this={bugPanel}
		onbeforetoggle={(e) => {
			if (e.newState === "open") {
				clearForm(reportBug);
				pageUrl = page.url.href;
				userAgent = navigator.userAgent;
			}
		}}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Report a bug</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="bug-report"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<form
			{...reportBug.enhance(async ({ submit }) => {
				await submit();
				if (reportBug.result?.sent) {
					notify("Thanks — the bug report is in");
					bugPanel?.hidePopover();
				}
			})}
		>
			<input {...reportBug.fields.pageUrl.as("hidden", pageUrl)} />
			<input {...reportBug.fields.userAgent.as("hidden", userAgent)} />
			<label class="block">
				<span class="text-sm text-dim">What went wrong?</span>
				<input
					class="mt-1 field"
					{...reportBug.fields.title.as("text")}
					placeholder="A short title"
					autocomplete="off"
					required
				/>
				{#each reportBug.fields.title.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<label class="mt-4 block">
				<span class="text-sm text-dim">What happened, and what did you expect?</span>
				<textarea
					class="mt-1 field text-sm"
					rows="5"
					{...reportBug.fields.body.as("text")}
					placeholder="Steps to reproduce help a lot."
					required></textarea>
				{#each reportBug.fields.body.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<p class="mt-2 text-xs text-dim">
				The page you are on ({pageUrl || "this page"}) and your browser are included.
			</p>
			<div class="mt-4">
				<button class="button-accent disabled:opacity-40" disabled={!!reportBug.pending}>
					{reportBug.pending ? "Sending…" : "Send report"}
				</button>
			</div>
		</form>
	</div>
{/if}
