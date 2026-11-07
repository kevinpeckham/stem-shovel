<script lang="ts" module>
	import type { FileKind } from "#lib/constants/fileFormats.js";

	/** The icon of a chat file by kind (also the composer's pending strip). */
	export const CHAT_FILE_ICON: Record<FileKind, string> = {
		pdf: "i-ph-file-pdf",
		image: "i-ph-image",
		audio: "i-ph-file-audio",
		text: "i-ph-file-text",
		midi: "i-ph-music-notes",
		dawproject: "i-ph-archive",
		other: "i-ph-file",
	};
</script>

<script lang="ts">
	import type { ChatAttachmentRow } from "#lib/server/data.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";

	/**
	 * The files a chat message carries (docs/chat.md, "Attachments"), under
	 * its text: a picture as its thumbnail, opening the file at its share
	 * link in a new tab; anything else as a chip with an icon by kind, the
	 * filename and the size, downloading it.
	 */
	interface Props {
		attachments: ChatAttachmentRow[];
	}
	let { attachments }: Props = $props();

	let pictures = $derived(attachments.filter((a) => a.kind === "image"));
	let others = $derived(attachments.filter((a) => a.kind !== "image"));
</script>

{#if attachments.length}
	<div class="mt-1 flex flex-col gap-1" data-chat-attachments>
		{#if pictures.length}
			<div class="flex flex-wrap gap-2">
				{#each pictures as a (a.id)}
					<a
						href="/f/{a.shareCode}"
						target="_blank"
						rel="noopener"
						title={a.filename}
						aria-label="Open {a.filename}"
					>
						<img
							src={a.thumbnailUrl ?? a.url}
							alt={a.filename}
							width={a.width ?? undefined}
							height={a.height ?? undefined}
							loading="lazy"
							class="max-h-40 w-auto max-w-full rounded"
						/>
					</a>
				{/each}
			</div>
		{/if}
		{#if others.length}
			<div class="flex flex-wrap gap-2">
				{#each others as a (a.id)}
					<a
						href="/f/{a.shareCode}?download=1"
						class="link flex max-w-full items-center gap-2 rounded border border-current/20 px-2 py-1 text-13px"
						aria-label="Download {a.filename}"
						title="Download {a.filename}"
					>
						<span class="{CHAT_FILE_ICON[a.kind]} shrink-0 text-16px" aria-hidden="true"></span>
						<span class="truncate">{a.filename}</span>
						<span class="shrink-0 opacity-60">{formatBytes(a.sizeBytes)}</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
{/if}
