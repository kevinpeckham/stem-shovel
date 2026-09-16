<script lang="ts">
	import { setProjectPrivate, setSongPrivate } from "$lib/remote/share.remote";
	import { notify } from "$lib/state/notifications.svelte";

	/** Any member flips a project or song between public and private. */
	interface Props {
		kind: "project" | "song";
		id: string;
		isPrivate: boolean;
		/** A song inside a private project is private whatever its own flag says. */
		inherited?: boolean;
		canChange: boolean;
	}
	let { kind, id, isPrivate, inherited = false, canChange }: Props = $props();
	let form = $derived(kind === "project" ? setProjectPrivate : setSongPrivate);
</script>

<div>
	<h3 class="text-15px font-700">
		<span
			class="mr-1 inline-block align-[-2px] {isPrivate || inherited ? 'i-ph-lock' : 'i-ph-globe'}"
			aria-hidden="true"
		></span>
		{isPrivate || inherited ? "Private" : "Public"}
	</h3>
	<p class="mt-1 text-sm opacity-90">
		{#if inherited}
			The project is private, so this song is too. Make the project public to change that here.
		{:else if isPrivate}
			Only members of the account and people with a viewing link can open this {kind}{kind ===
			"project"
				? " and its songs"
				: ""}.
		{:else}
			Anyone with the address can listen and read. Private means members and viewing links only.
		{/if}
	</p>
	{#if canChange && !inherited}
		<form
			class="mt-2"
			{...form.enhance(async ({ submit }) => {
				await submit();
				if (form.result)
					notify(form.result.isPrivate ? `${kind} is now private` : `${kind} is now public`);
			})}
		>
			<input {...form.fields.id.as("hidden", id)} />
			<input {...form.fields.isPrivate.as("hidden", isPrivate ? "false" : "true")} />
			<button class="button button-sm" disabled={!!form.pending}>
				{form.pending ? "Saving…" : isPrivate ? "Make public" : "Make private"}
			</button>
		</form>
	{/if}
</div>
