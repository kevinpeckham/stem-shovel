<script lang="ts">
	import { formatWhen } from "#lib/utils/formatWhen.js";

	/** The account's recently updated songs on the dashboard: title, project, when. */
	interface Props {
		songs: { id: string; title: string; href: string; project: string; updatedAt: Date }[];
	}
	let { songs }: Props = $props();
</script>

<div class="grid gap-3">
	<h3 class="heading-3 mb-0">Recent songs</h3>
	<ul class="surface divide-y divide-white/10 text-15px" aria-label="Recent songs">
		{#each songs as song (song.id)}
			<li class="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2">
				<span class="min-w-0">
					<a class="link" href={song.href}>{song.title}</a>
					<span class="text-14px opacity-80">· {song.project}</span>
				</span>
				<span class="text-12px opacity-60">{formatWhen(song.updatedAt)}</span>
			</li>
		{/each}
	</ul>
</div>
