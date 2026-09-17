<script lang="ts">
	import { join } from "$lib/remote/waitlist.remote";
	import { clearForm } from "$lib/utils/clearForm";

	/**
	 * The beta waitlist sign-up: an address, an optional name, and the
	 * separate consent to project updates. After a submit it explains the
	 * confirmation email (or that the address is already on the list).
	 */
	interface Props {
		/** Tighter for the front page. */
		compact?: boolean;
	}
	let { compact = false }: Props = $props();
	let done = $state<"confirm" | "already" | null>(null);
	let submitted = $state("");
</script>

{#if done}
	<div class="rounded-md border border-current/40 bg-blue-300/5 px-4 py-3 text-15px" role="status">
		{#if done === "already"}
			<strong>{submitted}</strong> is already on the waitlist. Invite codes go out to the list as seats
			open; nothing more to do.
		{:else}
			<strong>Check your email.</strong> We sent a confirmation link to {submitted}; your place on
			the waitlist is held once you open it.
		{/if}
	</div>
{:else}
	<form
		class="grid gap-3 {compact ? 'max-w-md' : 'max-w-lg'}"
		{...join.enhance(async ({ submit, element }) => {
			const email = join.fields.email.value() ?? "";
			await submit();
			if (join.result?.next) {
				done = join.result.next;
				submitted = email;
				clearForm(join);
				element.reset();
			}
		})}
	>
		<div class="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
			<label class="block">
				<span class="text-sm text-dim">Email</span>
				<input
					class="mt-1 field"
					autocomplete="email"
					placeholder="you@band.com"
					required
					{...join.fields.email.as("email")}
				/>
			</label>
			<button class="button-accent" disabled={!!join.pending}>
				{join.pending ? "Sending…" : "Join the waitlist"}
			</button>
		</div>
		{#each join.fields.email.issues() ?? [] as issue (issue.message)}
			<p class="text-sm text-red-400">{issue.message}</p>
		{/each}
		<label class="block">
			<span class="text-sm text-dim">Name <span class="opacity-60">(optional)</span></span>
			<input
				class="mt-1 field"
				autocomplete="name"
				maxlength="80"
				{...join.fields.name.as("text")}
			/>
		</label>
		<!-- Honeypot: off-screen and skipped by the tab order; a bot filling it is refused. -->
		<label class="absolute -left-[9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
			Website
			<input tabindex="-1" autocomplete="off" {...join.fields.website.as("text")} />
		</label>
		<label class="flex items-start gap-2 text-sm">
			<input class="mt-1" {...join.fields.updates.as("checkbox")} />
			<span>
				Also send me project updates now and then. <span class="opacity-70"
					>Optional; you can turn it off from any email. Without it you only hear about the waitlist
					itself: this confirmation and your invite.</span
				>
			</span>
		</label>
		{#each join.fields.allIssues() ?? [] as issue (issue.message)}
			{#if !(join.fields.email.issues() ?? []).includes(issue)}
				<p class="text-sm text-red-400">{issue.message}</p>
			{/if}
		{/each}
		<p class="text-12px opacity-70">
			We keep your address to send the confirmation and your invite code, nothing else, and delete
			it when you ask. <a class="underline underline-offset-2" href="/docs/privacy-policy"
				>Privacy policy</a
			>.
		</p>
	</form>
{/if}
