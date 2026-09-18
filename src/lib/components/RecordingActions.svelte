<script lang="ts">
	import { addRecordingToSong, newSongFromRecording } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import { goto } from "$app/navigation";

	/**
	 * What to do with a saved scratch recording: add it to a song as a demo,
	 * or start a new song with it. Used on the recorder page after a save
	 * and from the library. Either way the browser lands on the song.
	 */
	interface Props {
		recording: { id: string; title: string };
		projects: { id: string; name: string; songs: { id: string; title: string }[] }[];
		/** The song the recorder was opened from, offered first. */
		fromSong?: { id: string; title: string } | null;
	}
	let { recording, projects, fromSong = null }: Props = $props();

	let projectId = $state("");
	let songId = $state("");
	let newProjectId = $state("");
	let newTitle = $state("");
	let busy = $state<"song" | "new" | null>(null);

	// Defaults: the first project with songs for "add", the first project for "new".
	let firstWithSongs = $derived(projects.find((p) => p.songs.length > 0)?.id ?? "");
	let addProject = $derived(projectId || firstWithSongs);
	let addSongs = $derived(projects.find((p) => p.id === addProject)?.songs ?? []);
	let addSong = $derived(
		songId && addSongs.some((s) => s.id === songId) ? songId : (addSongs[0]?.id ?? ""),
	);
	let createProject = $derived(newProjectId || projects[0]?.id || "");

	async function addTo(target: string) {
		busy = "song";
		try {
			const { href } = await addRecordingToSong({ id: recording.id, songId: target });
			notify(`"${recording.title}" added as a demo`);
			await goto(href);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = null;
		}
	}

	async function createNew() {
		const title = newTitle.trim() || recording.title;
		if (!createProject) return;
		busy = "new";
		try {
			const { href } = await newSongFromRecording({
				id: recording.id,
				projectId: createProject,
				title,
			});
			notify(`"${title}" created with the recording as its demo`);
			await goto(href);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = null;
		}
	}
</script>

<div class="grid gap-5">
	{#if fromSong}
		<div>
			<button
				class="button-accent"
				type="button"
				disabled={busy !== null}
				onclick={() => addTo(fromSong.id)}
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				{busy === "song" ? "Adding…" : `Add to “${fromSong.title}”`}
			</button>
		</div>
	{/if}

	{#if projects.length === 0}
		<p class="text-sm opacity-90">
			No projects yet. The recording is kept in your library; make a project to put it on a song.
		</p>
	{:else}
		<form
			class="grid gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				if (addSong) void addTo(addSong);
			}}
		>
			<h3 class="text-15px font-700">{fromSong ? "Add to another song" : "Add to a song"}</h3>
			<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
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
				<button class="button" disabled={busy !== null || !addSong}>
					{busy === "song" ? "Adding…" : "Add as demo"}
				</button>
			</div>
		</form>

		<form
			class="grid gap-3"
			onsubmit={(e) => {
				e.preventDefault();
				void createNew();
			}}
		>
			<h3 class="text-15px font-700">New song from it</h3>
			<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
				<label class="block">
					<span class="text-sm opacity-90">Project</span>
					<select
						class="mt-1 field text-sm"
						value={createProject}
						onchange={(e) => (newProjectId = e.currentTarget.value)}
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
						placeholder={recording.title}
						autocomplete="off"
						data-1p-ignore
						data-lpignore="true"
						data-bwignore
						bind:value={newTitle}
					/>
				</label>
				<button class="button" disabled={busy !== null || !createProject}>
					{busy === "new" ? "Creating…" : "Create song"}
				</button>
			</div>
		</form>
	{/if}
</div>
