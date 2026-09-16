<script lang="ts">
	import { archiveProject, deleteProject, restoreProject } from "$lib/remote/projects.remote";

	/**
	 * The bottom of project settings. An active project offers Archive (any
	 * member). An archived one offers Restore, and Delete to owners and admins
	 * — deleting needs the archive step first, and the remote function refuses
	 * an active project or another role regardless of what is shown.
	 */
	interface Props {
		projectId: string;
		name: string;
		status: "active" | "archived";
		songCount: number;
		canDelete: boolean;
	}
	let { projectId, name, status, songCount, canDelete }: Props = $props();
	let songs = $derived(`${songCount} ${songCount === 1 ? "song" : "songs"}`);
</script>

<div class="mt-8 border-t border-white/15 pt-4">
	{#if status === "archived"}
		<h3 class="text-15px font-700">
			<span class="i-ph-archive mr-1 inline-block align-[-2px]" aria-hidden="true"></span>Archived
		</h3>
		<p class="mt-1 text-sm opacity-90">
			This project is archived: it is out of the projects list, in the Archived section, and
			everything in it is kept. Restore it to bring it back{#if canDelete}, or delete it below{/if}.
		</p>
		<form class="mt-2" {...restoreProject}>
			<input {...restoreProject.fields.id.as("hidden", projectId)} />
			<button class="button button-sm" disabled={!!restoreProject.pending}>
				{restoreProject.pending ? "Restoring…" : "Restore project"}
			</button>
		</form>
	{:else}
		<h3 class="text-15px font-700">
			<span class="i-ph-archive mr-1 inline-block align-[-2px]" aria-hidden="true"></span>Archive
		</h3>
		<p class="mt-1 text-sm opacity-90">
			Archiving moves the project out of the projects list into an Archived section. Its {songs}
			and their files stay, and any member can restore it later. An archived project can then be deleted
			for good.
		</p>
		<form
			class="mt-2"
			{...archiveProject.enhance(async ({ submit }) => {
				if (!confirm(`Archive "${name}"? You can restore it from the projects page.`)) return;
				await submit();
			})}
		>
			<input {...archiveProject.fields.id.as("hidden", projectId)} />
			<button class="button button-sm" disabled={!!archiveProject.pending}>
				{archiveProject.pending ? "Archiving…" : "Archive project"}
			</button>
		</form>
	{/if}
</div>

{#if canDelete && status === "archived"}
	<div class="mt-8 border-t border-white/15 pt-4">
		<h3 class="text-15px font-700 text-red-400">Delete this project</h3>
		<p class="mt-1 text-sm text-dim">
			Removes the project, its {songs}, and every stem, demo, MIDI file and mix behind them. This
			cannot be undone; leave it archived if you may want it back.
		</p>
		<form
			class="mt-3"
			{...deleteProject.enhance(async ({ submit }) => {
				if (!confirm(`Delete "${name}" and its ${songs} for good? This cannot be undone.`)) return;
				await submit();
			})}
		>
			<input {...deleteProject.fields.id.as("hidden", projectId)} />
			<button
				class="button button-sm border-red-400/60 text-red-400 hover-bg-red-400/10"
				disabled={!!deleteProject.pending}
			>
				<span class="i-ph-trash" aria-hidden="true"></span>
				{deleteProject.pending ? "Deleting…" : "Delete project"}
			</button>
		</form>
	</div>
{/if}
