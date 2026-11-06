<script lang="ts">
	import { revokeShareLink } from "#lib/remote/share.remote.js";
	import type { AccountShareLink } from "#lib/utils/accountShareLinkOf.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatInviteCode } from "#lib/utils/formatInviteCode.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { page } from "$app/state";

	/**
	 * Every viewing link of an account (/[account]/links): the open ones,
	 * then the rest folded away. Any member copies an open link; an editor
	 * revokes one, as on the page it opens (ShareLinks.svelte).
	 */
	interface Props {
		links: AccountShareLink[];
		canEdit: boolean;
	}
	let { links, canEdit }: Props = $props();

	let open = $derived(links.filter((l) => l.state === "open"));
	let closed = $derived(links.filter((l) => l.state !== "open"));

	/** "2 of 5 used · made Oct 18, 2026 by Kevin · expires … · <note>". */
	function detailsOf(l: AccountShareLink) {
		const uses = `${l.uses}${l.maxUses ? ` of ${l.maxUses}` : ""} used`;
		const made = `made ${formatDate(l.createdAt)} by ${l.createdByName ?? "a former member"}`;
		const expires = l.expiresAt ? `expires ${formatDate(l.expiresAt)}` : "";
		return [uses, made, expires, l.note].filter(Boolean).join(" · ");
	}

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(`${page.url.origin}/s/${code}`);
			notify("Link copied");
		} catch {
			notify("Could not copy the link", { kind: "error" });
		}
	}
</script>

{#snippet actions(l: AccountShareLink)}
	<span class="flex items-center gap-3 text-12px">
		<button type="button" class="link" onclick={() => copy(l.code)}>Copy link</button>
		{#if canEdit}
			{@const revoke = revokeShareLink.for(l.id)}
			<form {...revoke}>
				<input {...revoke.fields.id.as("hidden", l.id)} />
				<button class="link" disabled={!!revoke.pending}>
					{revoke.pending ? "Revoking…" : "Revoke"}
				</button>
			</form>
		{/if}
	</span>
{/snippet}

{#snippet row(l: AccountShareLink)}
	<span class="min-w-0 flex flex-col gap-1">
		<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span class="rounded border border-current/30 px-1 text-10px uppercase tracking-wider"
				>{l.kind}</span
			>
			{#if l.path}
				<a class="link" href={l.path}>{l.title}</a>
			{:else}
				<span>{l.title}</span>
			{/if}
			<code class="font-mono tracking-wider">{formatInviteCode(l.code)}</code>
		</span>
		<span class="text-12px text-dim">
			{detailsOf(l)}
			{#if l.state !== "open"}
				· <span class="uppercase tracking-wider">{l.state}</span>
			{/if}
		</span>
	</span>
	{#if l.state === "open"}
		{@render actions(l)}
	{/if}
{/snippet}

{#snippet rows(list: AccountShareLink[])}
	<ul class="surface divide-y divide-white/10 text-sm">
		{#each list as l (l.id)}
			<li
				class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
				data-testid="share-link-row"
			>
				{@render row(l)}
			</li>
		{/each}
	</ul>
{/snippet}

{#if links.length === 0}
	<p class="text-sm text-dim">
		No viewing links yet. Make one from a song, a project, a session or a set list.
	</p>
{:else}
	<h2 class="heading-2">Open</h2>
	{#if open.length > 0}
		{@render rows(open)}
	{:else}
		<p class="text-sm text-dim">None of them is open now.</p>
	{/if}
	{#if closed.length > 0}
		<h2 class="mt-10 heading-2">No longer open</h2>
		<details>
			<summary class="cursor-pointer text-sm"
				>Revoked, expired and used up ({closed.length})</summary
			>
			<div class="mt-3 opacity-70">{@render rows(closed)}</div>
		</details>
	{/if}
{/if}
