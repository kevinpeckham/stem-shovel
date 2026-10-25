<script lang="ts">
	import ShortLinkSlugForm from "#lib/components/ShortLinkSlugForm.svelte";
	import { revokeShortLink, setShortLinkSlug } from "#lib/remote/shortLinks.remote.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { SHORT_LINK_KIND_LABELS } from "#lib/constants/shortLinkKinds.js";
	import type { ShortLinkKind } from "#lib/val/ShortLinkSchema.js";
	import { shortLinkDestination } from "#lib/utils/shortLinkDestination.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { refreshAll } from "$app/navigation";

	/**
	 * One of the user's short links on /settings/links: its address, where
	 * it goes (the full target in the title), visits and dates, and Copy,
	 * Custom address and Revoke.
	 */
	let {
		link,
		address,
	}: {
		link: {
			id: string;
			code: string;
			target: string;
			kind: ShortLinkKind;
			hits: number;
			lastHitAt: Date | null;
			expiresAt: Date | null;
			createdAt: Date;
		};
		/** The full address of a code, as the mint hands it out. */
		address: (code: string) => string;
	} = $props();
	let editing = $state(false);
	/** The address without a code or scheme, before the slug input. */
	let prefix = $derived(address("").replace(/^https?:\/\//, ""));
	let busy = $state(false);
	let where = $derived(shortLinkDestination(link.target, link.kind));
	let visits = $derived(
		`${link.hits === 1 ? "1 visit" : `${link.hits} visits`}${link.lastHitAt ? `, last ${formatDate(link.lastHitAt)}` : ""}`,
	);

	async function copy() {
		try {
			await navigator.clipboard.writeText(address(link.code));
			notify("Link copied");
		} catch {
			notify("Could not copy the link", { kind: "error" });
		}
	}
	async function revoke() {
		busy = true;
		try {
			await revokeShortLink({ id: link.id });
			notify("Link revoked");
			await refreshAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = false;
		}
	}
</script>

<li class="surface px-4 py-3">
	<div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 sm:flex-nowrap">
		<div class="min-w-0">
			<div class="truncate font-mono text-15px">
				<span class="i-ph-link mr-1 inline-block align-[-2px] text-accent" aria-hidden="true"
				></span>{address(link.code).replace(/^https?:\/\//, "")}
			</div>
			<div class="mt-0.5 truncate text-sm" title={link.target}>
				{where.name ?? where.path}
				{#if where.name}<span class="text-dim">· {where.path}</span>{/if}
			</div>
			<div class="mt-0.5 text-13px text-dim">
				{where.name ? "" : `${SHORT_LINK_KIND_LABELS[link.kind]} · `}{visits} · made {formatDate(
					link.createdAt,
				)} · expires
				{link.expiresAt ? formatDate(link.expiresAt) : "never"}
			</div>
		</div>
		<div class="flex shrink-0 items-center gap-3 text-13px">
			<button type="button" class="link-dim" onclick={copy}>Copy</button>
			<button
				type="button"
				class="link-dim"
				aria-expanded={editing}
				onclick={() => {
					// Opening starts from the link as it is, never from the last attempt.
					if (!editing) clearForm(setShortLinkSlug.for(link.id));
					editing = !editing;
				}}>Custom address</button
			>
			<button type="button" class="text-red-400 hover:underline" disabled={busy} onclick={revoke}
				>Revoke</button
			>
		</div>
	</div>
	{#if editing}
		<ShortLinkSlugForm
			linkId={link.id}
			code={link.code}
			before={prefix}
			onclose={() => (editing = false)}
		/>
	{/if}
</li>
