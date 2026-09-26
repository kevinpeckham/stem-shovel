<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder, { type Take } from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import IdeaNotesPanel from "$lib/components/IdeaNotesPanel.svelte";
	import ComboBox from "$lib/components/ComboBox.svelte";
	import ContextMenu from "$lib/components/ContextMenu.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";
	import Tuner from "$lib/components/Tuner.svelte";
	import Metronome from "$lib/components/Metronome.svelte";
	import {
		createIdea,
		deleteIdeaNow,
		dropIdeaIfEmpty,
		renameIdea,
		saveIdeaNotes,
	} from "$lib/remote/ideas.remote";
	import { deleteTake, setTakeName } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";
	import { invalidateAll } from "$app/navigation";
	import { onMount, untrack } from "svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { TakeQueue } from "$lib/audio/takeQueue.svelte";
	import {
		loadDiscardShortTakes,
		saveDiscardShortTakes,
		SHORT_TAKE_SECONDS,
	} from "$lib/utils/discardShortTakes";
	import {
		DEFAULT_RECORDER_PREFERENCES,
		loadRecorderPreferences,
		saveRecorderPreferences,
		type RecorderPreferences,
	} from "$lib/utils/recorderPreferences";

	let { data } = $props();
	type Idea = (typeof data.ideas)[number];
	type TakeRow = Idea["takes"][number];

	/**
	 * On a phone the recorder fills the viewport and the page must not scroll
	 * behind it: the document is locked while the phone layout applies and
	 * unlocked when it stops applying or the page is left (nothing leaks to
	 * other pages). A media query, not a width binding, so it runs only when
	 * the answer changes.
	 */
	onMount(() => {
		const phone = window.matchMedia("(max-width: 639.98px)");
		const root = document.documentElement;
		const before = { maxHeight: root.style.maxHeight, overflowY: root.style.overflowY };
		const apply = () => {
			root.style.maxHeight = phone.matches ? "100svh" : before.maxHeight;
			root.style.overflowY = phone.matches ? "hidden" : before.overflowY;
		};
		apply();
		phone.addEventListener("change", apply);
		return () => {
			phone.removeEventListener("change", apply);
			root.style.maxHeight = before.maxHeight;
			root.style.overflowY = before.overflowY;
		};
	});

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
	/** Drop takes under SHORT_TAKE_SECONDS (a mis-tap); a per-browser setting, read on mount. */
	let discardShort = $state(false);
	/** The tuner in its popover; a take starting closes it, which frees the microphone. */
	let tuner = $state<Tuner | null>(null);
	/** Quality, stereo and the microphone: per browser too (src/lib/utils/recorderPreferences.ts). */
	let prefs = $state<RecorderPreferences>({ ...DEFAULT_RECORDER_PREFERENCES });
	/** The microphones the browser lists once permission is granted. */
	let inputs = $state<{ id: string; label: string }[]>([]);
	let findingInputs = $state(false);
	function savePrefs() {
		saveRecorderPreferences({ ...prefs });
	}
	/** Ask for the microphone once (permission), then list the inputs with their labels. */
	async function findInputs() {
		findingInputs = true;
		try {
			const s = await navigator.mediaDevices.getUserMedia({ audio: true });
			for (const t of s.getTracks()) t.stop();
			const list = await navigator.mediaDevices.enumerateDevices();
			inputs = list
				.filter((d) => d.kind === "audioinput")
				.map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
		} catch (e) {
			notify(`Could not list microphones: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			findingInputs = false;
		}
	}
	let recorderBusy = $derived(
		phase === "recording" || phase === "requesting" || phase === "saving",
	);
	/** A new idea's placeholder: "Untitled Idea N", N counting the user's ideas. */
	const placeholder = () => `Untitled Idea ${data.ideas.length + 1}`;

	/**
	 * Uploads run in the background so Record is available the moment Stop is
	 * pressed; a take waits on disk (IndexedDB) until its upload lands.
	 */
	const queue = new TakeQueue({
		// The idea the take was recorded for, created now if it never was; a
		// take restored from an earlier visit whose idea was never created gets
		// one with the title it had then.
		ideaFor: async (item) => {
			const id = await (async () => {
				if (item.ideaId) return item.ideaId;
				if (item.ideaTitle !== ideaTitle || ideaId) {
					const created = await createIdea({ accountId: data.account.id, title: item.ideaTitle });
					await invalidateAll();
					return created.id;
				}
				return ensureIdea();
			})();
			openIdeas.add(id); // the take now lists under this idea: keep it unfolded
			return id;
		},
		onsaved: async (saved) => {
			recorder?.resolve(saved.localId, saved);
			if (takeId === saved.localId) {
				takeId = saved.id;
				if (ideaId) openIdeas.add(ideaId); // the new take shows in the list
			}
			notify(`Take ${saved.takeNumber} saved`);
			await invalidateAll();
			void followRendition(saved.id);
		},
	});
	/**
	 * The jobs function makes the take's MP3 within a minute or so; when it
	 * lands, the player switches to it (a browser cannot always play its own
	 * lossless recording, and another device never can). Polls the page data
	 * a few times, then gives up quietly: the next visit has it anyway.
	 */
	async function followRendition(takeId: string) {
		for (let i = 0; i < 12; i++) {
			await new Promise((r) => setTimeout(r, 5000));
			await invalidateAll();
			const take = data.ideas.flatMap((i) => i.takes).find((t) => t.id === takeId);
			if (!take) return;
			if (take.playbackUrl) {
				recorder?.refreshUrl(take);
				return;
			}
		}
	}
	onMount(() => {
		discardShort = loadDiscardShortTakes();
		prefs = loadRecorderPreferences();
		void queue.restore();
	});

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

	/** Which ideas are unfolded in the list: a plain accordion, the loaded idea opened when it is shown. */
	const openIdeas = new SvelteSet<string>();

	/**
	 * The list as shown: the ideas from the server plus every take still
	 * uploading (the queue) under its idea, so a take is listed the moment
	 * Stop is pressed rather than once its upload lands. A take whose idea
	 * the server does not have yet sits under a pending group with that
	 * title until the refresh after the idea is created. Failed uploads stay
	 * in the Uploads box, which offers Retry and Discard.
	 */
	type ShownTake = TakeRow & { pending?: { status: "waiting" | "uploading"; progress: number } };
	type ShownIdea = Omit<Idea, "takes"> & { takes: ShownTake[]; pending?: boolean };
	let ideasShown = $derived.by((): ShownIdea[] => {
		const pending = queue.items.filter((u) => u.status !== "failed");
		const row = (u: (typeof pending)[number], takeNumber: number): ShownTake => ({
			id: u.localId,
			takeNumber,
			title: u.name,
			url: "",
			playbackUrl: null,
			codec: null,
			durationSeconds: u.durationSeconds,
			createdAt: new Date(u.createdAt),
			pending: { status: u.status === "uploading" ? "uploading" : "waiting", progress: u.progress },
		});
		const known = new Set(data.ideas.map((i) => i.id));
		const ideas: ShownIdea[] = data.ideas.map((i) => {
			const mine = pending.filter((u) => u.ideaId === i.id);
			return { ...i, takes: [...i.takes, ...mine.map((u, k) => row(u, i.takes.length + k + 1))] };
		});
		const orphans = pending.filter((u) => !u.ideaId || !known.has(u.ideaId));
		const groups = new Map<string, typeof orphans>();
		for (const u of orphans) groups.set(u.ideaTitle, [...(groups.get(u.ideaTitle) ?? []), u]);
		const made: ShownIdea[] = [...groups].map(([title, us]) => ({
			id: `pending:${us[0].localId}`,
			title,
			notes: "",
			createdAt: new Date(us[0].createdAt),
			pending: true,
			takes: us.map((u, k) => row(u, k + 1)),
		}));
		return [...made, ...ideas];
	});
	function show(i: Idea, t: TakeRow | null) {
		if (recorderBusy || !recorder) return;
		const switching = ideaId !== i.id;
		ideaId = i.id;
		ideaTitle = i.title;
		openIdeas.add(i.id);
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
				const r = await saveIdeaNotes({ id: ideaId, markdown: "" });
				if (r.ideaDeleted) ideaId = null; // nothing left in it; the title stays for the next take
				await invalidateAll();
			} catch (e) {
				notify(errorMessage(e), { kind: "error" });
			}
		}
	}
	/** A failed upload discarded: the idea goes too when it was created for that take and holds nothing else. */
	async function discardUpload(u: { localId: string; ideaId: string | null }) {
		queue.discard(u.localId);
		const id = u.ideaId ?? ideaId;
		if (!id) return;
		try {
			const r = await dropIdeaIfEmpty({ id });
			if (r.ideaDeleted && id === ideaId) ideaId = null;
			await invalidateAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
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
			const r = await deleteTake({ id: t.id });
			notify(`Take ${t.takeNumber} deleted`);
			// The take before the deleted one, to show once the list has refreshed.
			const before = idea?.takes.filter((x) => x.takeNumber < t.takeNumber).at(-1) ?? null;
			takeId = null;
			recorder?.reset();
			// The last take of an idea without notes takes the idea with it.
			if (r.ideaDeleted && idea?.takes.some((x) => x.id === t.id)) ideaId = null;
			await invalidateAll();
			const still = before && idea?.takes.find((x) => x.id === before.id);
			if (idea && still) show(idea, still);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ---- a take into a song: one popover, two modes, one target ----
	let songTarget = $state<{ id: string; label: string; ideaTitle: string } | null>(null);
	let songMode = $state<"add" | "new">("add");
	let songPanel = $state<HTMLDivElement | null>(null);
	function songDialog(
		i: { title: string },
		t: { id: string; takeNumber: number; title: string },
		mode: "add" | "new",
	) {
		songTarget = { id: t.id, label: `${i.title} · ${takeLabel(t)}`, ideaTitle: i.title };
		songMode = mode;
		songPanel?.showPopover();
	}
	async function removeIdea(i: Idea) {
		const n = i.takes.length;
		if (
			!confirm(
				`Delete “${i.title}” and its ${n} ${n === 1 ? "take" : "takes"}? Demos made from them stay on their songs.`,
			)
		)
			return;
		try {
			await deleteIdeaNow({ id: i.id });
			notify("Idea deleted");
			// Deleting the idea in the player empties it; another one leaves it alone.
			const emptied = i.id === ideaId;
			if (emptied) {
				ideaId = null;
				takeId = null;
				notes = "";
				notesKey++;
				recorder?.reset();
			}
			await invalidateAll();
			// After the refresh, so the placeholder counts without the deleted idea.
			if (emptied) ideaTitle = placeholder();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	// ---- search (a popover over the list: every idea, filtered as you type) ----
	let searchOpen = $state(false);
	let searchText = $state("");
	/**
	 * Every idea by default, narrowed by the query: an idea stays when its
	 * title or notes match or any take's label or number does; the takes that
	 * matched are flagged so the row opens on them.
	 */
	let filtered = $derived.by(() => {
		const q = searchText.trim().toLowerCase();
		const out: { idea: Idea; byTake: boolean; matching: Set<string> }[] = [];
		for (const i of data.ideas) {
			const inIdea = !q || i.title.toLowerCase().includes(q) || i.notes.toLowerCase().includes(q);
			const matching = new Set(
				q
					? i.takes
							.filter(
								(t) => t.title.toLowerCase().includes(q) || `take ${t.takeNumber}`.includes(q),
							)
							.map((t) => t.id)
					: [],
			);
			if (inIdea || matching.size > 0) out.push({ idea: i, byTake: !inIdea, matching });
		}
		return out;
	});

	const fmtWhen = (d: Date) =>
		`${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
	const takeLabel = (t: { takeNumber: number; title: string }) =>
		`Take ${t.takeNumber}${t.title ? ` · ${t.title}` : ""}`;
</script>

<svelte:head>
	<title>{pageTitle("Idea Recorder")}</title>
</svelte:head>

<main
	class="max-h-[calc(100svh-72px)] h-[calc(100svh-72px)] grid grid-rows-[auto_1fr] sm-block sm-max-h-none sm-h-auto px-3 sm-!page-x-padding pt-3 sm-pt-8 max-w-full overflow-hidden pb-16"
>
	<header class="flex justify-between items-start w-full mb-1 sm-mb-3">
		<div class="md-max-w-article">
			<h1 class="sm-heading-2 flex items-center gap-2">
				Idea Recorder
				<InfoTip
					label="About the Idea Recorder"
					text="An idea consists of one or more audio recording takes and optionally some written notes.
					Hitting record starts a new take. Starting a new idea clears the note board and starts over
					at take one."
				/>
			</h1>
			<p class="opacity-90 md-text-balance mb-3">
				<span class="sr-only md-not-sr-only md-inline"
					>Record your demos, riffs, or quick ideas here.</span
				>

				{#if data.fromSong}
					Opened from <a class="link-dim" href={data.fromSong.href}>{data.fromSong.title}</a>.
				{/if}
			</p>
		</div>
		<div class="flex gap-2">
			<button
				class="button button-sm sm-bg-accent sm-text-oxford shrink-0"
				type="button"
				disabled={recorderBusy}
				title="New idea"
				aria-label="New idea"
				onclick={newIdea}
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				<span class="hidden sm-inline">New Idea</span>
			</button>
			<!-- The search sheet anchors here whatever opened it (the ⋯ menu's item is hidden once the menu closes). -->
			<button
				class="button button-sm shrink-0"
				style:anchor-name="--idea-search"
				type="button"
				popovertarget="idea-search"
				title="Search ideas and takes"
				aria-label="Search ideas and takes"
			>
				<span class="i-ph-magnifying-glass" aria-hidden="true"></span>
				<span class="hidden sm-inline-block">Ideas</span>
			</button>
			<!-- The metronome: a click track through the speakers or headphones while a take records. -->
			<Metronome compact />
			<button
				class="button button-sm shrink-0"
				type="button"
				popovertarget="tuner"
				title="Tuner"
				aria-label="Tuner"
			>
				<span aria-hidden="true"
					><svg
						xmlns="http://www.w3.org/2000/svg"
						width="14"
						height="14"
						viewBox="0 0 500 500"
						class="w-1em h-1em aspect-square"
						><path
							d="M103.383 364.263l32.353 32.353-74.633 74.633c-5.78 5.78-14.204 8.037-22.098 5.921s-14.061-8.281-16.177-16.177.142-16.318 5.921-22.098l74.633-74.633zM337.195 28.748c5.78-5.78 14.202-8.037 22.098-5.921a22.88 22.88 0 0 1 10.255 38.275L234.694 195.881a49.06 49.06 0 0 0 22.035 82.061 49.06 49.06 0 0 0 47.379-12.721l134.779-134.779c4.277-4.289 10.085-6.697 16.141-6.697s11.862 2.409 16.139 6.697a22.78 22.78 0 0 1 6.735 16.173 22.8 22.8 0 0 1-6.735 16.177L336.534 297.571c-14.972 14.966-34.514 24.499-55.525 27.083a94.93 94.93 0 0 1-60.433-12.819l-74.925 74.854-32.353-32.353 74.854-74.925c-10.856-18.138-15.347-39.378-12.764-60.354a94.93 94.93 0 0 1 27.028-55.454z"
							fill="currentColor"
							fill-rule="evenodd"
						/></svg
					></span
				>
			</button>
			<button
				class="button button-sm shrink-0"
				type="button"
				popovertarget="recorder-settings"
				title="Recorder settings"
				aria-label="Recorder settings"
			>
				<span class="i-ph-gear" aria-hidden="true"></span>
			</button>
		</div>
	</header>

	<!--
		Like the song page: the recorder where the player is, the notes where the
		documents are, the ideas list under the recorder. On a phone the recorder
		and the notes follow each other so both are in view, the list gives way to
		a picker above the recorder, and the takes are reached from the recorder's
		"Take N" dropdown.
	-->
	<div
		class="gap-y-2 grid grid-cols-1 grid-rows-[auto_1fr] h-full place-content-stretch max-h-full sm-h-auto sm-max-h-none sm-grid-rows-auto gap-4 sm-gap-x-8 sm-gap-y-4 xl-grid-cols-2 xl-grid-rows-[auto_1fr] overflow-x-hidden relative"
	>
		<section
			class="grid grid-cols-1 gap-6 place-content-start w-full xl-col-start-1 xl-row-start-1"
			aria-label="Recorder"
		>
			<DemoRecorder
				bind:this={recorder}
				bind:ideaTitle
				onphase={(p) => (phase = p)}
				ontitlechange={titleChanged}
				ontakename={takeNamed}
				ondeletetake={removeTake}
				onaddtosong={(t) => idea && songDialog(idea, t, "add")}
				onnewsong={(t) => idea && songDialog(idea, t, "new")}
				ondeleteidea={() => idea && removeIdea(idea)}
				onnewidea={newIdea}
				minTakeSeconds={discardShort ? SHORT_TAKE_SECONDS : 0}
				quality={prefs.quality}
				stereo={prefs.stereo}
				inputId={prefs.inputId}
				oninputs={(list) => (inputs = list)}
				newIdeaDisabled={!ideaId && !takeId && phase === "idle"}
				takes={idea?.takes ?? []}
				onpick={(id) => {
					const row = idea?.takes.find((x) => x.id === id);
					if (idea && row) show(idea, row);
				}}
				onstart={() => {
					takeId = null;
					document.getElementById("tuner")?.hidePopover();
				}}
				onqueued={(t) => {
					takeId = t.localId;
					// The take lists at once, under its idea (or a pending group for a new one): unfold it.
					openIdeas.add(ideaId ?? `pending:${t.localId}`);
					queue.enqueue({
						...t,
						ideaId,
						ideaTitle,
						trimSilence: prefs.trimSilence,
						createdAt: Date.now(),
					});
				}}
			/>

			<!-- Uploads that failed: a take still saving is listed under its idea instead. -->
			{#if queue.items.some((u) => u.status === "failed")}
				<ul class="grid gap-1 text-sm" aria-label="Failed uploads">
					{#each queue.items.filter((u) => u.status === "failed") as u (u.localId)}
						<li
							class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-red-400/40 bg-red-400/5 px-3 py-2"
						>
							<span class="i-ph-cloud-warning" aria-hidden="true"></span>
							<span class="min-w-0 grow truncate">
								{u.ideaTitle}{u.name ? ` · ${u.name}` : ""} · {formatTime(u.durationSeconds, 0)}
							</span>
							<span class="text-red-400">{u.error}</span>
							<button class="link-dim" type="button" onclick={() => queue.retry(u.localId)}
								>Retry</button
							>
							<button class="link-dim" type="button" onclick={() => discardUpload(u)}
								>Discard</button
							>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- The idea's note board; a new idea's notes create it on the first save. -->
		<section
			class="h-full max-h-full overflow-y-scroll sm-h-auto sm-max-h-none sm-min-h-560px xl-col-start-2 xl-row-start-1 xl-row-span-2 max-w-full overflow-x-hidden sm-overflow-y-visible rounded-md"
			aria-label="Notes"
		>
			<div class="justify-between w-full items-center mb-3 hidden sm-flex">
				<div class="opacity-90"><span>Notes for:</span> "{ideaTitle}"</div>
				<button
					class="px-2 py-1 bg-blue-300/5 hover-bg-blue-300/10 opacity-80 rounded-md flex items-center disabled-opacity-80 border border-blue-300/5 hover-border-current"
					type="button"
					title="Clear the notes"
					aria-label="Clear the notes"
					onclick={() => {
						if (confirm("Clear the notes?")) clearNotes?.();
					}}
				>
					<span class="i-ph-trash" aria-hidden="true"></span>
				</button>
			</div>
			<!-- Keyed on explicit switches only: creating the idea on the first save must not remount the editor. -->
			{#key notesKey}
				<IdeaNotesPanel
					idea={{ id: ideaId, notes, title: ideaTitle }}
					{ensureIdea}
					onchange={(m) => (notes = m)}
					onsaved={async ({ ideaDeleted }) => {
						// Emptied notes on an idea without takes remove the idea; the list shows the first line of the notes.
						if (ideaDeleted) ideaId = null;
						await invalidateAll();
					}}
				/>
			{/key}
		</section>

		<!-- Ideas, newest first, each opening to its takes; the current one is open. -->
		<section
			class="hidden sm-grid grid-cols-1 content-start gap-2 xl-col-start-1 xl-row-start-2 xl-max-h-640px"
			aria-label="Ideas"
		>
			<div class="flex flex-wrap items-center justify-between gap-3">
				<h2 class="text-16px mb-1 font-500 leading-tight text-blue-100/90">Recordings</h2>
				<div class="flex items-baseline gap-2">
					<!-- <button
						class="button button-xs"
						type="button"
						popovertarget="idea-search"
						title="Search ideas and takes"
					>
						<span class="i-ph-magnifying-glass" aria-hidden="true"></span>
						Search Ideas
					</button> -->
				</div>
			</div>
			{#if ideasShown.length === 0}
				<p
					class="rounded border border-dashed border-white/15 px-4 py-4 text-center text-sm opacity-90"
				>
					Nothing recorded yet. Your ideas and their takes will list here.
				</p>
			{:else}
				<ul
					class="
						max-h-[60vh]
						min-h-64
						overflow-y-auto
						rounded
						bg-slate-400
						bg-gradient-to-br
						from-slate-500/10
						via-slate-500/60
						to-slate-500/80
						divide-y
						divide-dark/30
					  shadow-xl
						shadow-oxford-800
							{recorderBusy ? 'opacity-60' : ''}"
				>
					{#each ideasShown as i (i.id)}
						<li>
							<!--
								An accordion and nothing more: the row only folds and unfolds; a take
								loads. The set is the one source of truth (the native toggle is
								cancelled): a toggle event lands after a re-render from an autosave
								and the two would otherwise fight over the state.
							-->
							<details open={openIdeas.has(i.id)}>
								<summary
									class="
										cursor-pointer
										font-sans
										grid
										grid-cols-[auto_1fr_auto_auto]
										items-center
										gap-x-3
										opacity-95
										px-4
										py-2.5
										list-none
										shadow
										text-oxford
										hover-opacity-100
										[&::-webkit-details-marker]:hidden {i.id === ideaId || (i.pending && !ideaId)
										? 'bg-blue-300/10'
										: ''}"
									onclick={(e) => {
										e.preventDefault();
										if (openIdeas.has(i.id)) openIdeas.delete(i.id);
										else openIdeas.add(i.id);
									}}
								>
									<span
										class="i-ph-caret-right-bold inline-block text-1em opacity-90 {openIdeas.has(
											i.id,
										)
											? 'rotate-90'
											: ''}"
										aria-hidden="true"
									></span>
									<span class="block truncate font-600 w-full font-sans w-full">{i.title}</span>
									<span class="text-14px tabular-nums opacity-90 h-full inline-flex items-center"
										>{i.takes.length}
										{i.takes.length === 1 ? "take" : "takes"} | {formatDate(i.createdAt)}</span
									>
								</summary>
								{#if i.takes.length > 0}
									<ul
										class="divide-y divide-dark/10 bg-blue-100/40 border-t border-t-dark/30 text-oxford"
									>
										{#each i.takes as t (t.id)}
											<li
												class="grid grid-cols-[1fr_auto] items-center gap-2 pr-2 shadow-inner {t.id ===
												takeId
													? 'bg-blue-300/15'
													: ''}"
											>
												<button
													class="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 py-2 pl-12 pr-2 text-left hover:bg-white/5 disabled:cursor-default"
													type="button"
													aria-current={t.id === takeId ? "true" : undefined}
													disabled={recorderBusy || !!t.pending}
													onclick={() => show(i, t)}
												>
													<span class="inline-grid w-full grid-cols-1">
														<span class="truncate">{takeLabel(t)}</span>
														<span class="text-12px opacity-70">{fmtWhen(t.createdAt)}</span>
													</span>
													<span
														class="text-sm tabular-nums opacity-80 inline-flex h-full items-center gap-1"
													>
														{#if t.pending}
															<span class="i-ph-cloud-arrow-up animate-pulse" aria-hidden="true"
															></span>
															{t.pending.status === "uploading"
																? `Saving… ${Math.round(t.pending.progress)}%`
																: "Waiting…"}
														{:else}
															{t.durationSeconds !== null
																? formatTime(t.durationSeconds, 0)
																: "–:––"}
														{/if}
													</span>
												</button>
												{#if !t.pending}
													<ContextMenu
														buttonClasses="text-oxford bg-slate-800/5 hover-bg-slate-800/20"
														popoverClasses="text-blue-100"
														title="Take Menu"
														ariaLabel="Menu for {takeLabel(t)}"
														items={[
															{
																action: () => songDialog(i, t, "add"),
																kind: "button",
																iconClass: "i-ph-plus",
																label: "Add as demo...",
															},
															{
																action: () => songDialog(i, t, "new"),
																kind: "button",
																iconClass: "i-ph-music-notes-plus",
																label: "Create new song...",
															},
															{
																kind: "divider",
															},
															{
																action: () => removeTake(t),
																kind: "button",
																iconClass: "i-ph-trash",
																label: "Delete Take",
															},
														]}
													/>
												{/if}
											</li>
										{/each}
									</ul>
								{/if}
							</details>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<!-- <p class="text-13px opacity-70 xl-col-span-2">
			Tips: keep the screen on and the app in front while recording (a phone stops the microphone
			when it sleeps or switches apps). Voice processing is switched off so instruments sound like
			themselves. Takes are saved as your browser recorded them and converted to MP3 for playback.
		</p> -->
	</div>

	<!-- A take into a song: add as a demo, or create a new song. -->
	<div
		id="take-song"
		popover="auto"
		bind:this={songPanel}
		class="m-auto max-h-[calc(100dvh-2rem)] overflow-y-auto w-[min(36rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">{songMode === "add" ? "Add as demo" : "Create new song"}</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="take-song"
				popovertargetaction="hide">Close</button
			>
		</div>
		{#if songTarget}
			<p class="mb-4 text-sm opacity-90">{songTarget.label}</p>
			{#key `${songTarget.id}/${songMode}`}
				<RecordingActions
					mode={songMode}
					take={songTarget}
					projects={data.projects}
					fromSong={data.fromSong}
				/>
			{/key}
		{/if}
	</div>

	<!-- The tuner: listens while open, quiet again when closed or when a take starts. -->
	<div
		id="tuner"
		popover="auto"
		onbeforetoggle={(e) => {
			if (e.newState === "open") void tuner?.start();
			else tuner?.stop();
		}}
		class="
			fixed
			h-screen
			left-0
			overflow-y-auto
			pb-6
			px-3
			pt-5
			rounded-md
			text-blue-100
			top-0
			w-full
			sm-[position-area:bottom_span-left]
			sm-absolute
			sm-h-auto
			sm-max-h-fit
			sm-mt-4
			sm-max-h-[calc(100dvh-2rem)]
			sm-w-[min(640px,100vw)]
			sm-border
			sm-border-white/5
			bg-oxford
			sm-px-8
			sm-pt-5
			sm-pb-12
		 sm-shadow-2xl
			sm-shadow-black/60
			sm-[&::backdrop]-bg-black/60
			sm-[&::backdrop]-backdrop-blur-none"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="font-600">Instrument Tuner</h2>
			<div class="flex items-center gap-3">
				<!-- <a class="link-dim text-13px" href="/tuner">Full page</a> -->
				<button
					class="button-popover-close"
					type="button"
					popovertarget="tuner"
					popovertargetaction="hide"
				>
					<span class="sr-only">Close</span>
				</button>
			</div>
		</div>
		<Tuner bind:this={tuner} />
	</div>

	<!-- Recorder settings: per-browser preferences (localStorage), the gear in the header. -->
	<div
		id="recorder-settings"
		popover="auto"
		class="fixed
		h-screen
		left-0
		overflow-y-auto
		pb-6
		px-3
		pt-5
		rounded-md
		text-blue-100
		top-0
		w-full
		sm-[position-area:bottom_span-left]
		sm-absolute
		sm-h-auto
		sm-max-h-fit
		sm-mt-4
		sm-max-h-[calc(100dvh-2rem)]
		sm-w-[min(640px,100vw)]
		sm-border
		sm-border-white/5
		bg-oxford
		sm-px-8
		sm-pt-5
		sm-pb-12
	 sm-shadow-2xl
		sm-shadow-black/60
		sm-[&::backdrop]-bg-black/60
		sm-[&::backdrop]-backdrop-blur-none"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="font-600">Recorder Settings</h2>
			<button
				class="button-popover-close"
				type="button"
				popovertarget="recorder-settings"
				popovertargetaction="hide"
			>
				<span class="sr-only">Close</span>
			</button>
		</div>
		<div class="grid gap-5 text-sm">
			<fieldset class="grid gap-2">
				<legend class="mb-1 font-500">Quality</legend>
				<label class="flex items-start gap-3">
					<input
						class="mt-1 accent-maximumYellow"
						type="radio"
						name="quality"
						value="lossless"
						bind:group={prefs.quality}
						onchange={savePrefs}
					/>
					<span>
						Lossless where the browser can
						<span class="block text-13px opacity-70"
							>ALAC on iPhone, iPad and Safari (18.4 or later), raw PCM on Chrome and Edge (kept as
							FLAC); Opus or AAC elsewhere. About 3 MB a minute in mono.</span
						>
					</span>
				</label>
				<label class="flex items-start gap-3">
					<input
						class="mt-1 accent-maximumYellow"
						type="radio"
						name="quality"
						value="compressed"
						bind:group={prefs.quality}
						onchange={savePrefs}
					/>
					<span>
						Compressed
						<span class="block text-13px opacity-70"
							>Opus or AAC at 256 kbit/s, about 2 MB a minute: for a slow or metered connection.</span
						>
					</span>
				</label>
			</fieldset>
			<label class="flex items-start gap-3">
				<input
					class="mt-1 accent-maximumYellow"
					type="checkbox"
					bind:checked={prefs.stereo}
					onchange={savePrefs}
				/>
				<span>
					Stereo input
					<span class="block text-13px opacity-70"
						>For an audio interface with two channels; a phone microphone is mono anyway. Doubles
						the file.</span
					>
				</span>
			</label>
			<div class="grid gap-1.5">
				<label class="block" for="recorder-input">Microphone</label>
				<div class="flex items-center gap-2">
					<select
						id="recorder-input"
						class="field text-sm"
						bind:value={prefs.inputId}
						onchange={savePrefs}
					>
						<option value={null}>Default microphone</option>
						{#each inputs as i (i.id)}
							<option value={i.id}>{i.label}</option>
						{/each}
						{#if prefs.inputId && !inputs.some((i) => i.id === prefs.inputId)}
							<option value={prefs.inputId}>Chosen earlier (not listed yet)</option>
						{/if}
					</select>
					<button
						class="button button-xs shrink-0"
						type="button"
						disabled={findingInputs}
						onclick={findInputs}
					>
						{findingInputs ? "Looking…" : inputs.length ? "Refresh" : "Find microphones"}
					</button>
				</div>
				<span class="text-13px opacity-70"
					>An interface plugged into a phone or a computer shows up here once the browser has
					microphone permission.</span
				>
			</div>
			<label class="flex items-start gap-3">
				<input
					class="mt-1 accent-maximumYellow"
					type="checkbox"
					bind:checked={discardShort}
					onchange={() => saveDiscardShortTakes(discardShort)}
				/>
				<span>
					Discard takes shorter than {SHORT_TAKE_SECONDS} seconds automatically
					<span class="block text-13px opacity-70"
						>A mis-tap on Record is dropped instead of saved.</span
					>
				</span>
			</label>
			<label class="flex items-start gap-3">
				<input
					class="mt-1 accent-maximumYellow"
					type="checkbox"
					bind:checked={prefs.trimSilence}
					onchange={savePrefs}
				/>
				<span>
					Trim silence at the start and end
					<span class="block text-13px opacity-70"
						>Once a take is saved, the silence before the first sound and after the last is cut from
						the take and its MP3 alike, leaving a little room. Off unless you turn it on.</span
					>
				</span>
			</label>
			<p class="text-13px opacity-70">Remembered on this device.</p>
		</div>
	</div>

	<!-- Search: ideas by title or notes, takes by name or number. -->
	<div
		id="idea-search"
		popover="auto"
		onbeforetoggle={(e) => {
			searchOpen = e.newState === "open";
			if (searchOpen) searchText = "";
		}}
		class="
		fixed
		h-screen
		left-0
		overflow-y-auto
		pb-6
		px-3
		pt-5
		rounded-md
		text-blue-100
		top-0
		w-full
		sm-[position-area:bottom_span-left]
		sm-absolute
		sm-mt-4
		sm-max-h-[calc(100dvh-2rem)]
		sm-w-[min(640px,100vw)]
		sm-border
		sm-border-white/5
		bg-oxford
		sm-px-8
		sm-pt-5
		sm-pb-12
	 sm-shadow-2xl
		sm-shadow-black/60
		sm-[&::backdrop]-bg-black/60
		sm-[&::backdrop]-backdrop-blur-none
		[&:popover-open]:flex
		[&:popover-open]:flex-col
		sm-h-[min(85dvh,52rem)]"
		style:position-anchor="--idea-search"
	>
		<!-- Full screen on a phone, a tall sheet on a desktop: the search box stays put, the list scrolls. -->
		<div class="shrink-0">
			<div class="flex items-center justify-between">
				<h2 class="font-600">Search Ideas</h2>
				<button
					class="button-popover-close ml-auto"
					type="button"
					popovertarget="idea-search"
					popovertargetaction="hide"
				>
					<span class="sr-only">Close</span>
				</button>
			</div>
			<label class="flex mt-4">
				<span class="sr-only">Search ideas</span>
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="field"
					type="search"
					placeholder="Filter by title, notes, take label or number…"
					autocomplete="off"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					bind:value={searchText}
					autofocus={searchOpen}
				/>
			</label>
		</div>
		<div class="min-h-0 grow overflow-y-auto mt-4">
			{#if filtered.length === 0}
				<p class="py-6 text-center text-sm opacity-80">
					{data.ideas.length === 0 ? "Nothing recorded yet." : "Nothing matches."}
				</p>
			{:else}
				<p class="mb-2 text-12px uppercase tracking-wider opacity-60">
					{filtered.length} of {data.ideas.length}
					{data.ideas.length === 1 ? "idea" : "ideas"}
				</p>
				<ul class="divide-y divide-white/10 rounded border border-white/15 bg-blue-300/5">
					{#each filtered as f (f.idea.id)}
						<li>
							<!-- A plain accordion, opened on the takes a query matched; a take loads and closes the sheet. -->
							<details open={f.matching.size > 0}>
								<summary
									class="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-3 px-3 py-2.5 list-none hover:bg-white/5 [&::-webkit-details-marker]:hidden {f
										.idea.id === ideaId
										? 'bg-blue-300/10'
										: ''}"
								>
									<span
										class="i-ph-caret-right inline-block text-12px opacity-70"
										aria-hidden="true"
									></span>
									<span class="min-w-0">
										<span class="block truncate font-500">{f.idea.title}</span>
										<span class="block truncate text-12px opacity-70">
											{fmtWhen(f.idea.createdAt)}{#if f.idea.notes.trim()}
												· {f.idea.notes.trim().split("\n")[0].slice(0, 60)}{/if}
										</span>
									</span>
									<span class="text-sm tabular-nums opacity-80">
										{f.idea.takes.length}
										{f.idea.takes.length === 1 ? "take" : "takes"}
									</span>
								</summary>
								<div class="border-t border-white/10 bg-black/10">
									{#if f.idea.takes.length === 0}
										<button
											class="block w-full px-3 py-2 pl-9 text-left text-sm hover:bg-white/5"
											type="button"
											popovertarget="idea-search"
											popovertargetaction="hide"
											onclick={() => show(f.idea, null)}
										>
											Open the idea (notes only, no takes yet)
										</button>
									{:else}
										<ul class="divide-y divide-white/5">
											{#each f.idea.takes as t (t.id)}
												<li>
													<button
														class="grid w-full grid-cols-[1fr_auto] items-baseline gap-x-4 py-2 pl-9 pr-3 text-left hover:bg-white/5 {f.matching.has(
															t.id,
														)
															? 'bg-accent/10'
															: ''}"
														type="button"
														aria-current={t.id === takeId ? "true" : undefined}
														popovertarget="idea-search"
														popovertargetaction="hide"
														onclick={() => show(f.idea, t)}
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
								</div>
							</details>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</main>
