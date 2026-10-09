<script lang="ts">
	import { chatTokens } from "#lib/utils/chatTokens.js";

	/**
	 * A chat message's text as the page shows it (docs/chat.md): the runs
	 * from `chatTokens`, a URL as a link in a new tab, a position as a
	 * button that seeks the player through `onseek`, the rest as typed.
	 * Text nodes throughout, so nothing is rendered as HTML.
	 */
	interface Props {
		body: string;
		onseek?: (seconds: number) => void;
	}
	let { body, onseek }: Props = $props();
	let tokens = $derived(chatTokens(body));
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
	{:else}{token.text}{/if}
{/each}
