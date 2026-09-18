<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatDate } from "$lib/utils/formatDate";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("AI requests · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">AI requests</h1>
	<p class="mt-1 text-sm opacity-90">
		The last 50 calls to the model (the text sent, the reply, whether it parsed, time and tokens).
		The audio itself is not kept.
	</p>
	{#if data.aiRequests.length === 0}
		<p class="mt-2 text-dim">None yet.</p>
	{:else}
		<ul class="mt-3 surface divide-y divide-white/10 text-15px">
			{#each data.aiRequests as r (r.id)}
				<li class="px-5 py-3">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<span>
							<span class="font-600">{r.kind}</span>
							<span class="text-dim">· {r.model}</span>
							{#if r.song}
								· <a
									class="link-dim"
									href="/{r.song.project.account.slug}/projects/{r.song.project.slug}/{r.song.slug}"
									>{r.song.title}</a
								>
							{/if}
						</span>
						<span class="text-13px text-dim">
							{r.user?.name ?? "someone"} · {formatDate(r.createdAt)} · {(
								r.durationMs / 1000
							).toFixed(1)} s{#if r.inputTokens !== null}
								· {r.inputTokens} in / {r.outputTokens ?? 0} out{/if}
							{#if r.error}
								· <span class="text-red-400">{r.error}</span>{/if}
						</span>
					</div>
					{#if r.parsed}
						<p class="mt-1 font-mono text-12px opacity-90">{JSON.stringify(r.parsed)}</p>
					{/if}
					<details class="mt-1 text-12px">
						<summary class="cursor-pointer text-dim">Prompt and reply</summary>
						<pre
							class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{r.prompt}</pre>
						<pre class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{r.response ||
								"(no reply)"}</pre>
					</details>
				</li>
			{/each}
		</ul>
	{/if}
</section>
