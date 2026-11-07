<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";
	import MemberCard from "#lib/components/MemberCard.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * The account's members (MemberCard each): name, role, email, phone,
	 * instruments and notes, with Edit on the viewer's own row, or on every
	 * row for an owner or admin.
	 */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Members · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="app-page-heading mb-0 flex items-center gap-2">
			Members
			<InfoTip
				text="Who is in the band and how to reach them: a phone, what they play and notes, set by each member or an admin. Members only; nothing here is public."
				label="About members"
				class="text-16px"
			/>
		</h1>
		{#if data.canManage}
			<p class="mt-2 text-14px text-dim">
				Roles and invitations are on <a class="link" href="/{data.account.slug}/settings"
					>Account settings</a
				>.
			</p>
		{/if}
	</header>

	<div class="max-w-article">
		<ul class="surface divide-y divide-white/10" aria-label="Members">
			{#each data.members as m (m.userId)}
				<li class="px-5 py-4">
					<MemberCard
						member={m}
						accountId={data.account.id}
						canEdit={data.canManage || m.userId === data.myUserId}
					/>
				</li>
			{/each}
		</ul>
	</div>
</main>
