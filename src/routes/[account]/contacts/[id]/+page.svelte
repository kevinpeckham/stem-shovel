<script lang="ts">
	import { goto } from "$app/navigation";
	import ContactForm from "#lib/components/ContactForm.svelte";
	import EventTile from "#lib/components/EventTile.svelte";
	import { deleteContact } from "#lib/remote/contacts.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * A contact of the account: their name, role, phone, email, address and
	 * notes (a form, read-only unless the viewer may edit), the shows that
	 * name them as promoter, and Delete, always allowed: those shows keep
	 * their one-off promoter fields.
	 */
	let { data } = $props();

	const c = $derived(data.contact);
	const listHref = $derived(`/${data.account.slug}/contacts`);
	let busy = $state(false);

	async function remove() {
		if (!confirm("Delete this contact? Shows that name it keep their one-off fields.")) return;
		busy = true;
		try {
			await deleteContact({ id: c.id });
			notify("Contact deleted");
			await goto(listHref);
		} catch (err) {
			notify(`Could not delete the contact: ${errorMessage(err)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`${c.name} · Contacts · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<article class="max-w-article grid gap-6">
		<header class="grid gap-2">
			<p class="text-sm"><a class="link" href={listHref}>← Contacts</a></p>
			<h1 class="app-page-heading mb-0">{c.name}</h1>
			{#if c.role}<p class="text-14px text-dim">{c.role}</p>{/if}
		</header>

		<ContactForm contact={c} canEdit={data.canEdit} />

		<section class="grid gap-3" aria-labelledby="contact-events">
			<h2 class="heading-2 mb-0" id="contact-events">Shows with this contact</h2>
			{#if data.events.length === 0}
				<p class="text-14px text-dim">None yet.</p>
			{:else}
				<ul class="grid gap-3" aria-label="Shows with this contact">
					{#each data.events as show (show.id)}
						<li><EventTile e={show} accountSlug={data.account.slug} /></li>
					{/each}
				</ul>
			{/if}
		</section>

		{#if data.canEdit}
			<button
				class="button button-sm justify-self-start"
				type="button"
				disabled={busy}
				onclick={remove}
			>
				<span class="i-ph-trash" aria-hidden="true"></span> Delete
			</button>
		{/if}
	</article>
</main>
