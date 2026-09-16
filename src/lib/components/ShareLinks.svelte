<script lang="ts">
	import { createShareLink, revokeShareLink } from "$lib/remote/share.remote";
	import { INVITE_CODE_EXPIRY_DAYS } from "$lib/val/InviteCodeSchema";
	import { clearForm } from "$lib/utils/clearForm";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatInviteCode } from "$lib/utils/formatInviteCode";
	import { notify } from "$lib/state/notifications.svelte";
	import { page } from "$app/state";

	/**
	 * Viewing links for one song or one project: the list any member sees in
	 * the share or settings popover, with a form to make one and a revoke
	 * per row. A link is the page's own URL plus `?share=<code>`.
	 */
	interface Link {
		id: string;
		code: string;
		note: string;
		uses: number;
		maxUses: number | null;
		expiresAt: Date | null;
		state: "open" | "revoked" | "expired" | "used up";
	}
	interface Props {
		target: { songId: string } | { projectId: string };
		links: Link[];
		/** Path of the page the link opens, e.g. /mmkk/projects/badverbs/peaceful-dreams. */
		path: string;
		isPrivate: boolean;
	}
	let { target, links, path, isPrivate }: Props = $props();

	const linkFor = (code: string) => `${page.url.origin}${path}?share=${code}`;
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			notify("Link copied");
		} catch {
			notify("Could not copy the link", { kind: "error" });
		}
	}
	let open = $derived(links.filter((l) => l.state === "open"));
</script>

<div>
	<h3 class="text-15px font-700">Viewing links</h3>
	<p class="mt-1 text-sm opacity-90">
		{#if isPrivate}
			This is private: only members and people with one of these links can open it.
		{:else}
			This is public, so anyone with the address can already open it. Links matter once it is made
			private; they keep working either way.
		{/if}
	</p>
	<form
		class="mt-2 flex flex-wrap items-end gap-3"
		{...createShareLink.enhance(async ({ submit, element }) => {
			await submit();
			if (createShareLink.result?.code) {
				notify("Viewing link created");
				clearForm(createShareLink);
				element.reset();
			}
		})}
	>
		{#if "songId" in target}
			<input {...createShareLink.fields.songId.as("hidden", target.songId)} />
		{:else}
			<input {...createShareLink.fields.projectId.as("hidden", target.projectId)} />
		{/if}
		<label class="block grow">
			<span class="text-13px text-dim">Note (optional)</span>
			<input
				class="mt-1 field"
				type="text"
				autocomplete="off"
				placeholder="who it is for"
				{...createShareLink.fields.note.as("text")}
			/>
		</label>
		<label class="block w-24">
			<span class="text-13px text-dim">Max uses</span>
			<input
				class="mt-1 field"
				type="number"
				min="1"
				max="10000"
				placeholder="∞"
				{...createShareLink.fields.maxUses.as("text")}
			/>
		</label>
		<label class="block">
			<span class="text-13px text-dim">Expires</span>
			<select class="mt-1 field" {...createShareLink.fields.expiresDays.as("select", "0")}>
				{#each INVITE_CODE_EXPIRY_DAYS as days (days)}
					<option value={String(days)}>{days === 0 ? "never" : `in ${days} days`}</option>
				{/each}
			</select>
		</label>
		<button class="button-accent" disabled={!!createShareLink.pending}>
			{createShareLink.pending ? "Creating…" : "New link"}
		</button>
	</form>
	{#each createShareLink.fields.allIssues() ?? [] as issue (issue.message)}
		<p class="mt-2 text-sm text-red-400">{issue.message}</p>
	{/each}
	{#if links.length > 0}
		<ul class="mt-3 surface divide-y divide-white/10 text-sm">
			{#each links as l (l.id)}
				{@const revoke = revokeShareLink.for(l.id)}
				<li
					class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2 {l.state ===
					'open'
						? ''
						: 'opacity-50'}"
				>
					<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
						<code class="font-mono tracking-wider">{formatInviteCode(l.code)}</code>
						<span class="text-12px text-dim">
							{l.uses}{l.maxUses === null ? "" : ` of ${l.maxUses}`} used
							{#if l.expiresAt}
								· expires {formatDate(l.expiresAt)}
							{/if}
							{#if l.note}
								· {l.note}
							{/if}
							{#if l.state !== "open"}
								· <span class="uppercase tracking-wider">{l.state}</span>
							{/if}
						</span>
					</span>
					{#if l.state === "open"}
						<span class="flex items-center gap-3 text-12px">
							<button type="button" class="link-dim" onclick={() => copy(linkFor(l.code))}
								>Copy link</button
							>
							<form {...revoke}>
								<input {...revoke.fields.id.as("hidden", l.id)} />
								<button class="link-dim" disabled={!!revoke.pending}>
									{revoke.pending ? "Revoking…" : "Revoke"}
								</button>
							</form>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	{:else if open.length === 0}
		<p class="mt-2 text-12px text-dim">No links yet.</p>
	{/if}
</div>
