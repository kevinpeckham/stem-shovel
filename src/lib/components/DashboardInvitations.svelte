<script lang="ts">
	import { acceptInvitation } from "#lib/remote/accounts.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatDate } from "#lib/utils/formatDate.js";

	/**
	 * The invitations waiting for the person, at the top of their dashboard:
	 * into an account with a role, or to listen to one project as a viewer.
	 * Each has the button the emailed link leads to (`/invite/<token>`), so
	 * someone who already has a sign-in joins from here; joining lands them
	 * in the account, as the link does. Rendered only with something in it.
	 * A row without a token (a super admin viewing someone's dashboard) is
	 * listed with a note in place of the button: joining goes by the
	 * signed-in person's address, so the admin's press would be refused.
	 */
	interface Invitation {
		id: string;
		token: string | null;
		role: string;
		expiresAt: Date;
		account: { name: string; slug: string };
		project: { name: string } | null;
		inviter: { name: string } | null;
	}
	let { invitations }: { invitations: Invitation[] } = $props();

	const article = (word: string) => (/^[aeiou]/i.test(word) ? "an" : "a");
	/** Each invitation with the words that depend on what it is: who invited, and what its button says. */
	let rows = $derived(
		invitations.map((inv) => ({
			...inv,
			lead: inv.inviter?.name ? `${inv.inviter.name} invited you` : "You were invited",
			label: inv.project ? `Open ${inv.project.name}` : `Join ${inv.account.name}`,
		})),
	);
</script>

{#if invitations.length > 0}
	<section class="surface mb-6 grid gap-3 p-5" aria-labelledby="dashboard-invitations">
		<h2 class="marketing-section-heading mb-0" id="dashboard-invitations">Invitations</h2>
		<ul class="grid gap-3 text-15px" aria-label="Invitations">
			{#each rows as inv (inv.id)}
				{@const accept = acceptInvitation.for(inv.id)}
				<li class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
					<div class="min-w-0">
						<p>
							{inv.lead}
							{#if inv.project}
								to listen to <strong>{inv.project.name}</strong>, a project of {inv.account.name},
								and comment on it.
							{:else}
								to join <strong>{inv.account.name}</strong> as {article(inv.role)}
								{inv.role}.
							{/if}
						</p>
						<p class="text-12px opacity-70">Expires {formatDate(inv.expiresAt)}</p>
					</div>
					{#if inv.token}
						<form
							{...accept.enhance(async ({ submit }) => {
								try {
									await submit();
								} catch (e) {
									notify(errorMessage(e), { kind: "error" });
								}
							})}
						>
							<input {...accept.fields.token.as("hidden", inv.token)} />
							<button class="button-accent button-sm" disabled={!!accept.pending}>
								{accept.pending ? "Joining…" : inv.label}
							</button>
						</form>
					{:else}
						<p class="text-12px opacity-70">
							Only they can join: the button shows on their own dashboard.
						</p>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/if}
