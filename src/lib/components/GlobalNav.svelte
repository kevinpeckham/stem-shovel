<script lang="ts">
	import { signOut } from "$lib/remote/auth.remote";
	import { page } from "$app/state";

	interface Props {
		user: { name: string; email?: string; isSystemAdmin?: boolean } | null;
		/** Accounts the user belongs to; the current one is in the URL. */
		memberships: { accountId: string; slug: string; name: string; role: string }[];
		/** The user's own account for pages outside any account (src/lib/server/currentAccount.ts). */
		currentSlug?: string | null;
	}
	let { user, memberships, currentSlug = null }: Props = $props();

	let accountSlug = $derived(page.params.account ?? currentSlug ?? memberships[0]?.slug);
	let member = $derived(memberships.find((m) => m.slug === accountSlug));
	let current = $derived(page.url.pathname);
	// A visitor sees the name of the account they are viewing.
	let viewedName = $derived((page.data.account?.name as string | undefined) ?? "");

	// The account menu: everything a signed-in user can reach, behind one
	// button, instead of a row of links. Closes on outside click or Escape.
	let open = $state(false);
	let menu = $state<HTMLDivElement | null>(null);
	function onwindowpointerdown(e: PointerEvent) {
		if (open && menu && !menu.contains(e.target as Node)) open = false;
	}
	function onwindowkeydown(e: KeyboardEvent) {
		if (e.key === "Escape") open = false;
	}
	const active = (href: string) => current === href || current.startsWith(`${href}/`);
</script>

<svelte:window onpointerdown={onwindowpointerdown} onkeydown={onwindowkeydown} />

<header
	class="page-x-padding flex items-center justify-between gap-6 py-4 border-b border-white/10"
>
	<a
		class="font-brand text-maximumYellow text-20px md-text-24px lg-text-28px leading-none tracking-wide"
		href="/"
		title="Stem Shovel home"
	>
		Stem Shovel
	</a>
	<nav aria-label="Primary" class="flex items-center gap-4 text-15px">
		{#if !member && accountSlug && viewedName}
			<a class="opacity-60 truncate hover:opacity-100" href="/{accountSlug}/projects"
				>{viewedName}</a
			>
		{/if}
		{#if user}
			<div class="relative" bind:this={menu}>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2 py-1 opacity-90 hover:opacity-100 hover:text-maximumYellow {open
						? 'bg-white/10 opacity-100'
						: ''}"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls="account-menu"
					onclick={() => (open = !open)}
				>
					<span class="i-ph-user-circle text-18px" aria-hidden="true"></span>
					<span class="max-w-40 truncate">{member?.name ?? user.name}</span>
					<span
						class="i-ph-caret-down text-12px transition-transform {open ? 'rotate-180' : ''}"
						aria-hidden="true"
					></span>
				</button>
				{#if open}
					<div
						id="account-menu"
						class="absolute right-0 top-full z-40 mt-2 w-64 rounded-md border border-white/15 bg-oxford-800 py-1 text-15px shadow-lg shadow-black/50"
						role="menu"
						aria-label="Account menu"
					>
						<div class="border-b border-white/10 px-4 py-2">
							<div class="truncate font-600">{user.name}</div>
							{#if user.email}
								<div class="truncate text-13px opacity-70">{user.email}</div>
							{/if}
						</div>
						{#if member}
							<div class="px-4 pt-2 pb-1 text-11px uppercase tracking-wider opacity-60">
								{member.name} · {member.role}
							</div>
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-maximumYellow {active(
									`/${member.slug}/projects`,
								)
									? 'text-maximumYellow'
									: ''}"
								role="menuitem"
								href="/{member.slug}/projects"
								onclick={() => (open = false)}
							>
								<span class="i-ph-folders mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Projects
							</a>
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-maximumYellow {active(
									`/${member.slug}/settings`,
								)
									? 'text-maximumYellow'
									: ''}"
								role="menuitem"
								href="/{member.slug}/settings"
								onclick={() => (open = false)}
							>
								<span class="i-ph-gear mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Account settings
							</a>
						{/if}
						{#if memberships.length > 1}
							<div
								class="mt-1 border-t border-white/10 px-4 pt-2 pb-1 text-11px uppercase tracking-wider opacity-60"
							>
								Switch account
							</div>
							{#each memberships.filter((m) => m.slug !== member?.slug) as m (m.accountId)}
								<a
									class="block px-4 py-1.5 hover:bg-white/10 hover:text-maximumYellow"
									role="menuitem"
									href="/{m.slug}/projects"
									onclick={() => (open = false)}
								>
									<span
										class="i-ph-arrows-left-right mr-2 inline-block align-[-2px]"
										aria-hidden="true"
									></span>{m.name}
									<span class="ml-1 text-11px uppercase tracking-wider opacity-60">{m.role}</span>
								</a>
							{/each}
						{/if}
						<a
							class="mt-1 block border-t border-white/10 px-4 py-1.5 pt-2 hover:bg-white/10 hover:text-maximumYellow {active(
								'/accounts',
							)
								? 'text-maximumYellow'
								: ''}"
							role="menuitem"
							href="/accounts"
							onclick={() => (open = false)}
						>
							<span class="i-ph-users-three mr-2 inline-block align-[-2px]" aria-hidden="true"
							></span>Your accounts
						</a>
						{#if user.isSystemAdmin}
							<a
								class="mt-1 block border-t border-white/10 px-4 py-1.5 pt-2 hover:bg-white/10 hover:text-maximumYellow {active(
									'/admin',
								)
									? 'text-maximumYellow'
									: ''}"
								role="menuitem"
								href="/admin"
								onclick={() => (open = false)}
							>
								<span class="i-ph-shield-check mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Admin
							</a>
						{/if}
						<form class="mt-1 border-t border-white/10 pt-1" {...signOut}>
							<button
								class="block w-full px-4 py-1.5 text-left hover:bg-white/10 hover:text-maximumYellow"
								role="menuitem"
							>
								<span class="i-ph-sign-out mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Sign out
							</button>
						</form>
					</div>
				{/if}
			</div>
		{:else}
			<a class="nav-link" href="/sign-in?next={encodeURIComponent(current)}">Sign in</a>
		{/if}
	</nav>
</header>
