<script lang="ts" module>
	import type { FileKind } from "#lib/constants/fileFormats.js";
	import type { ChatAttachmentRow } from "#lib/server/data.js";

	export interface PendingChatAttachment {
		/** The browser's own key for the item, before the server gives it an id. */
		key: string;
		filename: string;
		kind: FileKind;
		percent: number;
		/** The ready row; null while the file uploads. */
		attachment: ChatAttachmentRow | null;
	}
</script>

<script lang="ts">
	import { CHAT_FILE_ICON } from "#lib/components/ChatAttachments.svelte";

	/**
	 * The files waiting to go with the next message (docs/chat.md,
	 * "Attachments"), above the composer's box: each with its thumbnail (or
	 * an icon by kind), its name, a progress bar while it uploads, and ×
	 * once it is up (`onremove`).
	 */
	interface Props {
		items: PendingChatAttachment[];
		onremove: (item: PendingChatAttachment) => void;
	}
	let { items, onremove }: Props = $props();
</script>

{#if items.length}
	<ul class="mb-2 flex flex-wrap gap-2" aria-label="Files to send">
		{#each items as item (item.key)}
			{@const thumb = item.attachment?.thumbnailUrl}
			<li
				class="flex max-w-60 items-center gap-2 rounded border border-current/20 px-2 py-1 text-12px"
				data-pending-attachment
			>
				{#if thumb}
					<img src={thumb} alt="" class="size-8 shrink-0 rounded object-cover" />
				{:else}
					<span class="{CHAT_FILE_ICON[item.kind]} shrink-0 text-16px" aria-hidden="true"></span>
				{/if}
				<span class="flex min-w-0 flex-col gap-1">
					<span class="truncate" title={item.filename}>{item.filename}</span>
					{#if !item.attachment}
						<progress
							class="h-1 w-24"
							max="100"
							value={item.percent}
							aria-label="Uploading {item.filename}"
						></progress>
					{/if}
				</span>
				{#if item.attachment}
					<button
						type="button"
						class="link grid shrink-0 place-items-center"
						aria-label="Remove {item.filename}"
						title="Remove"
						onclick={() => onremove(item)}
					>
						<span class="i-ph-x text-12px" aria-hidden="true"></span>
					</button>
				{/if}
			</li>
		{/each}
	</ul>
{/if}
