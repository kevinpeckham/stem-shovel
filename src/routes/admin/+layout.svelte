<script lang="ts">
	import { page } from "$app/state";

	let { children } = $props();

	// One page per concern, the docs' side-nav layout.
	const SECTIONS = [
		{ slug: "accounts", title: "Accounts" },
		{ slug: "users", title: "Users" },
		{ slug: "invite-codes", title: "Invite codes" },
		{ slug: "waitlist", title: "Waitlist" },
		{ slug: "bug-reports", title: "Bug reports" },
		{ slug: "feature-requests", title: "Feature requests" },
		{ slug: "support-requests", title: "Support requests" },
		{ slug: "ai-requests", title: "AI requests" },
		{ slug: "audit-log", title: "Audit log" },
		{ slug: "home", title: "Home page" },
	] as const;
	let current = $derived(page.url.pathname.split("/")[2] ?? "");
</script>

<main class="page-x-padding pt-6 mb-8 grid gap-8 lg:grid-cols-[220px_1fr]">
	<nav aria-label="Admin" class="text-15px">
		<span class="block mb-3 text-sm font-700 uppercase tracking-wider opacity-80">Admin</span>
		<ul class="grid gap-1">
			{#each SECTIONS as s (s.slug)}
				<li>
					<a
						class="block rounded px-2 py-1 hover:bg-white/10 hover:text-accent {s.slug === current
							? 'bg-white/10 text-accent'
							: 'opacity-80'}"
						href="/admin/{s.slug}"
						aria-current={s.slug === current ? "page" : undefined}>{s.title}</a
					>
				</li>
			{/each}
		</ul>
	</nav>

	<div class="min-w-0 max-w-article">
		{@render children()}
	</div>
</main>
