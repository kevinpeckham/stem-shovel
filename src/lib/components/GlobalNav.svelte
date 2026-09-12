<script lang="ts">
	import { page } from "$app/state";

	interface Props {
		user: { name: string } | null;
		/** Accounts the user belongs to; the current one is in the URL. */
		memberships: { accountId: string; slug: string; name: string }[];
	}
	let { user, memberships }: Props = $props();

	let accountSlug = $derived(page.params.account ?? memberships[0]?.slug);
	let member = $derived(memberships.find((m) => m.slug === accountSlug));
	let current = $derived(page.url.pathname);
	let items = $derived(
		accountSlug
			? [
					{ label: "Projects", href: `/${accountSlug}/projects` },
					...(member ? [{ label: "Settings", href: `/${accountSlug}/settings` }] : []),
				]
			: [],
	);
	// Members see their account's name; a visitor sees the account they are viewing.
	let accountName = $derived(member?.name ?? (page.data.account?.name as string | undefined) ?? "");
</script>

<header class="page-x-padding flex items-center gap-6 py-4 border-b border-white/10">
	<a
		class="font-display text-maximumYellow text-20px md:text-24px leading-none tracking-wide"
		href="/"
		title="Stem Shovel home"
	>
		Stem Shovel
	</a>
	<nav aria-label="Primary" class="flex items-center gap-4 text-15px">
		{#each items as item (item.href)}
			<a
				class="opacity-80 hover:opacity-100 hover:text-maximumYellow underline-offset-4 {current.startsWith(
					item.href,
				)
					? 'underline text-maximumYellow'
					: ''}"
				href={item.href}>{item.label}</a
			>
		{/each}
	</nav>
	<div class="ml-auto flex items-center gap-4 text-13px">
		{#if accountName}
			<a class="opacity-60 truncate hover:opacity-100" href="/{accountSlug}/projects"
				>{accountName}</a
			>
		{/if}
		{#if user}
			<span class="opacity-60 truncate">{user.name}</span>
			<a class="link-dim" href="/sign-out">Sign out</a>
		{:else}
			<a class="link-dim" href="/sign-in?next={encodeURIComponent(current)}">Sign in</a>
		{/if}
	</div>
</header>
