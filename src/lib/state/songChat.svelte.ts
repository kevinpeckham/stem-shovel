import type { ChatMessageRow } from "#lib/server/data.js";
import { unreadCount } from "#lib/utils/groupChat.js";

/** A song's chat as the page loads it: the messages and where this person last read them. */
export interface SongChatData {
	messages: ChatMessageRow[];
	readAt: number | null;
}

/**
 * The song page's chat (docs/chat.md): the panel's open state, the messages
 * and the read mark (SongChat binds both, so closing and reopening the panel
 * keeps them), and how many messages by others are unread, for the header's
 * button. A navigation from one song to another reuses the page: `reset`
 * starts the chat over from the new song's. The `?open=chat` link stays on
 * the page.
 */
export class SongChat {
	/** The panel is open (the header's button toggles it). */
	open = $state(false);
	messages = $state<ChatMessageRow[]>([]);
	readAt = $state<number | null>(null);
	#me: () => string | null;
	#unread = $derived.by(() => unreadCount(this.messages, this.readAt, this.#me()));

	/** `chat` is the page's `data.chat` (null for anyone who may not write in it); `me` the signed-in user's id. */
	constructor(chat: SongChatData | null | undefined, me: () => string | null) {
		this.#me = me;
		this.reset(chat);
	}

	/** Messages by others since the read mark (none without a chat). */
	get unread() {
		return this.#unread;
	}

	/** The header's button: open or close the panel. */
	toggle() {
		this.open = !this.open;
	}

	/** Another song's chat: its messages and read mark replace these (the panel stays as it was). */
	reset(chat: SongChatData | null | undefined) {
		this.messages = chat?.messages ?? [];
		this.readAt = chat?.readAt ?? null;
	}
}
