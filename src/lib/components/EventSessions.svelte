<script lang="ts">
	import { linkEventSession } from "#lib/remote/events.remote.js";
	import type { SessionKind } from "#lib/constants/sessionRecordings.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { sessionChoiceLabel } from "#lib/utils/sessionChoiceLabel.js";
	import EventSessionRow from "./EventSessionRow.svelte";

	/**
	 * An event's tapes (docs/band-plan.md, "Event"): the recording sessions
	 * tied to it, each linking to its page with Unlink, and a session of the
	 * account to link (one tied to another event moves here). The lists are
	 * local state kept from what each command returns; a session linked here
	 * has no recording count until the page loads again.
	 */
	type Session = {
		id: string;
		name: string;
		kind: SessionKind;
		place: string;
		startsOn: string;
		recordingCount?: number;
	};
	type Choice = Omit<Session, "recordingCount"> & { eventId: string | null };
	interface Props {
		sessions: Session[];
		choices: Choice[];
		eventId: string;
		accountSlug: string;
		canEdit: boolean;
	}
	let {
		sessions = $bindable(),
		choices = $bindable(),
		eventId,
		accountSlug,
		canEdit,
	}: Props = $props();

	const linkable = $derived(choices.filter((c) => !sessions.some((s) => s.id === c.id)));
	let picked = $state("");
	let busy = $state(false);

	/** Runs a link or unlink, the controls disabled meanwhile; a failure is a notification. */
	async function run(verb: "link" | "unlink", work: () => Promise<void>) {
		busy = true;
		try {
			await work();
		} catch (e) {
			notify(`Could not ${verb} the session: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
	/** The choice's event as the server now has it. */
	function retie(sessionId: string, to: string | null) {
		choices = choices.map((c) => (c.id === sessionId ? { ...c, eventId: to } : c));
	}
	function link(sessionId: string) {
		return run("link", async () => {
			await linkEventSession({ eventId, sessionId, linked: true });
			retie(sessionId, eventId);
			const c = choices.find((c) => c.id === sessionId);
			if (c) sessions = [...sessions, c].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
			picked = "";
		});
	}
	function unlink(sessionId: string) {
		return run("unlink", async () => {
			await linkEventSession({ eventId, sessionId, linked: false });
			retie(sessionId, null);
			sessions = sessions.filter((s) => s.id !== sessionId);
		});
	}
</script>

{#if sessions.length === 0}
	<p class="text-14px text-dim">
		No sessions linked. Record one from the <a class="link" href="/{accountSlug}/sessions"
			>Sessions</a
		>
		page and link it here.
	</p>
{:else}
	<ul class="grid gap-2" aria-label="Linked sessions">
		{#each sessions as s (s.id)}
			<EventSessionRow session={s} {accountSlug} {canEdit} {busy} onunlink={() => unlink(s.id)} />
		{/each}
	</ul>
{/if}

{#if canEdit && linkable.length > 0}
	<div class="flex flex-wrap items-end gap-2">
		<label class="grid min-w-0 flex-1 gap-1 text-13px text-dim sm:max-w-sm">
			Link a session
			<select class="field text-14px" bind:value={picked}>
				<option value="" disabled>Choose a session</option>
				{#each linkable as c (c.id)}
					<option value={c.id}>{sessionChoiceLabel(c, eventId)}</option>
				{/each}
			</select>
		</label>
		<button
			class="button button-sm"
			type="button"
			disabled={!picked || busy}
			onclick={() => link(picked)}
		>
			<span class="i-ph-link" aria-hidden="true"></span> Link
		</button>
	</div>
{/if}
