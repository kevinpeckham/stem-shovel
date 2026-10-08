<script lang="ts">
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import {
		commentHistory,
		docHistory,
		restoreCommentVersion,
		restoreDocVersion,
	} from "#lib/remote/history.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import type { SongDocSaveKind } from "#lib/val/SongDocKindSchema.js";

	/**
	 * The history of a song document or a comment (docs/data-model.md,
	 * `song_doc_version`, `comment_version`; Kevin): the ten most recent
	 * revisions, newest first, each with who saved it and when, shown on
	 * request and restored with one click (a restore is a new save, so the
	 * text it replaces is kept too). A FloatingPanel: dragged and resized from
	 * lg, docked below on a phone.
	 */
	type Target =
		| { kind: "doc"; songId: string; doc: SongDocSaveKind; label: string }
		| { kind: "comment"; commentId: string; label: string };
	interface Props {
		target: Target | null;
		/** The caller may restore (an editor, the note's owner, the comment's author or an admin). */
		canRestore: boolean;
		onclose: () => void;
		/** After a restore: the page reloads its data. */
		onrestored?: () => Promise<void> | void;
	}
	let { target, canRestore, onclose, onrestored }: Props = $props();

	type DocVersion = {
		id: string;
		versionNumber: number;
		markdown: string;
		html: string;
		createdAt: number;
		createdBy: { name: string } | null;
	};
	type CommentVersion = {
		id: string;
		title: string;
		body: string;
		at: number | null;
		createdAt: number;
		editedBy: { name: string } | null;
	};
	let docVersions = $state<DocVersion[]>([]);
	let commentVersions = $state<CommentVersion[]>([]);
	let loading = $state(false);
	let loadError = $state<string | null>(null);
	let open = $state<string | null>(null);
	let restoring = $state<string | null>(null);

	async function load(t: Target) {
		loading = true;
		loadError = null;
		open = null;
		try {
			if (t.kind === "doc") {
				docVersions = (await docHistory({ songId: t.songId, kind: t.doc })).versions;
				commentVersions = [];
			} else {
				commentVersions = (await commentHistory({ commentId: t.commentId })).versions;
				docVersions = [];
			}
		} catch (e) {
			loadError = errorMessage(e);
		} finally {
			loading = false;
		}
	}
	$effect(() => {
		if (target) void load(target);
	});
	async function restore(id: string) {
		const t = target;
		if (
			!t ||
			!confirm("Make this version the current text? The text it replaces is kept in the history.")
		)
			return;
		restoring = id;
		try {
			if (t.kind === "doc") {
				const r = await restoreDocVersion({ songId: t.songId, kind: t.doc, versionId: id });
				notify(r.changed ? "Version restored" : "That version is the current text already");
			} else {
				await restoreCommentVersion({ commentId: t.commentId, versionId: id });
				notify("Version restored");
			}
			await onrestored?.();
			await load(t);
		} catch (e) {
			notify(`Could not restore it: ${errorMessage(e)}`, { kind: "error" });
		} finally {
			restoring = null;
		}
	}
	const when = (ms: number) => formatDate(new Date(ms));
	let count = $derived(target?.kind === "doc" ? docVersions.length : commentVersions.length);
</script>

<FloatingPanel
	open={target !== null}
	title={target ? `History of ${target.label}` : "History"}
	storageKey="stemshovel.song.history-panel"
	width={640}
	height={640}
	onminimise={onclose}
>
	<div class="grid gap-3 text-14px" aria-label="Versions">
		{#if loading}
			<p class="opacity-70">Loading…</p>
		{:else if loadError}
			<p class="text-red-300">Could not load the history: {loadError}</p>
		{:else if count === 0}
			<p class="opacity-70">
				No earlier versions yet. {target?.kind === "comment"
					? "A comment's earlier text is kept each time it is edited."
					: "Every save that changes the text keeps the one before it, ten at most."}
			</p>
		{:else}
			<ol class="grid gap-2">
				{#if target?.kind === "doc"}
					{#each docVersions as v, i (v.id)}
						<li class="rounded-md border border-white/10 bg-black/20">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
								<span class="font-600">Version {v.versionNumber}</span>
								<span class="text-12px opacity-70"
									>{when(v.createdAt)}{v.createdBy ? ` · ${v.createdBy.name}` : ""}{i === 0
										? " · latest kept"
										: ""}</span
								>
								<span class="ml-auto flex gap-2">
									<button
										class="button button-xs"
										type="button"
										aria-expanded={open === v.id}
										onclick={() => (open = open === v.id ? null : v.id)}
									>
										{open === v.id ? "Hide" : "View"}
									</button>
									{#if canRestore}
										<button
											class="button button-xs"
											type="button"
											disabled={restoring !== null}
											onclick={() => restore(v.id)}
										>
											{restoring === v.id ? "Restoring…" : "Restore"}
										</button>
									{/if}
								</span>
							</div>
							{#if open === v.id}
								<div class="chart-body border-t border-white/10 px-4 py-3 text-15px">
									{@html v.html}
								</div>
							{/if}
						</li>
					{/each}
				{:else}
					{#each commentVersions as v (v.id)}
						<li class="rounded-md border border-white/10 bg-black/20 px-3 py-2 grid gap-1">
							<div class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<span class="font-600">{v.title}</span>
								<span class="text-12px opacity-70"
									>replaced {when(v.createdAt)}{v.editedBy ? ` by ${v.editedBy.name}` : ""}</span
								>
								{#if canRestore}
									<button
										class="button button-xs ml-auto"
										type="button"
										disabled={restoring !== null}
										onclick={() => restore(v.id)}
									>
										{restoring === v.id ? "Restoring…" : "Restore"}
									</button>
								{/if}
							</div>
							<p class="whitespace-pre-line text-15px">{v.body}</p>
						</li>
					{/each}
				{/if}
			</ol>
		{/if}
	</div>
</FloatingPanel>
