<script lang="ts">
	import { goto } from "$app/navigation";
	import EventSessions from "#lib/components/EventSessions.svelte";
	import EventSets from "#lib/components/EventSets.svelte";
	import EventWhenWhere from "#lib/components/EventWhenWhere.svelte";
	import { deleteEvent, updateEvent } from "#lib/remote/events.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatWhen } from "#lib/utils/formatWhen.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { dayText } from "#lib/utils/sessionName.js";
	import { EVENT_KIND_LABELS, type EventKind } from "#lib/val/EventSchema.js";

	/**
	 * A show or practice (docs/band-plan.md, "Event"): when and where and the
	 * notes in one form (a viewer of the account sees it disabled, the notes
	 * rendered), the sets (EventSets) and the tapes (EventSessions), and
	 * Delete. The sets and sessions are local state, kept from what each
	 * command returns; a save of the form reloads the page data and starts
	 * them over from the server.
	 */
	let { data } = $props();

	const form = $derived(updateEvent.for(data.event.id));
	const e = $derived(data.event);
	/** The kind as chosen in the form, before it is saved: a practice has no load-in or sound check. */
	let kind = $derived<EventKind>(data.event.kind);
	const show = $derived(kind === "show");
	const noun = $derived(data.event.kind === "show" ? "show" : "practice");
	const listHref = $derived(`/${data.account.slug}/${data.event.kind}s`);
	const name = $derived(e.title.trim() || e.venue.trim() || `Untitled ${noun}`);

	let sets = $derived(data.sets);
	let sessions = $derived(data.sessions);
	let sessionChoices = $derived(data.sessionChoices);
	let busy = $state(false);

	async function remove() {
		if (!confirm(`Delete this ${noun}? Its sets and sessions stay; only the calendar entry goes.`))
			return;
		busy = true;
		try {
			await deleteEvent({ id: data.event.id });
			notify(`${EVENT_KIND_LABELS[data.event.kind]} deleted`);
			await goto(listHref);
		} catch (err) {
			notify(`Could not delete the ${noun}: ${errorMessage(err)}`, { kind: "error" });
			busy = false;
		}
	}
</script>

{#snippet issues(list: { message: string }[] | undefined)}
	{#each list ?? [] as issue (issue.message)}
		<p class="text-sm text-red-400">{issue.message}</p>
	{/each}
{/snippet}

<svelte:head>
	<title>{pageTitle(`${name} · ${dayText(e.startsOn)} · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<div class="max-w-article grid gap-6">
		<header class="flex flex-wrap items-center gap-2">
			<p class="text-sm">
				<a class="link" href={listHref}>← {data.event.kind === "show" ? "Shows" : "Practices"}</a>
			</p>
			{#if data.canEdit}
				<button class="button button-sm ml-auto" type="button" disabled={busy} onclick={remove}>
					<span class="i-ph-trash" aria-hidden="true"></span> Delete
				</button>
			{/if}
		</header>

		<form
			class="grid gap-6"
			{...form.enhance(async ({ submit }) => {
				try {
					await submit();
					if (form.result?.ok) notify(`${EVENT_KIND_LABELS[kind]} saved`);
				} catch (err) {
					notify(`Could not save the ${noun}: ${errorMessage(err)}`, { kind: "error" });
				}
			})}
		>
			<input {...form.fields.id.as("hidden", e.id)} />
			<fieldset class="m-0 grid min-w-0 gap-6 border-0 p-0" disabled={!data.canEdit}>
				<label class="grid gap-1 text-13px text-dim">
					Title
					<input
						class="field app-page-heading py-1"
						{...form.fields.title.as("text", e.title)}
						placeholder={show ? "with The Night Shift" : "Full run-through"}
						maxlength="160"
					/>
				</label>
				{@render issues(form.fields.title.issues())}

				<EventWhenWhere {form} {e} bind:kind {issues} />

				<section class="grid gap-3" aria-labelledby="event-notes">
					<h2 class="heading-2 mb-0" id="event-notes">Notes</h2>
					{#if data.canEdit}
						<label class="grid gap-1 text-13px text-dim">
							<span class="sr-only">Notes</span>
							<textarea
								class="field min-h-28 text-14px"
								placeholder="The plan for the night, then how it went (Markdown)"
								maxlength="20000"
								{...form.fields.notes.as("text", e.notes)}></textarea>
						</label>
						{@render issues(form.fields.notes.issues())}
					{:else if data.notesHtml}
						<article class="chart-body">
							<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
							{@html data.notesHtml}
						</article>
					{:else}
						<p class="text-14px text-dim">No notes.</p>
					{/if}
				</section>
			</fieldset>
			{#if data.canEdit}
				<div class="flex flex-wrap items-center gap-3">
					<button class="button button-sm button-accent" disabled={!!form.pending}>Save</button>
					<span class="text-12px text-dim">Changed {formatWhen(new Date(e.updatedAt))}</span>
				</div>
			{/if}
		</form>

		<section class="grid gap-3" aria-labelledby="event-sets">
			<h2 class="heading-2 mb-0" id="event-sets">Set lists</h2>
			<EventSets
				bind:sets
				eventId={e.id}
				accountSlug={data.account.slug}
				choices={data.setListChoices}
				canEdit={data.canEdit}
			/>
		</section>

		<section class="grid gap-3" aria-labelledby="event-tapes">
			<h2 class="heading-2 mb-0" id="event-tapes">Recordings</h2>
			<EventSessions
				bind:sessions
				bind:choices={sessionChoices}
				eventId={e.id}
				accountSlug={data.account.slug}
				canEdit={data.canEdit}
			/>
		</section>
	</div>
</main>
