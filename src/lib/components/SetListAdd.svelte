<script lang="ts">
	import { addSetListItem, importSetListItems } from "#lib/remote/setLists.remote.js";
	import type { SetListItemRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { parseSetListPaste } from "#lib/utils/parseSetListPaste.js";
	import { setListPasteNotice } from "#lib/utils/setListPasteNotice.js";

	/**
	 * The set list editor's ways to add rows at the end
	 * (docs/band-plan.md, "Set list"): **Add a song**, a search by title
	 * over the account's songs the person may open (the first eight matches,
	 * Enter takes the first), **Add a line**, free text for anything not in
	 * the catalog, and **Paste a list**, many lines at once, each matched to
	 * a song by its title on the server (`importSetListItems`) or kept as text.
	 */
	interface Props {
		setListId: string;
		choices: { id: string; title: string; project: { name: string } }[];
		onadded: (row: SetListItemRow) => void;
		onaddedmany: (rows: SetListItemRow[]) => void;
	}
	let { setListId, choices, onadded, onaddedmany }: Props = $props();

	let query = $state("");
	let line = $state("");
	let busy = $state(false);
	let pasted = $state("");
	let pasteBox = $state<HTMLElement>();
	const pastedLines = $derived(parseSetListPaste(pasted).length);
	const matches = $derived.by(() => {
		const q = query.trim().toLowerCase();
		return q ? choices.filter((s) => s.title.toLowerCase().includes(q)).slice(0, 8) : [];
	});

	async function add(input: { songId?: string; title?: string }) {
		busy = true;
		try {
			onadded(await addSetListItem({ setListId, ...input }));
			return true;
		} catch (e) {
			notify(`Could not add the row: ${errorMessage(e)}`, { kind: "error" });
			return false;
		} finally {
			busy = false;
		}
	}
	async function addSong(id: string) {
		if (await add({ songId: id })) query = "";
	}
	async function addPasted() {
		busy = true;
		try {
			const { rows, matched } = await importSetListItems({ setListId, text: pasted });
			onaddedmany(rows);
			notify(setListPasteNotice(rows.length, matched));
			pasted = "";
			pasteBox?.hidePopover();
		} catch (e) {
			notify(`Could not add the rows: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			busy = false;
		}
	}
	async function addLine() {
		const title = line.trim();
		if (title && (await add({ title }))) line = "";
	}
</script>

<div class="grid gap-4 sm:grid-cols-2">
	<div class="grid content-start gap-1">
		<label class="grid gap-1 text-13px text-dim">
			Add a song
			<input
				class="field text-14px"
				type="search"
				placeholder="Start typing a title"
				autocomplete="off"
				disabled={busy}
				bind:value={query}
				onkeydown={(e) => {
					if (e.key === "Enter" && matches[0]) {
						e.preventDefault();
						void addSong(matches[0].id);
					}
				}}
			/>
		</label>
		{#if matches.length > 0}
			<ul class="surface grid py-1 text-14px" aria-label="Matching songs">
				{#each matches as s (s.id)}
					<li>
						<button
							class="flex w-full items-baseline gap-2 px-3 py-1.5 text-left hover:bg-white/10 hover:text-accent"
							type="button"
							disabled={busy}
							onclick={() => addSong(s.id)}
						>
							<span class="min-w-0 truncate">{s.title}</span>
							<span class="ml-auto shrink-0 text-12px text-dim">{s.project.name}</span>
						</button>
					</li>
				{/each}
			</ul>
		{:else if query.trim()}
			<p class="text-13px text-dim">No song matches; Add a line takes anything.</p>
		{/if}
	</div>
	<form
		class="grid content-start gap-1"
		onsubmit={(e) => {
			e.preventDefault();
			void addLine();
		}}
	>
		<label class="grid gap-1 text-13px text-dim" for="set-list-line">Add a line</label>
		<div class="flex gap-2">
			<input
				id="set-list-line"
				class="field min-w-0 flex-1 text-14px"
				type="text"
				placeholder="A cover, break, tune down, encore"
				maxlength="120"
				disabled={busy}
				bind:value={line}
			/>
			<button class="button button-sm" type="submit" disabled={busy || !line.trim()}>
				<span class="i-ph-plus" aria-hidden="true"></span> Add
			</button>
		</div>
	</form>
	<div class="sm:col-span-2">
		<button class="button button-sm" type="button" popovertarget="set-list-paste-{setListId}">
			<span class="i-ph-clipboard-text" aria-hidden="true"></span> Paste a list
		</button>
	</div>
</div>

<div
	id="set-list-paste-{setListId}"
	popover="auto"
	bind:this={pasteBox}
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<form
		class="grid gap-3"
		onsubmit={(e) => {
			e.preventDefault();
			void addPasted();
		}}
	>
		<h2 class="heading-2 mb-0">Paste a list</h2>
		<p class="text-sm text-dim">
			One song per line. Numbering is ignored. A line that matches a song's title becomes that
			song's row, and the rest stay as text.
		</p>
		<textarea
			class="field text-14px"
			rows="10"
			aria-label="Songs, one per line"
			maxlength="20000"
			disabled={busy}
			bind:value={pasted}></textarea>
		<div class="flex flex-wrap items-center gap-2">
			<span class="mr-auto text-13px text-dim">
				{pastedLines}
				{pastedLines === 1 ? "line" : "lines"}
			</span>
			<button
				class="button button-sm button-accent"
				type="submit"
				disabled={busy || pastedLines === 0}
			>
				<span class="i-ph-plus" aria-hidden="true"></span> Add rows
			</button>
			<button
				class="button button-sm"
				type="button"
				popovertarget="set-list-paste-{setListId}"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
	</form>
</div>
