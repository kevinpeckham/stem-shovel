<script lang="ts">
	import type { Snippet } from "svelte";

	/**
	 * The home page's way in: sign up when sign-up is open, the waitlist
	 * when invitation-only, nothing for a signed-in member. The button and
	 * its note share a row with whatever the page adds (the editor's Edit
	 * button); a returning member lands on the home page too, so the
	 * sign-in link has a row of its own under the call to action (Kevin,
	 * 2026-11-13).
	 */
	let { user, signUpOpen, children }: { user: unknown; signUpOpen: boolean; children?: Snippet } =
		$props();
</script>

<div class="mt-8 flex flex-wrap gap-4 items-baseline">
	{#if user}
		<!-- A member finds the way to their work in the nav. -->
	{:else if signUpOpen}
		<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
		<span class="opacity-95 text-0.9em text-blue-300"
			>No credit card required. No ads, no trackers.</span
		>
	{:else}
		<!-- Invitation-only (the signUpMode app setting): the waitlist is the way in. -->
		<a class="button-accent-solid button-sm" href="/waitlist">Join the Waitlist</a>
		<div class="text-0.85em">
			<span class="opacity-90">Already have an invite code?</span>
			<a
				class="inline-block ml-2 underline underline-offset-3 opacity-90 hover-opacity-100 hover-text-accent"
				href="/sign-up">Sign Up</a
			>
		</div>
	{/if}
	{@render children?.()}
</div>
{#if !user && signUpOpen}
	<div class="flex gap-2 text-0.8em pt-4 opacity-90">
		<span>Already have an account?</span>
		<a
			class="inline-block underline underline-offset-3 opacity-90 hover-opacity-100 hover-text-accent"
			href="/sign-in">Sign In</a
		>
	</div>
{/if}
