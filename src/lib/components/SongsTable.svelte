<script lang="ts">
	import { STAGE_LABEL } from "#lib/constants/songStages.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { nextSort } from "#lib/utils/nextSort.js";
	import { sortRows } from "#lib/utils/sortRows.js";
	import { SONG_STAGES, type SongStage } from "#lib/val/SongStageSchema.js";
	import SearchBox from "./SearchBox.svelte";
	import SortHeader from "./SortHeader.svelte";

	/**
	 * Your Songs as a table (/songs): every song the person may open, sorted
	 * by any column and filtered by a search (title, project, account) and
	 * a stage, all in the browser. On a phone the project, account and date
	 * move under the title.
	 */
	interface SongRow {
		id: string;
		title: string;
		href: string;
		project: string;
		account: string;
		stage: SongStage;
		stageRank: number;
		updatedAt: Date;
		meta: string;
	}
	interface Props {
		songs: SongRow[];
	}
	let { songs }: Props = $props();

	type Key = "title" | "project" | "account" | "stageRank" | "updatedAt";
	let query = $state("");
	let stage = $state<SongStage | "">("");
	let sort = $state<{ key: Key; dir: "asc" | "desc" }>({ key: "updatedAt", dir: "desc" });

	let matches = $derived(
		filterByTitle(stage ? songs.filter((s) => s.stage === stage) : songs, query),
	);
	let rows = $derived(sortRows(matches, sort.key, sort.dir));
	const dirOf = (key: Key) => (sort.key === key ? sort.dir : null);
	const sortBy = (key: Key) => (sort = nextSort(sort, key, ["updatedAt"]));
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center gap-3">
		<SearchBox bind:value={query} label="Search songs" />
		<select class="field w-auto py-1 text-13px" aria-label="Stage" bind:value={stage}>
			<option value="">All stages</option>
			{#each SONG_STAGES as s (s)}
				<option value={s}>{STAGE_LABEL[s]}</option>
			{/each}
		</select>
		{#if matches.length < songs.length}
			<p class="text-13px opacity-80" aria-live="polite">
				Showing {matches.length} of {songs.length}
			</p>
		{/if}
	</div>

	<div class="surface overflow-x-auto">
		<table class="w-full border-collapse text-15px">
			<caption class="sr-only">Your songs</caption>
			<thead>
				<tr class="border-b border-white/15">
					<SortHeader label="Title" dir={dirOf("title")} onsort={() => sortBy("title")} />
					<SortHeader
						label="Project"
						class="hidden md:table-cell"
						dir={dirOf("project")}
						onsort={() => sortBy("project")}
					/>
					<SortHeader
						label="Account"
						class="hidden md:table-cell"
						dir={dirOf("account")}
						onsort={() => sortBy("account")}
					/>
					<SortHeader label="Stage" dir={dirOf("stageRank")} onsort={() => sortBy("stageRank")} />
					<SortHeader
						label="Last changed"
						class="hidden md:table-cell"
						dir={dirOf("updatedAt")}
						onsort={() => sortBy("updatedAt")}
					/>
				</tr>
			</thead>
			<tbody class="divide-y divide-white/10">
				{#each rows as song (song.id)}
					<tr>
						<td class="px-3 py-2">
							<a class="link text-wrap" href={song.href}>{song.title || "Untitled"}</a>
							<p class="text-13px opacity-80 md:hidden">
								{song.project} · {song.account} · {formatDate(song.updatedAt)}
							</p>
						</td>
						<td class="hidden px-3 py-2 md:table-cell">{song.project}</td>
						<td class="hidden px-3 py-2 md:table-cell">{song.account}</td>
						<td class="px-3 py-2 text-nowrap">{STAGE_LABEL[song.stage]}</td>
						<td class="hidden px-3 py-2 text-nowrap md:table-cell">{formatDate(song.updatedAt)}</td>
					</tr>
				{:else}
					<tr>
						<td class="px-3 py-4 opacity-80" colspan="5">No songs match.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
