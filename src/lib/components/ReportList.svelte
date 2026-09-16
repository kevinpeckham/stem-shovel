<script lang="ts">
	import { setBugStatus } from "$lib/remote/bugs.remote";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	/** Bug reports or feature requests on /admin, with close and reopen. */
	interface Props {
		items: {
			id: string;
			title: string;
			body: string;
			status: "open" | "closed";
			pageUrl: string;
			userAgent: string;
			createdAt: Date;
			reporter: { name: string } | null;
		}[];
	}
	let { items }: Props = $props();
</script>

{#if items.length === 0}
	<p class="text-dim">None yet.</p>
{:else}
	<ul class="surface divide-y divide-white/10 text-15px">
		{#each items as b (b.id)}
			{@const toggle = setBugStatus.for(b.id)}
			<li class="px-5 py-3 {b.status === 'closed' ? 'opacity-50' : ''}">
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<span class="font-600">{b.title}</span>
					<span class="text-13px text-dim">
						{b.reporter?.name ?? "someone"} · {formatDate(b.createdAt)}
						{#if b.status === "closed"}
							· <span class="uppercase tracking-wider">closed</span>
						{/if}
					</span>
				</div>
				<p class="mt-1 whitespace-pre-wrap text-sm">{b.body}</p>
				<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13px text-dim">
					{#if b.pageUrl}
						<a class="link-dim truncate max-w-full" href={b.pageUrl}>{b.pageUrl}</a>
					{/if}
					{#if b.userAgent}
						<span class="truncate max-w-full" title={b.userAgent}>{b.userAgent}</span>
					{/if}
					<form
						{...toggle.enhance(async ({ submit }) => {
							await submit();
							if (toggle.result?.status) notify(`Report ${toggle.result.status}`);
						})}
					>
						<input {...toggle.fields.id.as("hidden", b.id)} />
						<input
							{...toggle.fields.status.as("hidden", b.status === "open" ? "closed" : "open")}
						/>
						<button class="link-dim" disabled={!!toggle.pending}>
							{b.status === "open" ? "Close" : "Reopen"}
						</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
{/if}
