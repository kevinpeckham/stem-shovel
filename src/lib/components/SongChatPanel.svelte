<script lang="ts">
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import SongChat from "#lib/components/SongChat.svelte";
	import type { SongChat as SongChatState } from "#lib/state/songChat.svelte.js";

	interface Props {
		/** The panel's state, the messages and the read mark. */
		chat: SongChatState;
		songId: string;
		/** The signed-in person, who may edit their own messages. */
		me: { id: string; name: string } | null;
		/** An owner or admin of the account may delete anyone's message. */
		isAdmin: boolean;
		canWrite: boolean;
		/** A message's position link: the player seeks. */
		onseek: (seconds: number) => void;
	}
	let { chat, songId, me, isAdmin, canWrite, onseek }: Props = $props();
</script>

<!-- The chat (docs/chat.md): its own panel, closed until the header's button opens it; floats from lg, a block under the docs below (`contents` keeps it out of the grid from lg). -->
<div class="{chat.open ? '' : 'hidden'} max-w-full lg:contents">
	<FloatingPanel
		open={chat.open}
		title="Chat"
		storageKey="stemshovel.song.chat-panel"
		width={440}
		height={600}
		onminimise={() => (chat.open = false)}
	>
		<SongChat
			{songId}
			bind:messages={chat.messages}
			bind:readAt={chat.readAt}
			{me}
			{isAdmin}
			{canWrite}
			{onseek}
		/>
	</FloatingPanel>
</div>
