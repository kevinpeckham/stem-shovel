<script lang="ts">
	/** One of an account tile's lists (Projects, Songs, Sessions): the newest entries, each a link with a dim detail, and a link to them all. */
	interface Props {
		heading: string;
		items: { id: string; label: string; href: string; detail: string }[];
		empty: string;
		all: { label: string; href: string };
	}
	let { heading, items, empty, all }: Props = $props();
</script>

<div class="grid content-start gap-2">
	<h3 class="heading-3 mb-0">{heading}</h3>
	{#if items.length === 0}
		<p class="text-14px opacity-80">{empty}</p>
	{:else}
		<ul class="grid gap-2 text-15px" aria-label={heading}>
			{#each items as item (item.id)}
				<li class="min-w-0">
					<a class="link block truncate" href={item.href}>{item.label}</a>
					<span class="block truncate text-13px text-dim opacity-80">{item.detail}</span>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="text-14px"><a class="link-dim" href={all.href}>{all.label}</a></p>
</div>
