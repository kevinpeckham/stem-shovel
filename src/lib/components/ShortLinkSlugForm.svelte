<script lang="ts">
	import { setShortLinkSlug } from "#lib/remote/shortLinks.remote.js";
	import { SHORT_LINK_SLUG_MAX, ShortLinkSlugSchema } from "#lib/val/ShortLinkSchema.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { refreshAll } from "$app/navigation";
	import * as v from "valibot";

	/**
	 * A custom address for one short link (/settings/links): the slug input
	 * after the short origin, prefilled when the code already is one. The
	 * form remembers its values per link; the row clears it on opening.
	 */
	let {
		linkId,
		code,
		before,
		onclose,
	}: {
		linkId: string;
		code: string;
		/** The short origin as the address shows it, before the slug. */
		before: string;
		onclose: () => void;
	} = $props();
	const slugForm = $derived(setShortLinkSlug.for(linkId));
	/** A code that is already a custom address (lowercase, slug-shaped) is the input's starting value. */
	let current = $derived(
		code === code.toLowerCase() && v.is(ShortLinkSlugSchema, code) ? code : "",
	);
</script>

<form
	class="mt-3 grid gap-2"
	{...slugForm.enhance(async ({ submit }) => {
		try {
			await submit();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		if (slugForm.result) {
			notify("Custom address saved");
			onclose();
			await refreshAll();
		}
	})}
>
	<input {...slugForm.fields.linkId.as("hidden", linkId)} />
	<label class="block">
		<span class="text-sm opacity-90">Custom address</span>
		<span class="mt-1 flex max-w-md items-center rounded border border-white/15 bg-black/20">
			<span class="truncate pl-3 text-sm text-dim">{before}</span>
			<input
				class="block w-full min-w-0 bg-transparent py-2 pr-3 font-mono text-sm"
				{...slugForm.fields.slug.as("text", current)}
				placeholder="my-band"
				maxlength={SHORT_LINK_SLUG_MAX}
				autocomplete="off"
				autocapitalize="none"
				spellcheck="false"
				required
			/>
		</span>
	</label>
	{#each slugForm.fields.allIssues() ?? [] as issue (issue.message)}
		<p class="text-sm text-red-400">{issue.message}</p>
	{/each}
	<p class="text-xs opacity-80">
		Lowercase letters, digits and hyphens. The address it has now stops working.
	</p>
	<div class="flex items-center gap-4">
		<button class="button button-sm" disabled={!!slugForm.pending}>
			{slugForm.pending ? "Saving…" : "Save"}
		</button>
		<button class="text-sm link-dim" type="button" onclick={onclose}>Cancel</button>
	</div>
</form>
