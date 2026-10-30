<script lang="ts">
	import { formatDate } from "#lib/utils/formatDate.js";
	import type { Snippet } from "svelte";

	/**
	 * A comment's card in a list that places comments on a waveform (the
	 * song's player, a demo's, a mix's, a session recording's): its title,
	 * author, date and position, the body, then Go to, Edit and whatever the
	 * list adds (its Delete, whose remote form is the list's).
	 */
	interface Props {
		comment: {
			title: string;
			body: string;
			authorName: string;
			createdAt: Date;
			editedAt: unknown;
			/** Seconds into the recording, or null when the comment has no position. */
			at: number | null;
		};
		/** A position as this list reads it. */
		pos: (seconds: number) => string;
		/** Go to the comment's position; no Go to without it. */
		onseek?: (seconds: number) => void;
		/** Edit the comment; no Edit without it (only its author may). */
		onedit?: () => void;
		/** The list's further controls, after Edit. */
		children?: Snippet;
	}
	let { comment: c, pos, onseek, onedit, children }: Props = $props();
</script>

<div class="flex items-baseline justify-between gap-3">
	<h3 class="font-600">{c.title}</h3>
	{#if c.editedAt}<span
			class="rounded border border-current/30 px-1 text-9px uppercase tracking-wider">edited</span
		>{/if}
</div>
<p class="mt-1 text-12px opacity-70">
	{c.authorName} · {formatDate(c.createdAt)}{#if c.at !== null}{" "}
		· {pos(c.at)}{/if}
</p>
<p class="mt-2 whitespace-pre-line">{c.body}</p>
<div class="mt-3 flex gap-3 text-12px">
	{#if c.at !== null && onseek}
		<button type="button" class="link" onclick={() => onseek(c.at ?? 0)}>Go to</button>
	{/if}
	{#if onedit}
		<button type="button" class="link" onclick={onedit}>Edit</button>
	{/if}
	{@render children?.()}
</div>
