<script lang="ts">
	import { signOut } from "$lib/remote/auth.remote";
	import { page } from "$app/state";
	import { default as wordmark } from "$lib/assets/stem-shovel-wordmark.svg";
	import TuningForkIcon from "./TuningForkIcon.svelte";

	interface Props {
		/** Hide the header (a phone layout that needs the whole viewport). */
		collapsed?: boolean;
		user: { name: string; email?: string; isSystemAdmin?: boolean } | null;
		/** Accounts the user belongs to; the current one is in the URL. */
		memberships: {
			accountId: string;
			slug: string;
			name: string;
			role: string;
			actingAs?: boolean;
		}[];
		/** The user's own account for pages outside any account (src/lib/server/currentAccount.ts). */
		currentSlug?: string | null;
		/** Unread inbox items: a badge on the account button and the Inbox item. */
		unread?: number;
	}
	let {
		collapsed = $bindable(false),
		user,
		memberships,
		currentSlug = null,
		unread = 0,
	}: Props = $props();

	let own = $derived(memberships.filter((m) => !m.actingAs));
	let accountSlug = $derived(page.params.account ?? currentSlug ?? own[0]?.slug);
	let member = $derived(memberships.find((m) => m.slug === accountSlug));
	let current = $derived(page.url.pathname);
	// A visitor sees the name of the account they are viewing.
	let viewedName = $derived((page.data.account?.name as string | undefined) ?? "");

	// Two menus: Tools (everyone, every width: the Idea Recorder for a member,
	// and the tuner, metronome and drum machine) and the account menu,
	// everything a signed-in user can reach behind one button instead of a row
	// of links. One open at a time; outside click or Escape closes it.
	let openMenu = $state<"tools" | "account" | null>(null);
	let open = $derived(openMenu === "account");
	let toolsOpen = $derived(openMenu === "tools");
	let menu = $state<HTMLDivElement | null>(null);
	let toolsMenu = $state<HTMLDivElement | null>(null);
	function onwindowpointerdown(e: PointerEvent) {
		const t = e.target as Node;
		if (openMenu === "account" && menu && !menu.contains(t)) openMenu = null;
		if (openMenu === "tools" && toolsMenu && !toolsMenu.contains(t)) openMenu = null;
	}
	function onwindowkeydown(e: KeyboardEvent) {
		if (e.key === "Escape") openMenu = null;
	}
	const active = (href: string) => current === href || current.startsWith(`${href}/`);
	const TOOL_PAGES = ["/tuner", "/metronome", "/drum-machine"];
	let onToolPage = $derived(
		TOOL_PAGES.some(active) || (member ? active(`/${member.slug}/ideas/recorder`) : false),
	);
</script>

<svelte:window onpointerdown={onwindowpointerdown} onkeydown={onwindowkeydown} />

<header
	class="page-x-padding flex items-center justify-between gap-6 py-4 border-b border-white/10 {collapsed
		? 'max-h-0 overflow-hidden !py-0'
		: ''}"
>
	<a
		class="font-brand text-accent text-20px md-text-24px lg-text-28px leading-none tracking-wide flex shrink-0 items-baseline gap-2"
		href="/"
		title="Back to home"
	>
		<img class="h-6 w-auto" src={wordmark} loading="eager" alt="Stem Shovel wordmark" />
		<div class="sr-only">Stem Shovel App</div>
		<!-- The image's baseline is its bottom edge, where the wordmark's letters sit. -->
		<span class="text-12px uppercase leading-none tracking-wider opacity-80 text-blue-100"
			>Beta</span
		>
	</a>
	<nav aria-label="Primary" class="flex items-center gap-4 text-15px">
		{#if !member && accountSlug && viewedName}
			<a class="opacity-60 truncate hover:opacity-100" href="/{accountSlug}/projects"
				>{viewedName}</a
			>
		{/if}
		{#if user && member}
			<!-- Where a member goes most; the rest is in the menus. Hidden on a phone, where the account menu has it. -->
			<a
				class="nav-link hidden sm-inline-block {active(`/${member.slug}/projects`)
					? 'text-accent !decoration-current'
					: ''}"
				href="/{member.slug}/projects">Projects</a
			>
		{/if}
		<!-- The tools: the Idea Recorder for a member, and the three free tools for everyone. -->
		<div class="relative" bind:this={toolsMenu}>
			<button
				type="button"
				class="flex items-center gap-1.5 rounded px-2 py-1 opacity-90 hover:opacity-100 hover:text-accent {toolsOpen
					? 'bg-white/10 opacity-100'
					: ''} {onToolPage ? 'text-accent' : ''}"
				aria-haspopup="menu"
				aria-expanded={toolsOpen}
				aria-controls="tools-menu"
				aria-label="Tools"
				onclick={() => (openMenu = toolsOpen ? null : "tools")}
			>
				<span class="i-ph-wrench text-18px" aria-hidden="true"></span>
				<!-- A phone has room for the wrench alone beside the account button. -->
				<span class="hidden sm-inline">Tools</span>
				<span
					class="i-ph-caret-down text-12px transition-transform {toolsOpen ? 'rotate-180' : ''}"
					aria-hidden="true"
				></span>
			</button>
			{#if toolsOpen}
				<div
					id="tools-menu"
					class="absolute right-0 top-full z-40 mt-2 w-56 rounded-md border border-white/15 bg-oxford-800 py-1 text-15px shadow-lg shadow-black/50"
					role="menu"
					aria-label="Tools menu"
				>
					{#if member}
						<a
							class="flex items-center gap-2 px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
								`/${member.slug}/ideas/recorder`,
							)
								? 'text-accent'
								: ''}"
							role="menuitem"
							href="/{member.slug}/ideas/recorder"
							onclick={() => (openMenu = null)}
						>
							<span class="i-ph-microphone w-1em" aria-hidden="true"></span>Idea Recorder
						</a>
					{/if}
					<a
						class="flex items-center gap-2 px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
							'/tuner',
						)
							? 'text-accent'
							: ''}"
						role="menuitem"
						href="/tuner"
						onclick={() => (openMenu = null)}
					>
						<TuningForkIcon />Tuner
					</a>
					<a
						class="flex items-center gap-2 px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
							'/metronome',
						)
							? 'text-accent'
							: ''}"
						role="menuitem"
						href="/metronome"
						onclick={() => (openMenu = null)}
					>
						<span class="i-ph-metronome w-1em" aria-hidden="true"></span>Metronome
					</a>
					<a
						class="flex items-center gap-2 px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
							'/drum-machine',
						)
							? 'text-accent'
							: ''}"
						role="menuitem"
						href="/drum-machine"
						onclick={() => (openMenu = null)}
					>
						<span class="i-ph-dots-nine w-1em" aria-hidden="true"></span>Drum Machine
					</a>
				</div>
			{/if}
		</div>
		{#if user}
			<div class="relative" bind:this={menu}>
				<button
					type="button"
					class="flex items-center gap-1.5 rounded px-2 py-1 opacity-90 hover:opacity-100 hover:text-accent {open
						? 'bg-white/10 opacity-100'
						: ''}"
					aria-haspopup="menu"
					aria-expanded={open}
					aria-controls="account-menu"
					onclick={() => (openMenu = open ? null : "account")}
				>
					<span class="i-ph-user-circle text-18px" aria-hidden="true"></span>
					<span class="max-w-40 truncate">{member?.name ?? user.name}</span>
					{#if unread > 0}
						<span
							class="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-11px font-700 leading-none text-oxford"
							aria-label="{unread} unread {unread === 1 ? 'notification' : 'notifications'}"
							>{unread > 99 ? "99+" : unread}</span
						>
					{/if}
					{#if member?.actingAs}
						<span
							class="rounded bg-red-400/20 px-1.5 py-0.5 text-10px uppercase tracking-wider text-red-300"
							title="You are not a member here; as a super admin you act as its owner, and every action is logged"
							>acting as owner</span
						>
					{/if}
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
						<a
							class="mt-1 flex items-center px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
								'/inbox',
							)
								? 'text-accent'
								: ''}"
							role="menuitem"
							href="/inbox"
							onclick={() => (openMenu = null)}
						>
							<span class="i-ph-tray mr-2 inline-block align-[-2px]" aria-hidden="true"></span>Inbox
							{#if unread > 0}
								<span
									class="ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-11px font-700 leading-none text-oxford"
									>{unread > 99 ? "99+" : unread}</span
								>
							{/if}
						</a>
						{#if member}
							<div class="px-4 pt-2 pb-1 text-11px uppercase tracking-wider opacity-60">
								{member.name} · {member.actingAs ? "acting as owner" : member.role}
							</div>
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
									`/${member.slug}/projects`,
								)
									? 'text-accent'
									: ''}"
								role="menuitem"
								href="/{member.slug}/projects"
								onclick={() => (openMenu = null)}
							>
								<span class="i-ph-folders mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Projects
							</a>
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
									`/${member.slug}/ideas/recorder`,
								)
									? 'text-accent'
									: ''}"
								role="menuitem"
								href="/{member.slug}/ideas/recorder"
								onclick={() => (openMenu = null)}
							>
								<span class="i-ph-microphone mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Idea Recorder
							</a>
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
									`/${member.slug}/settings`,
								)
									? 'text-accent'
									: ''}"
								role="menuitem"
								href="/{member.slug}/settings"
								onclick={() => (openMenu = null)}
							>
								<span class="i-ph-gear mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Account settings
							</a>
						{/if}
						{#if own.length > 1 || (member?.actingAs && own.length > 0)}
							<div
								class="mt-1 border-t border-white/10 px-4 pt-2 pb-1 text-11px uppercase tracking-wider opacity-60"
							>
								Switch account
							</div>
							{#each own.filter((m) => m.slug !== member?.slug) as m (m.accountId)}
								<a
									class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent"
									role="menuitem"
									href="/{m.slug}/projects"
									onclick={() => (openMenu = null)}
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
							class="mt-1 block border-t border-white/10 px-4 py-1.5 pt-2 hover:bg-white/10 hover:text-accent {active(
								'/accounts',
							)
								? 'text-accent'
								: ''}"
							role="menuitem"
							href="/accounts"
							onclick={() => (openMenu = null)}
						>
							<span class="i-ph-users-three mr-2 inline-block align-[-2px]" aria-hidden="true"
							></span>Your accounts
						</a>
						{#if own.length > 0}
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent"
								role="menuitem"
								href="/accounts?new=1"
								onclick={() => (openMenu = null)}
							>
								<span class="i-ph-plus-circle mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>New account
							</a>
						{/if}
						<a
							class="mt-1 block border-t border-white/10 px-4 py-1.5 pt-2 hover:bg-white/10 hover:text-accent {active(
								'/settings/security',
							)
								? 'text-accent'
								: ''}"
							role="menuitem"
							href="/settings/security"
							onclick={() => (openMenu = null)}
						>
							<span class="i-ph-lock-key mr-2 inline-block align-[-2px]" aria-hidden="true"
							></span>Security
						</a>
						<a
							class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent {active(
								'/settings/notifications',
							)
								? 'text-accent'
								: ''}"
							role="menuitem"
							href="/settings/notifications"
							onclick={() => (openMenu = null)}
						>
							<span class="i-ph-bell mr-2 inline-block align-[-2px]" aria-hidden="true"
							></span>Notifications
						</a>
						{#if user.isSystemAdmin}
							<a
								class="block px-4 py-1.5 hover:bg-white/10 hover:text-accent {active('/admin')
									? 'text-accent'
									: ''}"
								role="menuitem"
								href="/admin"
								onclick={() => (openMenu = null)}
							>
								<span class="i-ph-shield-check mr-2 inline-block align-[-2px]" aria-hidden="true"
								></span>Admin
							</a>
						{/if}
						<form class="mt-1 border-t border-white/10 pt-1" {...signOut}>
							<button
								class="block w-full px-4 py-1.5 text-left hover:bg-white/10 hover:text-accent"
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
			<a
				class="nav-link hidden sm-inline-block {active('/pricing')
					? 'text-accent !decoration-current'
					: ''}"
				href="/pricing">Pricing</a
			>
			<a class="nav-link" href="/sign-in?next={encodeURIComponent(current)}">Sign in</a>
			<!-- The call to action: a small solid accent button. A phone has room for one link beside the logo, so Pricing and Sign up hide there (both are in the footer and on the front page). -->
			<a class="button-accent-solid button-sm hidden sm-flex" href="/sign-up">Sign up</a>
		{/if}
	</nav>
</header>
