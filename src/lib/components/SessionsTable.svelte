<script lang="ts">
	import { TableSort } from "#lib/state/tableSort.svelte.js";
	import {
		SESSION_KIND_LABELS,
		SESSION_KINDS,
		type SessionKind,
	} from "#lib/constants/sessionRecordings.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { dayText } from "#lib/utils/sessionName.js";
	import SearchBox from "./SearchBox.svelte";
	import SortHeader from "./SortHeader.svelte";

	/**
	 * Your Sessions as a table (/sessions): every recording session in the
	 * person's accounts, sorted by any column and filtered by a search
	 * (name, place, account) and a kind, all in the browser. On a phone
	 * the kind, place, recordings and account move under the name.
	 */
	interface SessionRow {
		id: string;
		title: string;
		href: string;
		kind: SessionKind;
		place: string;
		startsOn: string;
		recordingCount: number;
		account: string;
		meta: string;
	}
	interface Props {
		sessions: SessionRow[];
	}
	let { sessions }: Props = $props();

	type Key = "title" | "kind" | "place" | "startsOn" | "recordingCount" | "account";
	let query = $state("");
	let kind = $state<SessionKind | "">("");
	const { dirOf, sortBy, apply } = new TableSort<Key>("startsOn", ["startsOn", "recordingCount"]);

	let matches = $derived(
		filterByTitle(kind ? sessions.filter((s) => s.kind === kind) : sessions, query),
	);
	let rows = $derived(apply(matches));
	const recordings = (n: number) => `${n} recording${n === 1 ? "" : "s"}`;
	const phoneLine = (s: SessionRow) =>
		[SESSION_KIND_LABELS[s.kind], s.place, recordings(s.recordingCount), s.account]
			.filter(Boolean)
			.join(" · ");
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center gap-3">
		<SearchBox bind:value={query} label="Search sessions" placeholder="Search by name" />
		<select class="field w-auto py-1 text-13px" aria-label="Kind" bind:value={kind}>
			<option value="">All kinds</option>
			{#each SESSION_KINDS as k (k)}
				<option value={k}>{SESSION_KIND_LABELS[k]}</option>
			{/each}
		</select>
		{#if matches.length < sessions.length}
			<p class="text-13px opacity-80" aria-live="polite">
				Showing {matches.length} of {sessions.length}
			</p>
		{/if}
	</div>

	<div class="surface overflow-x-auto">
		<table class="w-full border-collapse text-15px">
			<caption class="sr-only">Your sessions</caption>
			<thead>
				<tr class="border-b border-white/15">
					<SortHeader label="Session" dir={dirOf("title")} onsort={() => sortBy("title")} />
					<SortHeader
						label="Kind"
						class="hidden md:table-cell"
						dir={dirOf("kind")}
						onsort={() => sortBy("kind")}
					/>
					<SortHeader
						label="Place"
						class="hidden md:table-cell"
						dir={dirOf("place")}
						onsort={() => sortBy("place")}
					/>
					<SortHeader label="Day" dir={dirOf("startsOn")} onsort={() => sortBy("startsOn")} />
					<SortHeader
						label="Recordings"
						class="hidden md:table-cell"
						dir={dirOf("recordingCount")}
						onsort={() => sortBy("recordingCount")}
					/>
					<SortHeader
						label="Account"
						class="hidden md:table-cell"
						dir={dirOf("account")}
						onsort={() => sortBy("account")}
					/>
				</tr>
			</thead>
			<tbody class="divide-y divide-white/10">
				{#each rows as session (session.id)}
					<tr>
						<td class="px-3 py-2">
							<a class="link text-wrap" href={session.href}>{session.title}</a>
							<p class="text-13px opacity-80 md:hidden">{phoneLine(session)}</p>
						</td>
						<td class="hidden px-3 py-2 md:table-cell">{SESSION_KIND_LABELS[session.kind]}</td>
						<td class="hidden px-3 py-2 md:table-cell">{session.place}</td>
						<td class="px-3 py-2 text-nowrap">{dayText(session.startsOn)}</td>
						<td class="hidden px-3 py-2 tabular-nums md:table-cell">{session.recordingCount}</td>
						<td class="hidden px-3 py-2 md:table-cell">{session.account}</td>
					</tr>
				{:else}
					<tr>
						<td class="px-3 py-4 opacity-80" colspan="6">No sessions match.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
