<script lang="ts">
	import type { Snippet } from "svelte";
	import type { updateEvent } from "#lib/remote/events.remote.js";
	import type { ContactChoice } from "#lib/server/data.js";
	import { centsText } from "#lib/utils/centsText.js";

	/** The event's book fields this section reads, as the row stores them. */
	type BookFields = {
		ticketPrice: string;
		ticketUrl: string;
		ticketsSold: number | null;
		attendance: number | null;
		deal: string;
		promoter: string;
		promoterContact: string;
		promoterContactId: string | null;
		takeCents: number | null;
	};

	/**
	 * "The books" of a show's form (the event page; docs/band-plan.md phase
	 * 4): the ticket price as free text and where to buy, tickets sold and
	 * the head count ("" for not known), the deal, the promoter, and the
	 * take, what the band took home, in the account's currency. The
	 * promoter is one of the account's `contacts` (docs/band-plan.md, "The
	 * band directory"; the picked one's role, phone and email under the
	 * select, and a link to Contacts for an editor), or, for a one-off, the
	 * two text fields: a name and how to reach them. A practice has no
	 * books, so the page renders this for shows only; a viewer sees it
	 * disabled with the rest of the form.
	 */
	let {
		form,
		e,
		issues,
		currency,
		contacts,
		accountSlug,
		canEdit,
	}: {
		form: ReturnType<typeof updateEvent.for>;
		e: BookFields;
		issues: Snippet<[{ message: string }[] | undefined]>;
		currency: string;
		contacts: ContactChoice[];
		accountSlug: string;
		canEdit: boolean;
	} = $props();

	const promoterField = $derived(
		form.fields.promoterContactId.as("select", e.promoterContactId ?? ""),
	);
	/** The picked contact's role, phone and email, for the line under the select. */
	const picked = $derived.by(() => {
		const c = contacts.find(
			(c) => c.id === (form.fields.promoterContactId.value() ?? e.promoterContactId),
		);
		return c ? [c.role, c.phone, c.email].filter(Boolean).join(" · ") : "";
	});

	/** The currency's symbol before the take ("$"), else its code. */
	const symbol = $derived.by(() => {
		try {
			return (
				new Intl.NumberFormat("en-US", { style: "currency", currency })
					.formatToParts(0)
					.find((p) => p.type === "currency")?.value ?? currency
			);
		} catch {
			return currency;
		}
	});
</script>

<section class="grid gap-3" aria-labelledby="event-books">
	<h2 class="heading-2 mb-0" id="event-books">The books</h2>
	<div class="grid gap-3 sm:grid-cols-2">
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Ticket price
				<input
					class="field text-14px"
					{...form.fields.ticketPrice.as("text", e.ticketPrice)}
					placeholder="$10 adv / $12 door"
					maxlength="80"
				/>
			</label>
			{@render issues(form.fields.ticketPrice.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Ticket link
				<input
					class="field text-14px"
					{...form.fields.ticketUrl.as("url", e.ticketUrl)}
					placeholder="https://…"
					maxlength="500"
				/>
			</label>
			{@render issues(form.fields.ticketUrl.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Tickets sold
				<input
					class="field text-14px"
					{...form.fields.ticketsSold.as("text", String(e.ticketsSold ?? ""))}
					inputmode="numeric"
				/>
			</label>
			{@render issues(form.fields.ticketsSold.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Attendance
				<input
					class="field text-14px"
					{...form.fields.attendance.as("text", String(e.attendance ?? ""))}
					inputmode="numeric"
				/>
			</label>
			{@render issues(form.fields.attendance.issues())}
		</div>
		<div class="grid gap-1 sm:col-span-2">
			<label class="grid gap-1 text-13px text-dim">
				The deal
				<input
					class="field text-14px"
					{...form.fields.deal.as("text", e.deal)}
					placeholder="80/20 after the first $300"
					maxlength="400"
				/>
			</label>
			{@render issues(form.fields.deal.issues())}
		</div>
		<div class="grid gap-1">
			<span class="flex items-baseline justify-between gap-2 text-13px text-dim">
				<label for="event-promoter-contact">Promoter</label>
				{#if canEdit}<a class="link" href="/{accountSlug}/contacts">Contacts</a>{/if}
			</span>
			<select class="field text-14px" id="event-promoter-contact" {...promoterField}>
				<option value="">No contact (type one below)</option>
				{#each contacts as c (c.id)}
					<option value={c.id}>{c.name}</option>
				{/each}
			</select>
			{#if picked}<p class="text-13px text-dim">{picked}</p>{/if}
			{@render issues(form.fields.promoterContactId.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Take
				<span class="flex items-center gap-2">
					<span class="text-14px" aria-hidden="true">{symbol}</span>
					<input
						class="field min-w-0 flex-1 text-14px"
						{...form.fields.take.as("text", centsText(e.takeCents))}
						inputmode="decimal"
						placeholder="450"
						aria-describedby="event-take-hint"
					/>
				</span>
				<span class="text-12px" id="event-take-hint">What the band took home</span>
			</label>
			{@render issues(form.fields.take.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				One-off promoter
				<input
					class="field text-14px"
					{...form.fields.promoter.as("text", e.promoter)}
					maxlength="160"
				/>
			</label>
			{@render issues(form.fields.promoter.issues())}
		</div>
		<div class="grid gap-1">
			<label class="grid gap-1 text-13px text-dim">
				Promoter contact
				<input
					class="field text-14px"
					{...form.fields.promoterContact.as("text", e.promoterContact)}
					placeholder="name, phone or email"
					maxlength="400"
				/>
			</label>
			{@render issues(form.fields.promoterContact.issues())}
		</div>
	</div>
</section>
