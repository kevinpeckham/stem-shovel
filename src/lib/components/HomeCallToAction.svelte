<script lang="ts">
	/**
	 * The home page's way in: sign up when sign-up is open, the waitlist
	 * when invitation-only, nothing for a signed-in member. A returning
	 * member lands on the home page too, so a sign-in link sits under
	 * the call to action (Kevin, 2026-11-13).
	 */
	let { user, signUpOpen }: { user: unknown; signUpOpen: boolean } = $props();
</script>

{#if user}
	<!-- A member finds the way to their work in the nav. -->
{:else if signUpOpen}
	<div class="flex flex-col gap-2">
		<a class="button-accent-solid button-sm" href="/sign-up">Sign Up For Free</a>
		<div class="text-0.85em">
			<span class="opacity-90">Already have an account?</span>
			<a
				class="inline-block ml-2 underline underline-offset-3 opacity-90 hover-opacity-100 hover-text-accent"
				href="/sign-in">Sign In</a
			>
		</div>
	</div>
	<span class="text-0.85em opacity-90">No credit card required. No ads, no trackers.</span>
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
