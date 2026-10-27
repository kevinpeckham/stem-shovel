<script lang="ts">
	import { TableSort } from "#lib/state/tableSort.svelte.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import SearchBox from "./SearchBox.svelte";
	import SortHeader from "./SortHeader.svelte";

	/**
	 * Your Projects as a table (/projects): every project the person may
	 * open, sorted by any column and filtered by a search (name, account),
	 * all in the browser. On a phone the account and date move under the
	 * name.
	 */
	interface ProjectRow {
		id: string;
		title: string;
		href: string;
		account: string;
		songCount: number;
		updatedAt: Date;
		meta: string;
	}
	interface Props {
		projects: ProjectRow[];
	}
	let { projects }: Props = $props();

	type Key = "title" | "account" | "songCount" | "updatedAt";
	let query = $state("");
	const { dirOf, sortBy, apply } = new TableSort<Key>("updatedAt", ["songCount", "updatedAt"]);

	let matches = $derived(filterByTitle(projects, query));
	let rows = $derived(apply(matches));
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap items-center gap-3">
		<SearchBox bind:value={query} label="Search projects" placeholder="Search by name" />
		{#if matches.length < projects.length}
			<p class="text-13px opacity-80" aria-live="polite">
				Showing {matches.length} of {projects.length}
			</p>
		{/if}
	</div>

	<div class="surface overflow-x-auto">
		<table class="w-full border-collapse text-15px">
			<caption class="sr-only">Your projects</caption>
			<thead>
				<tr class="border-b border-white/15">
					<SortHeader label="Name" dir={dirOf("title")} onsort={() => sortBy("title")} />
					<SortHeader
						label="Account"
						class="hidden md:table-cell"
						dir={dirOf("account")}
						onsort={() => sortBy("account")}
					/>
					<SortHeader label="Songs" dir={dirOf("songCount")} onsort={() => sortBy("songCount")} />
					<SortHeader
						label="Last changed"
						class="hidden md:table-cell"
						dir={dirOf("updatedAt")}
						onsort={() => sortBy("updatedAt")}
					/>
				</tr>
			</thead>
			<tbody class="divide-y divide-white/10">
				{#each rows as project (project.id)}
					<tr>
						<td class="px-3 py-2">
							<a class="link text-wrap" href={project.href}>{project.title || "Untitled"}</a>
							<p class="text-13px opacity-80 md:hidden">
								{project.account} · {formatDate(project.updatedAt)}
							</p>
						</td>
						<td class="hidden px-3 py-2 md:table-cell">{project.account}</td>
						<td class="px-3 py-2 text-nowrap">{project.songCount}</td>
						<td class="hidden px-3 py-2 text-nowrap md:table-cell">
							{formatDate(project.updatedAt)}
						</td>
					</tr>
				{:else}
					<tr>
						<td class="px-3 py-4 opacity-80" colspan="4">No projects match.</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>
