<script lang="ts">
	import FieldIssues from "#lib/components/FieldIssues.svelte";
	import { updateVenue } from "#lib/remote/venues.remote.js";
	import type { VenueRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * A venue's shared facts (the venue page's About the venue): name,
	 * address and city, map link and website, read-only unless `canEdit`.
	 */
	let { venue: v, canEdit }: { venue: VenueRow; canEdit: boolean } = $props();

	const about = $derived(updateVenue.for(v.id));
</script>

<form
	class="grid gap-3"
	{...about.enhance(async ({ submit }) => {
		try {
			await submit();
			if (about.result?.ok) notify("Venue saved");
		} catch (err) {
			notify(`Could not save the venue: ${errorMessage(err)}`, { kind: "error" });
		}
	})}
>
	<input {...about.fields.id.as("hidden", v.id)} />
	<fieldset class="m-0 grid min-w-0 gap-3 border-0 p-0" disabled={!canEdit}>
		<label class="grid gap-1 text-13px text-dim">
			Name
			<input
				class="field text-14px"
				{...about.fields.name.as("text", v.name)}
				placeholder="The Echo"
				maxlength="160"
				required
			/>
		</label>
		<FieldIssues issues={about.fields.name.issues()} />
		<div class="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
			<label class="grid gap-1 text-13px text-dim">
				Address
				<input
					class="field text-14px"
					{...about.fields.address.as("text", v.address)}
					placeholder="1822 W Sunset Blvd"
					maxlength="300"
				/>
			</label>
			<label class="grid gap-1 text-13px text-dim">
				City
				<input
					class="field text-14px"
					{...about.fields.city.as("text", v.city)}
					placeholder="Los Angeles"
					maxlength="120"
				/>
			</label>
		</div>
		<FieldIssues
			issues={[...(about.fields.address.issues() ?? []), ...(about.fields.city.issues() ?? [])]}
		/>
		<label class="grid gap-1 text-13px text-dim">
			Map link
			<input
				class="field text-14px"
				{...about.fields.mapUrl.as("url", v.mapUrl)}
				placeholder="https://maps.app.goo.gl/…"
				maxlength="500"
			/>
			<span class="text-12px">Leave it blank and the address is looked up on a map.</span>
		</label>
		<FieldIssues issues={about.fields.mapUrl.issues()} />
		<label class="grid gap-1 text-13px text-dim">
			Website
			<input
				class="field text-14px"
				{...about.fields.websiteUrl.as("url", v.websiteUrl)}
				placeholder="https://…"
				maxlength="500"
			/>
		</label>
		<FieldIssues issues={about.fields.websiteUrl.issues()} />
	</fieldset>
	{#if canEdit}
		<button class="button button-sm button-accent justify-self-start" disabled={!!about.pending}
			>Save</button
		>
	{/if}
</form>
