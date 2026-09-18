<script lang="ts">
	import { addRecordingToSong, newSongFromRecording } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { goto } from "$app/navigation";

	/**
	 * A take into a song: as a demo of an existing song ("add"), or as the
	 * first demo of a new song in a project ("new"). Lives in a popover on
	 * the Idea Recorder. The idea's notes join the song's notes unless the
	 * box is unticked. Either way the browser lands on the song.
	 */
	interface Props {
		mode: "add" | "new";
		/** The take, with a label for messages ("<idea> · Take 2 · slow"). */
		take: { id: string; label: string; ideaTitle: string };
		projects: { id: string; name: string; songs: { id: string; title: string }[] }[];
		/** The song the recorder was opened from, offered first when adding. */
		fromSong?: { id: string; title: string } | null;
	}
	let { mode, take, projects, fromSong = null }: Props = $props();

	let projectId = $state("");
	let songId = $state("");
	let newTitle = $state("");
	let mergeNotes = $state(true);
	let busy = $state(false);

	let firstWithSongs = $derived(projects.find((p) => p.songs.length > 0)?.id ?? "");
	let addProject = $derived(projectId || firstWithSongs);
	let addSongs = $derived(projects.find((p) => p.id === addProject)?.songs ?? []);
	let addSong = $derived(
		songId && addSongs.some((s) => s.id === songId) ? songId : (addSongs[0]?.id ?? ""),
	);
	let createProject = $derived(projectId || projects[0]?.id || "");

	async function addTo(target: string) {
		busy = true;
		try {
			const { href } = await addRecordingToSong({ id: take.id, songId: target, mergeNotes });
			notify(`${take.label} added as a demo`);
			await goto(href);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = false;
		}
	}

	async function createNew() {
		const title = newTitle.trim() || take.ideaTitle;
		if (!createProject) return;
		busy = true;
		try {
			const { href } = await newSongFromRecording({
				id: take.id,
				projectId: createProject,
				title,
				mergeNotes,
			});
			notify(`“${title}” created with ${take.label} as its demo`);
			await goto(href);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = false;
		}
	}
</script>

{#if projects.length === 0}
	<p class="text-sm opacity-90">No projects yet. Make a project first to put a take on a song.</p>
{:else if mode === "add"}
	<form
		class="grid gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			if (addSong) void addTo(addSong);
		}}
	>
		{#if fromSong}
			<button
				class="button-accent justify-self-start"
				type="button"
				disabled={busy}
				onclick={() => addTo(fromSong.id)}
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				{busy ? "Adding…" : `Add to “${fromSong.title}”`}
			</button>
			<p class="text-sm opacity-70">Or pick any song:</p>
		{/if}
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm opacity-90">Project</span>
				<select
					class="mt-1 field text-sm"
					value={addProject}
					onchange={(e) => {
						projectId = e.currentTarget.value;
						songId = "";
					}}
				>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="text-sm opacity-90">Song</span>
				<select
					class="mt-1 field text-sm"
					value={addSong}
					disabled={addSongs.length === 0}
					onchange={(e) => (songId = e.currentTarget.value)}
				>
					{#if addSongs.length === 0}
						<option value="">No songs in this project</option>
					{/if}
					{#each addSongs as s (s.id)}
						<option value={s.id}>{s.title}</option>
					{/each}
				</select>
			</label>
		</div>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={mergeNotes} />
			Merge the idea's notes into the song's notes
		</label>
		<div>
			<button class="button-accent" disabled={busy || !addSong}>
				{busy ? "Adding…" : "Add as demo"}
			</button>
		</div>
	</form>
{:else}
	<form
		class="grid gap-4"
		onsubmit={(e) => {
			e.preventDefault();
			void createNew();
		}}
	>
		<div class="grid gap-3 sm:grid-cols-2">
			<label class="block">
				<span class="text-sm opacity-90">Project</span>
				<select
					class="mt-1 field text-sm"
					value={createProject}
					onchange={(e) => (projectId = e.currentTarget.value)}
				>
					{#each projects as p (p.id)}
						<option value={p.id}>{p.name}</option>
					{/each}
				</select>
			</label>
			<label class="block">
				<span class="text-sm opacity-90">Song title</span>
				<input
					class="mt-1 field text-sm"
					type="text"
					maxlength="120"
					placeholder={take.ideaTitle}
					autocomplete="off"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					bind:value={newTitle}
				/>
			</label>
		</div>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={mergeNotes} />
			Merge the idea's notes into the song's notes
		</label>
		<div>
			<button class="button-accent" disabled={busy || !createProject}>
				{busy ? "Creating…" : "Create song"}
			</button>
		</div>
	</form>
{/if}
