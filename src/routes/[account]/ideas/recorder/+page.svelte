<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder, { type Take } from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import IdeaNotesPanel from "$lib/components/IdeaNotesPanel.svelte";
	import { createIdea, deleteIdea, renameIdea, saveIdeaNotes } from "$lib/remote/ideas.remote";
	import { deleteTake, setTakeName } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";
	import { invalidateAll } from "$app/navigation";
	import { untrack } from "svelte";

	let { data } = $props();
	type Idea = (typeof data.ideas)[number];
	type TakeRow = Idea["takes"][number];

	let recorder = $state<DemoRecorder | null>(null);
	/** The idea in the recorder and the notes panel; null = a new idea not yet saved. */
	let ideaId = $state<string | null>(null);
	let idea = $derived(data.ideas.find((i) => i.id === ideaId) ?? null);
	/** The take in the player, when one is. */
	let takeId = $state<string | null>(null);
	let loadedTake = $derived(idea?.takes.find((t) => t.id === takeId) ?? null);
	/** The title in the recorder's field; for an unsaved idea, what it will be created with. */
	let ideaTitle = $state(untrack(() => `Untitled Idea ${data.ideas.length + 1}`));
	/** The notes as the page knows them (the panel autosaves to the idea). */
	let notes = $state("");
	/** Bumped to re-seed the notes panel (another idea, a clear). */
	let notesKey = $state(0);
	let phase = $state("idle");
	let recorderBusy = $derived(
		phase === "recording" || phase === "requesting" || phase === "saving",
	);
	/** A new idea's placeholder: "Untitled Idea N", N counting the user's ideas. */
	const placeholder = () => `Untitled Idea ${data.ideas.length + 1}`;

	/** The current idea's id, creating the idea on first use (a take, notes, a title). */
	async function ensureIdea(): Promise<string> {
		if (ideaId) return ideaId;
		const created = await createIdea({
			accountId: data.account.id,
			title: ideaTitle.trim() || placeholder(),
		});
		ideaId = created.id;
		ideaTitle = created.title;
		await invalidateAll();
		return created.id;
	}

	/** New idea: an empty player, a fresh title, an empty note board; saved on first use. */
	function newIdea() {
		if (recorderBusy || !recorder) return;
		ideaId = null;
		takeId = null;
		notes = "";
		ideaTitle = placeholder();
		notesKey++;
		recorder.reset();
	}

	function show(i: Idea, t: TakeRow | null) {
		if (recorderBusy || !recorder) return;
		const switching = ideaId !== i.id;
		ideaId = i.id;
		ideaTitle = i.title;
		if (switching) {
			notes = i.notes;
			notesKey++;
		}
		if (t) {
			takeId = t.id;
			recorder.load(t);
		} else {
			takeId = null;
			recorder.reset();
		}
		searchOpen = false;
	}

	async function titleChanged(title: string) {
		if (!title) {
			ideaTitle = idea?.title ?? placeholder();
			return;
		}
		if (!ideaId) return; // used when the idea is created
		try {
			await renameIdea({ id: ideaId, title });
			await invalidateAll();
		} catch (e) {
			notify(`Title not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function takeNamed(t: { id: string; title: string }) {
		try {
			await setTakeName(t);
			await invalidateAll();
		} catch (e) {
			notify(`Take name not saved: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function clearNotes() {
		notes = "";
		notesKey++;
		if (ideaId) {
			try {
				await saveIdeaNotes({ id: ideaId, markdown: "" });
				await invalidateAll();
			} catch (e) {
				notify(errorMessage(e), { kind: "error" });
			}
		}
	}
	async function removeTake(t: Take) {
		if (
			!confirm(
				`Delete take ${t.takeNumber}${t.title ? ` “${t.title}”` : ""}? Demos made from it stay on their songs.`,
			)
		)
			return;
		try {
			await deleteTake({ id: t.id });
			notify(`Take ${t.takeNumber} deleted`);
			takeId = null;
			recorder?.reset();
			await invalidateAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ---- search (a popover over the list) ----
	let searchOpen = $state(false);
	let searchText = $state("");
	let hits = $derived.by(() => {
		const q = searchText.trim().toLowerCase();
		if (!q) return [];
		const out: { idea: Idea; take: TakeRow | null; label: string }[] = [];
		for (const i of data.ideas) {
			const inIdea = i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q);
			if (inIdea) out.push({ idea: i, take: null, label: i.title });
			for (const t of i.takes) {
				if (t.title.toLowerCase().includes(q) || `take ${t.takeNumber}`.includes(q)) {
					out.push({
						idea: i,
						take: t,
						label: `${i.title} · Take ${t.takeNumber}${t.title ? ` · ${t.title}` : ""}`,
					});
				}
			}
		}
		return out.slice(0, 30);
	});

	const fmtWhen = (d: Date) =>
		`${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
	const takeLabel = (t: { takeNumber: number; title: string }) =>
		`Take ${t.takeNumber}${t.title ? ` · ${t.title}` : ""}`;
</script>

<svelte:head>
	<title>{pageTitle("Idea Recorder")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="heading-2">Idea Recorder</h1>
		<p class="opacity-90 text-balance">
			An idea is a note board and one or more takes. Stop saves the take; Record starts the next.
			Add a take to a song to make it a demo.
			{#if data.fromSong}
				Opened from <a class="link-dim" href={data.fromSong.href}>{data.fromSong.title}</a>.
			{/if}
		</p>
	</header>

	<!-- Like the song page: the recorder where the player is, the notes where the documents are. -->
	<div class="grid grid-cols-1 gap-8 xl-grid-cols-2">
		<section class="grid grid-cols-1 gap-6 place-content-start h-full w-full" aria-label="Recorder">
			<DemoRecorder
				bind:this={recorder}
				bind:ideaTitle
				{ensureIdea}
				onphase={(p) => (phase = p)}
				ontitlechange={titleChanged}
				ontakename={takeNamed}
				ondeletetake={removeTake}
				onstart={() => (takeId = null)}
				onsaved={async (t) => {
					notify(`Take ${t.takeNumber} saved`);
					takeId = t.id;
					await invalidateAll();
				}}
			/>

			<!-- Ideas, newest first, each opening to its takes; the current one is open. -->
			<div class="grid gap-2" aria-label="Ideas">
				<div class="flex flex-wrap items-center justify-between gap-3">
					<h2 class="heading-3 mb-0">Ideas</h2>
					<div class="flex items-center gap-2">
						<button
							class="button button-xs"
							type="button"
							popovertarget="idea-search"
							title="Search ideas and takes"
						>
							<span class="i-ph-magnifying-glass" aria-hidden="true"></span>
							Search
						</button>
						<button
							class="button button-xs"
							type="button"
							disabled={recorderBusy || (!ideaId && !takeId && phase === "idle")}
							onclick={newIdea}
						>
							<span class="i-ph-plus" aria-hidden="true"></span>
							New idea
						</button>
					</div>
				</div>
				{#if data.ideas.length === 0}
					<p
						class="rounded border border-dashed border-white/15 px-4 py-4 text-center text-sm opacity-90"
					>
						Nothing recorded yet. Your ideas and their takes will list here.
					</p>
				{:else}
					<ul
						class="max-h-[60vh] min-h-64 overflow-y-auto rounded border border-current/40 bg-blue-300/5 divide-y divide-white/10 {recorderBusy
							? 'opacity-60'
							: ''}"
					>
						{#each data.ideas as i (i.id)}
							<li>
								<details open={i.id === ideaId}>
									<summary
										class="grid cursor-pointer grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-4 py-2.5 list-none hover:bg-white/5 [&::-webkit-details-marker]:hidden {i.id ===
										ideaId
											? 'bg-blue-300/10'
											: ''}"
										onclick={(e) => {
											// Choosing the idea shows it (its latest take); the disclosure still toggles.
											if (recorderBusy) e.preventDefault();
											else show(i, i.takes.at(-1) ?? null);
										}}
									>
										<span
											class="i-ph-caret-right inline-block text-12px opacity-70"
											aria-hidden="true"
										></span>
										<span class="min-w-0">
											<span class="block truncate font-500">{i.title}</span>
											<span class="block truncate text-12px opacity-70">
												{fmtWhen(i.createdAt)}{#if i.notes.trim()}
													· {i.notes.trim().split("\n")[0].slice(0, 60)}{/if}
											</span>
										</span>
										<span class="text-sm tabular-nums opacity-80"
											>{i.takes.length} {i.takes.length === 1 ? "take" : "takes"}</span
										>
									</summary>
									{#if i.takes.length > 0}
										<ul class="divide-y divide-white/5 border-t border-white/10 bg-black/10">
											{#each i.takes as t (t.id)}
												<li>
													<button
														class="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 py-2 pl-10 pr-4 text-left hover:bg-white/5 disabled:cursor-default {t.id ===
														takeId
															? 'bg-blue-300/15'
															: ''}"
														type="button"
														aria-current={t.id === takeId ? "true" : undefined}
														disabled={recorderBusy}
														onclick={() => show(i, t)}
													>
														<span class="truncate text-sm">{takeLabel(t)}</span>
														<span class="text-sm tabular-nums opacity-80"
															>{t.durationSeconds !== null
																? formatTime(t.durationSeconds, 0)
																: "–:––"}</span
														>
														<span class="text-12px opacity-70">{fmtWhen(t.createdAt)}</span>
													</button>
												</li>
											{/each}
										</ul>
									{/if}
								</details>
							</li>
						{/each}
					</ul>
				{/if}
			</div>

			{#if idea}
				{@const removeIdea = deleteIdea.for(idea.id)}
				<div class="surface grid gap-5 px-5 py-5" aria-label="Selected idea">
					<div class="flex flex-wrap items-baseline justify-between gap-3">
						<h2 class="heading-3 mb-0">
							{idea.title}{#if loadedTake}
								<span class="opacity-70"> · {takeLabel(loadedTake)}</span>{/if}
						</h2>
						<form
							{...removeIdea.enhance(async ({ submit }) => {
								if (
									!confirm(
										`Delete “${idea?.title}” and its ${idea?.takes.length ?? 0} takes? Demos made from them stay on their songs.`,
									)
								)
									return;
								await submit();
								if (removeIdea.result?.deleted) {
									notify("Idea deleted");
									ideaId = null;
									takeId = null;
									notes = "";
									ideaTitle = placeholder();
									notesKey++;
									recorder?.reset();
									await invalidateAll();
								}
							})}
						>
							<input {...removeIdea.fields.id.as("hidden", idea.id)} />
							<button class="link-dim text-sm text-red-400" disabled={!!removeIdea.pending}>
								{removeIdea.pending ? "Deleting…" : "Delete idea"}
							</button>
						</form>
					</div>
					{#if loadedTake}
						<RecordingActions
							recording={{ id: loadedTake.id, title: `${idea.title} - ${takeLabel(loadedTake)}` }}
							projects={data.projects}
							fromSong={data.fromSong}
						/>
					{:else}
						<p class="text-sm opacity-90">Pick a take to add it to a song.</p>
					{/if}
				</div>
			{/if}
		</section>

		<!-- The idea's note board; a new idea's notes create it on the first save. -->
		<section class="min-h-560px" aria-label="Notes">
			<!-- Keyed on explicit switches only: creating the idea on the first save must not remount the editor. -->
			{#key notesKey}
				<IdeaNotesPanel
					idea={{ id: ideaId, notes }}
					{ensureIdea}
					onchange={(m) => (notes = m)}
					onclear={clearNotes}
				/>
			{/key}
		</section>

		<p class="text-13px opacity-70">
			Tips: keep the screen on and the app in front while recording (a phone stops the microphone
			when it sleeps or switches apps). Voice processing is switched off so instruments sound like
			themselves. Takes are saved as your browser recorded them and converted to MP3 for playback.
		</p>
	</div>

	<!-- Search: ideas by title or notes, takes by name or number. -->
	<div
		id="idea-search"
		popover="auto"
		onbeforetoggle={(e) => {
			searchOpen = e.newState === "open";
			if (searchOpen) searchText = "";
		}}
		class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(36rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Search ideas</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="idea-search"
				popovertargetaction="hide">Close</button
			>
		</div>
		<label class="block">
			<span class="sr-only">Search</span>
			<!-- svelte-ignore a11y_autofocus -->
			<input
				class="field"
				type="search"
				placeholder="Title, notes, take name…"
				autocomplete="off"
				data-1p-ignore
				bind:value={searchText}
				autofocus={searchOpen}
			/>
		</label>
		{#if searchText.trim()}
			{#if hits.length === 0}
				<p class="mt-4 text-sm opacity-80">Nothing matches.</p>
			{:else}
				<ul
					class="mt-4 max-h-[50vh] overflow-y-auto divide-y divide-white/10 rounded border border-white/15"
				>
					{#each hits as h (h.take ? h.take.id : h.idea.id)}
						<li>
							<button
								class="block w-full px-4 py-2 text-left hover:bg-white/10"
								type="button"
								popovertarget="idea-search"
								popovertargetaction="hide"
								onclick={() => show(h.idea, h.take ?? h.idea.takes.at(-1) ?? null)}
							>
								<span class="block truncate">{h.label}</span>
								<span class="block text-12px opacity-70"
									>{fmtWhen(h.take ? h.take.createdAt : h.idea.createdAt)}</span
								>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	</div>
</main>
