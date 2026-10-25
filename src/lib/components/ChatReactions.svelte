<script lang="ts">
	import type { ChatReactionSummary } from "#lib/utils/chatReactionSummary.js";
	import type { ChatReactionEmoji } from "#lib/val/ChatSchema.js";

	/**
	 * A chat message's reactions (docs/chat.md, "Reactions"), under its
	 * text: a chip per emoji with its count, lit when the reader is among
	 * those who chose it, the names in its title. A tap toggles the
	 * reader's own (`onreact`); someone who may not write sees the chips
	 * and cannot tap them.
	 */
	interface Props {
		reactions: ChatReactionSummary[];
		canReact: boolean;
		busy?: boolean;
		onreact: (emoji: ChatReactionEmoji) => void;
	}
	let { reactions, canReact, busy = false, onreact }: Props = $props();
</script>

{#if reactions.length > 0}
	<div class="mt-1 flex flex-wrap gap-1" data-chat-reactions>
		{#each reactions as r (r.emoji)}
			<button
				type="button"
				class="rounded-full border px-1.5 text-12px leading-5 tabular-nums disabled-cursor-default {r.mine
					? 'border-accent/70 bg-accent/15'
					: 'border-current/25 hover-border-current/60'}"
				title={r.names.join(", ")}
				aria-label="{r.emoji} {r.count}: {r.names.join(', ')}"
				aria-pressed={r.mine}
				disabled={!canReact || busy}
				onclick={() => onreact(r.emoji)}>{r.emoji} {r.count}</button
			>
		{/each}
	</div>
{/if}
