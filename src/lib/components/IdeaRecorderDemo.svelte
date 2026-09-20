<script lang="ts">
	import DemoRecorder, { type Take } from "$lib/components/DemoRecorder.svelte";
	import { onDestroy } from "svelte";

	/**
	 * The front page's Idea Recorder: the real recorder laid out as on its own
	 * page (recorder and notes side by side from xl, stacked below; no ideas
	 * list), with nothing uploaded. Takes stay
	 * in this page as blobs, numbered as they would be, playable and
	 * downloadable from the ⋯ menu; a reload forgets them. A visitor is told
	 * to sign in to keep takes; a member is sent to their own recorder. No
	 * short-take rule here: a first try is often a two-second test.
	 */
	interface Props {
		signedIn: boolean;
		/** The member's own recorder, when signed in. */
		recorderHref: string | null;
	}
	let { signedIn, recorderHref }: Props = $props();

	let recorder = $state<DemoRecorder | null>(null);
	let ideaCount = $state(1);
	let ideaTitle = $state("Untitled Idea 1");
	let notes = $state("");
	let takes = $state<Take[]>([]);
	let phase = $state("idle");

	function forget(t: Take) {
		if (t.url.startsWith("blob:")) URL.revokeObjectURL(t.url);
	}
	function newIdea() {
		for (const t of takes) forget(t);
		takes = [];
		notes = "";
		ideaCount += 1;
		ideaTitle = `Untitled Idea ${ideaCount}`;
		recorder?.reset();
	}
	onDestroy(() => {
		for (const t of takes) forget(t);
	});
</script>

<div class="grid grid-cols-1 gap-4 sm-gap-x-8 xl-grid-cols-2 xl-grid-rows-[1fr_auto]">
	<DemoRecorder
		bind:this={recorder}
		bind:ideaTitle
		ontitlechange={(t) => (ideaTitle = t || ideaTitle)}
		onphase={(p) => (phase = p)}
		minTakeSeconds={0}
		{takes}
		onpick={(t) => recorder?.load(t)}
		onqueued={(q) => {
			// "Saved" at once: the take is this page's own blob.
			const takeNumber = takes.length + 1;
			const t: Take = {
				id: `demo:${q.localId}`,
				takeNumber,
				title: q.name,
				url: URL.createObjectURL(q.blob),
				playbackUrl: null,
				codec: q.codec,
				durationSeconds: q.durationSeconds,
			};
			takes = [...takes, t];
			recorder?.resolve(q.localId, { id: t.id, takeNumber });
		}}
		ontakename={({ id, title }) => {
			takes = takes.map((t) => (t.id === id ? { ...t, title } : t));
		}}
		ondeletetake={(t) => {
			if (!confirm(`Delete take ${t.takeNumber}?`)) return;
			forget(t);
			takes = takes.filter((x) => x.id !== t.id);
			recorder?.reset();
		}}
		ondeleteidea={() => {
			if (!confirm("Start over? The takes in this demo go.")) return;
			newIdea();
		}}
		onnewidea={newIdea}
		newIdeaDisabled={takes.length === 0 && !notes.trim() && phase === "idle"}
	/>

	<label class="block xl-col-start-2 xl-row-start-1 xl-h-full">
		<span class="sr-only">Notes</span>
		<textarea
			class="block h-full w-full min-h-40 rounded-md border border-current/40 bg-black/40 px-4 py-3 font-mono text-sm leading-relaxed focus:(border-accent outline-none)"
			placeholder="Notes for the idea: lyrics, chords, a tuning…"
			autocomplete="off"
			data-1p-ignore
			data-lpignore="true"
			data-bwignore
			bind:value={notes}></textarea>
	</label>

	<p class="text-13px opacity-80 text-balance xl-col-span-2">
		Note: this demo does not store recordings beyond your current session.
		{#if signedIn && recorderHref}
			<a class="link-dim" href={recorderHref}>Open your Idea Recorder</a>
		{:else}
			<a class="link-dim" href="/sign-in">Sign in</a>
		{/if}
	</p>
</div>
