<script lang="ts">
	import { setFeaturedSong } from "$lib/remote/admin.remote";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	let chosen = $derived(data.featuredId);
</script>

<svelte:head>
	<title>Home page · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Home page</h1>
	<p class="mt-1 text-sm opacity-90">
		The front page demos one song: its player with the downloads, and its chart, lyrics, notes and
		comments. Any public song with stems can be featured; when none is chosen, or the chosen one
		goes private, it falls back to <code>{data.defaultPath}</code>.
	</p>
	{#if data.songs.length === 0}
		<p class="mt-4 text-dim">No public songs with stems yet.</p>
	{:else}
		<form
			class="mt-4"
			{...setFeaturedSong.enhance(async ({ submit }) => {
				await submit();
				if (setFeaturedSong.result?.saved) notify("Featured song saved");
			})}
		>
			<ul class="surface divide-y divide-white/10 text-15px">
				{#each data.songs as s (s.id)}
					<li>
						<label class="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-white/5">
							<input
								type="radio"
								name="songId"
								value={s.id}
								checked={s.id === chosen}
								onchange={() => (chosen = s.id)}
							/>
							<span class="grow">
								{s.title}
								<span class="text-13px text-dim">
									· v{s.version} · {s.stems}
									{s.stems === 1 ? "stem" : "stems"} · {s.project} · {s.account}
								</span>
							</span>
							<a class="text-13px link-dim" href={s.path}>Open</a>
						</label>
					</li>
				{/each}
			</ul>
			{#each setFeaturedSong.fields.allIssues() ?? [] as issue (issue.message)}
				<p class="mt-2 text-sm text-red-400">{issue.message}</p>
			{/each}
			<div class="mt-4">
				<button class="button-accent" disabled={!!setFeaturedSong.pending || !chosen}>
					{setFeaturedSong.pending ? "Saving…" : "Feature this song"}
				</button>
			</div>
		</form>
	{/if}
</section>
