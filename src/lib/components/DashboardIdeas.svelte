<script lang="ts">
	import { formatWhen } from "#lib/utils/formatWhen.js";

	/**
	 * The person's newest ideas of one kind on the dashboard (Your ideas,
	 * Your loops, Your multitrack recordings), each a link into the tool
	 * that made it; with none, a card that sends them there.
	 */
	interface Props {
		id: string;
		heading: string;
		ideas: { id: string; title: string; createdAt: Date }[];
		href: (id: string) => string;
		empty: string;
		action: { label: string; href: string };
	}
	let { id, heading, ideas, href, empty, action }: Props = $props();
</script>

<section class="grid gap-3" aria-labelledby={id}>
	<h2 class="heading-2 mb-0" {id}>{heading}</h2>
	{#if ideas.length === 0}
		<div class="surface grid justify-items-start gap-3 p-5">
			<p class="text-15px opacity-90">{empty}</p>
			<a class="button-accent button-sm" href={action.href}>{action.label}</a>
		</div>
	{:else}
		<ul class="surface divide-y divide-white/10 text-15px" aria-label={heading}>
			{#each ideas as idea (idea.id)}
				<li class="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2">
					<a class="link" href={href(idea.id)}>{idea.title || "Untitled"}</a>
					<span class="text-12px opacity-60">{formatWhen(idea.createdAt)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
