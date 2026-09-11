<script lang="ts">
	import { page } from "$app/state";

	interface Props {
		account: { name: string };
	}
	let { account }: Props = $props();

	const items = [
		{ label: "Projects", href: "/projects" },
		{ label: "Settings", href: "/settings" },
	];
	let current = $derived(page.url.pathname);
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
	<span class="ml-auto text-13px opacity-60 truncate">{account.name}</span>
</header>
