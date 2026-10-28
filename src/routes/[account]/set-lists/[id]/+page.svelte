<script lang="ts">
	import { goto } from "$app/navigation";
	import SetListAdd from "#lib/components/SetListAdd.svelte";
	import SetListRows from "#lib/components/SetListRows.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import { deleteSetList, duplicateSetList, updateSetList } from "#lib/remote/setLists.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatWhen } from "#lib/utils/formatWhen.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * A set list's editor (docs/band-plan.md, "Set list"): its title and
	 * notes, the rows (SetListRows) and the ways to add one (SetListAdd),
	 * the show view, its viewing links, Duplicate and Delete. The rows are
	 * local state, kept from what each command returns; a reload of the
	 * page data (after the title form) starts them over from the server.
	 */
	let { data } = $props();

	let rows = $derived(data.items);
	const form = $derived(updateSetList.for(data.setList.id));
	const base = $derived(`/${data.account.slug}/set-lists`);
	let busy = $state(false);

	async function duplicate() {
		busy = true;
		try {
			const { id } = await duplicateSetList({ id: data.setList.id });
			notify("Set list duplicated");
			await goto(`${base}/${id}`);
		} catch (e) {
			notify(`Could not duplicate the set list: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
	async function remove() {
		if (!confirm(`Delete "${data.setList.title}"? Its rows and viewing links go with it.`)) return;
		busy = true;
		try {
			await deleteSetList({ id: data.setList.id });
			notify("Set list deleted");
			await goto(base);
		} catch (e) {
			notify(`Could not delete the set list: ${errorMessage(e)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle(`${data.setList.title} · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<div class="max-w-article grid gap-6">
		<header class="grid gap-3">
			<p class="text-sm"><a class="link" href={base}>← Set lists</a></p>
			<div class="flex flex-wrap items-center gap-2">
				<a class="button button-sm button-accent" href="{base}/{data.setList.id}/show">
					<span class="i-ph-presentation" aria-hidden="true"></span> Show view
				</a>
				<button
					class="button button-sm"
					type="button"
					title="Viewing links: the show view without signing in"
					popovertarget="set-list-share"
				>
					<span class="i-ph-paper-plane-tilt" aria-hidden="true"></span> Share
				</button>
				<button
					class="button button-sm"
					type="button"
					title="A copy of this set list to change"
					disabled={busy}
					onclick={duplicate}
				>
					<span class="i-ph-copy" aria-hidden="true"></span> Duplicate
				</button>
				<button class="button button-sm ml-auto" type="button" disabled={busy} onclick={remove}>
					<span class="i-ph-trash" aria-hidden="true"></span> Delete
				</button>
			</div>
		</header>

		<form
			class="grid gap-3"
			{...form.enhance(async ({ submit }) => {
				try {
					await submit();
					if (form.result?.ok) notify("Set list saved");
				} catch (e) {
					notify(`Could not save the set list: ${errorMessage(e)}`, { kind: "error" });
				}
			})}
		>
			<input {...form.fields.id.as("hidden", data.setList.id)} />
			<label class="grid gap-1 text-13px text-dim">
				Title
				<input
					class="field app-page-heading py-1"
					{...form.fields.title.as("text", data.setList.title)}
					maxlength="120"
					required
				/>
			</label>
			{#each form.fields.title.issues() ?? [] as issue (issue.message)}
				<p class="text-sm text-red-400">{issue.message}</p>
			{/each}
			<label class="grid gap-1 text-13px text-dim">
				Notes
				<textarea
					class="field min-h-20 text-14px"
					placeholder="Tunings, who brings what, what the venue said"
					maxlength="4000"
					{...form.fields.notes.as("text", data.setList.notes)}></textarea>
			</label>
			{#each form.fields.notes.issues() ?? [] as issue (issue.message)}
				<p class="text-sm text-red-400">{issue.message}</p>
			{/each}
			<div class="flex flex-wrap items-center gap-3">
				<button class="button button-sm" disabled={!!form.pending}>Save</button>
				<span class="text-12px text-dim"
					>Changed {formatWhen(new Date(data.setList.updatedAt))}</span
				>
			</div>
		</form>

		<section class="grid gap-3" aria-labelledby="set-list-rows">
			<h2 class="heading-2 mb-0" id="set-list-rows">
				{rows.length}
				{rows.length === 1 ? "row" : "rows"}
			</h2>
			<SetListRows bind:rows setListId={data.setList.id} accountSlug={data.account.slug} />
			<SetListAdd
				setListId={data.setList.id}
				choices={data.choices}
				onadded={(row) => (rows = [...rows, row])}
			/>
		</section>
	</div>
</main>

<div
	id="set-list-share"
	popover="auto"
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Share "{data.setList.title}"</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="set-list-share"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<p class="mb-3 text-sm text-dim">
		A viewing link opens this set list's show view without signing in, with the charts and lyrics of
		its songs, and nothing else of the account.
	</p>
	<ShareLinks target={{ setListId: data.setList.id }} links={data.shareLinks} isPrivate={true} />
</div>
