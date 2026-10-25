<script lang="ts">
	import { chatTokens } from "#lib/utils/chatTokens.js";

	/**
	 * A chat message's text as the page shows it (docs/chat.md): the runs
	 * from `chatTokens`, a URL as a link in a new tab, a position as a
	 * button that seeks the player through `onseek`, a mention of someone
	 * the message names in the accent (the reader's own on a tint), the
	 * rest as typed. Text nodes throughout, so nothing is rendered as HTML.
	 */
	interface Props {
		body: string;
		/** The people the message mentions ("Mentions"); their `@Name` stands out. */
		mentions?: { id: string; name: string }[];
		/** The reader, whose own mention is drawn stronger. */
		meId?: string | null;
		onseek?: (seconds: number) => void;
	}
	let { body, mentions = [], meId = null, onseek }: Props = $props();
	let tokens = $derived(chatTokens(body, mentions));
</script>

{#each tokens as token, i (i)}
	{#if token.kind === "url"}
		<a class="link-dim" href={token.href} target="_blank" rel="noopener">{token.text}</a>
	{:else if token.kind === "position"}
		<button
			type="button"
			class="rounded border border-current/30 px-1 text-13px tabular-nums hover-border-accent hover-text-accent"
			title="Go to {token.text}"
			onclick={() => onseek?.(token.seconds)}>{token.text}</button
		>
	{:else if token.kind === "mention"}
		<span
			class="font-600 text-accent {token.id === meId ? 'rounded bg-accent/20 px-0.5' : ''}"
			data-chat-mention={token.id === meId ? "me" : ""}>{token.text}</span
		>
	{:else}{token.text}{/if}
{/each}
