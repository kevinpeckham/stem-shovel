<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import ContactNew from "#lib/components/ContactNew.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { plural } from "#lib/utils/plural.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * The account's contacts: a tile each linking to the contact's page,
	 * with their role, phone and email and how many shows name them as
	 * promoter, and New contact (ContactNew).
	 */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Contacts · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading mb-0 flex items-center gap-2">
				Contacts
				<InfoTip
					text="Promoters, booking agents, sound engineers: a name, a role and how to reach them, saved once and picked as a show's promoter. Contacts belong to your account."
					label="About contacts"
					class="text-16px"
				/>
			</h1>
			{#if data.canEdit}
				<button
					class="button button-sm button-accent ml-auto"
					type="button"
					popovertarget="contact-new-page"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> New contact
				</button>
			{/if}
		</div>
	</header>

	<div class="max-w-article">
		{#if data.contacts.length === 0}
			<div class="surface p-6">
				<p class="mb-2 font-700">No contacts yet.</p>
				<p class="text-14px text-dim">
					Press New contact, then pick them as the promoter on a show.
				</p>
			</div>
		{:else}
			<ul class="grid gap-3" aria-label="Contacts">
				{#each data.contacts as c (c.id)}
					{@const reach = [c.role, c.phone, c.email].filter(Boolean).join(" · ")}
					<li>
						<a class="app-list-tile block" href="/{data.account.slug}/contacts/{c.id}">
							<span class="app-tile-heading">{c.name}</span>
							{#if reach}<span class="mt-1 block text-13px text-dim">{reach}</span>{/if}
							{#if c.eventCount > 0}
								<span class="mt-1 block text-13px text-dim">{plural(c.eventCount, "show")}</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>

{#if data.canEdit}
	<ContactNew
		id="contact-new-page"
		accountId={data.account.id}
		onadded={() => void invalidateAll()}
	/>
{/if}
