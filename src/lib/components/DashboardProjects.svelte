<script lang="ts">
	/** The account's recently updated projects on the dashboard, as cards. */
	interface Props {
		slug: string;
		projects: {
			id: string;
			name: string;
			slug: string;
			songCount: number;
			imageUrl: string | null;
		}[];
	}
	let { slug, projects }: Props = $props();
</script>

<div class="grid gap-3">
	<h3 class="heading-3 mb-0">Recent projects</h3>
	{#if projects.length === 0}
		<p class="text-14px text-dim opacity-80">No projects yet.</p>
	{:else}
		<ul class="grid gap-3 sm:grid-cols-2">
			{#each projects as project (project.id)}
				<li>
					<a
						class="surface flex items-center gap-3 p-3 hover:border-accent"
						href="/{slug}/projects/{project.slug}"
					>
						{#if project.imageUrl}
							<img
								class="h-12 w-12 shrink-0 rounded border border-white/15 object-cover"
								src={project.imageUrl}
								alt=""
							/>
						{:else}
							<span class="i-ph-folder-simple h-12 w-12 shrink-0 opacity-40" aria-hidden="true"
							></span>
						{/if}
						<span class="min-w-0">
							<span class="block truncate font-600 text-white">{project.name}</span>
							<span class="block text-13px opacity-80">
								{project.songCount}
								{project.songCount === 1 ? "song" : "songs"}
							</span>
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	<p class="text-14px"><a class="link-dim" href="/{slug}/projects">All projects</a></p>
</div>
