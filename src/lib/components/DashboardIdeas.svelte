<script lang="ts">
	import { formatWhen } from "#lib/utils/formatWhen.js";

	/** The person's newest ideas on the dashboard; each opens the Idea Recorder, which lists them all. */
	let { ideas }: { ideas: { id: string; title: string; createdAt: Date }[] } = $props();
</script>

<section class="max-w-article grid gap-3" aria-labelledby="dashboard-ideas">
	<h2 class="heading-2 mb-0" id="dashboard-ideas">Your ideas</h2>
	<ul class="surface divide-y divide-white/10 text-15px" aria-label="Your ideas">
		{#each ideas as idea (idea.id)}
			<li class="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2">
				<a class="link" href="/idea-recorder">{idea.title || "Untitled idea"}</a>
				<span class="text-12px opacity-60">{formatWhen(idea.createdAt)}</span>
			</li>
		{/each}
	</ul>
	<p class="text-14px"><a class="link-dim" href="/idea-recorder">All ideas</a></p>
</section>
