<script lang="ts">
	import { dayText } from "#lib/utils/sessionName.js";

	interface Props {
		/** The session recordings tied to the song (`data.sessionRecordings`). */
		recordings: {
			id: string;
			title: string;
			source: string | null;
			session: string;
			recordedOn: string;
		}[];
		accountSlug: string;
	}
	let { recordings, accountSlug }: Props = $props();
</script>

{#if recordings.length > 0}
	<!-- The session recordings the band tied to this song (docs/uploads-and-blob.md, "Sessions"): each opens on the Sessions page. -->
	<section
		class="mt-4 rounded-md border border-current/40 bg-blue/5 px-4 py-3"
		aria-label="Session recordings of this song"
	>
		<h3 class="mb-2 text-12px uppercase tracking-wider text-blue-300 opacity-90">
			From sessions ({recordings.length})
		</h3>
		<ul class="grid gap-1 text-14px">
			{#each recordings as r (r.id)}
				<li class="flex flex-wrap items-baseline gap-x-2">
					<a
						class="link font-500"
						href="/{accountSlug}/sessions?recording={r.id}"
						title="Open it on the Sessions page">{r.title}</a
					>
					{#if r.source}<span class="text-12px opacity-80">{r.source}</span>{/if}
					<span class="text-12px text-dim">{r.session} · {dayText(r.recordedOn)}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
