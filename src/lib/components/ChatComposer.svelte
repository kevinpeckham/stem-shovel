<script lang="ts">
	import ChatMentionPicker from "#lib/components/ChatMentionPicker.svelte";
	import ChatPendingAttachments, {
		type PendingChatAttachment,
	} from "#lib/components/ChatPendingAttachments.svelte";
	import { MAX_CHAT_ATTACHMENTS } from "#lib/constants/chatAttachments.js";
	import { FILE_ACCEPT, fileKindOf } from "#lib/constants/fileFormats.js";
	import { removePendingChatAttachment, sendMessage } from "#lib/remote/chat.remote.js";
	import type { ChatAttachmentRow, ChatMessageRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { uploadChatAttachment } from "#lib/upload.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { mentionsIn } from "#lib/utils/mentionsIn.js";
	import { CHAT_MESSAGE_MAX } from "#lib/val/ChatSchema.js";

	/**
	 * The chat's composer (docs/chat.md): a box, an Attach button and a Send
	 * button. Enter sends, Shift+Enter breaks a line; `@` opens the people
	 * picker (ChatMentionPicker), and the people picked whose `@Name` is
	 * still in the text go with the message as its mentions. Files (picked,
	 * dropped on the box or pasted into it) upload at once and wait in a
	 * strip above the box (ChatPendingAttachments) until the message goes
	 * with their ids; a message may be files alone. The box and the strip
	 * clear after a send and keep what they hold on an error (shown as a
	 * notification). The sent message, as the server made it, goes to the
	 * parent (`onsent`).
	 */
	interface Props {
		/** The chat's song, or its session (docs/chat.md "Sessions"): one of them. */
		songId?: string;
		sessionId?: string;
		/** What the box asks for; "song" by default. */
		about?: string;
		onsent: (message: ChatMessageRow) => void;
	}
	let { songId = "", sessionId = "", about = "song", onsent }: Props = $props();

	let draft = $state("");
	let box = $state<HTMLTextAreaElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let picked = $state<{ id: string; name: string }[]>([]);
	let picker = $state<ReturnType<typeof ChatMentionPicker>>();
	let mentions = $derived(mentionsIn(draft, picked));
	let pending = $state<PendingChatAttachment[]>([]);
	let ready = $derived(pending.flatMap((p) => (p.attachment ? [p.attachment.id] : [])));
	let uploading = $derived(pending.some((p) => !p.attachment));
	let sendable = $derived(!uploading && (!!draft.trim() || ready.length > 0));
	let nextKey = 0;

	function onkeydown(e: KeyboardEvent) {
		if (picker?.keydown(e)) return;
		if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			if (sendable) box?.form?.requestSubmit();
		}
	}
	/** Each file uploads at once; past the limit the rest are refused with a notification. */
	function attach(files: FileList | File[] | null | undefined) {
		const list = Array.from(files ?? []);
		if (!list.length) return;
		const room = MAX_CHAT_ATTACHMENTS - pending.length;
		if (list.length > room)
			notify(`A message carries at most ${MAX_CHAT_ATTACHMENTS} files.`, { kind: "error" });
		for (const file of list.slice(0, Math.max(0, room))) void upload(file);
	}
	async function upload(file: File) {
		const key = `f${nextKey++}`;
		pending.push({
			key,
			filename: file.name,
			kind: fileKindOf(file.name, file.type),
			percent: 0,
			attachment: null,
		});
		const item = () => pending.find((p) => p.key === key);
		try {
			const attachment = await uploadChatAttachment<ChatAttachmentRow>(
				songId ? { songId } : { sessionId },
				file,
				(percent) => {
					const p = item();
					if (p) p.percent = percent;
				},
			);
			const p = item();
			if (p) p.attachment = attachment;
		} catch (e) {
			pending = pending.filter((p) => p.key !== key);
			notify(`${file.name}: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function remove(item: PendingChatAttachment) {
		if (!item.attachment) return;
		try {
			await removePendingChatAttachment({ id: item.attachment.id });
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		pending = pending.filter((p) => p.key !== item.key);
	}
	function ondrop(e: DragEvent) {
		if (!e.dataTransfer?.files.length) return;
		e.preventDefault();
		attach(e.dataTransfer.files);
	}
	function onpaste(e: ClipboardEvent) {
		if (!e.clipboardData?.files.length) return;
		e.preventDefault();
		attach(e.clipboardData.files);
	}
	async function send(submit: () => Promise<unknown>, element: HTMLFormElement) {
		try {
			await submit();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		if (sendMessage.fields.allIssues()) return;
		const r = sendMessage.result;
		if (r?.message) onsent(r.message);
		element.reset();
		clearForm(sendMessage);
		draft = "";
		picked = [];
		pending = [];
		box?.focus();
	}
</script>

<form
	class="border-t border-current/20 px-4 py-3"
	{...sendMessage.enhance(({ submit, element }) => send(submit, element))}
>
	<input {...sendMessage.fields.songId.as("hidden", songId)} />
	<input {...sendMessage.fields.sessionId.as("hidden", sessionId)} />
	{#each mentions as id, i (id)}
		<input {...sendMessage.fields.mentions[i].as("hidden", id)} />
	{/each}
	{#each ready as id, i (id)}
		<input {...sendMessage.fields.attachments[i].as("hidden", id)} />
	{/each}
	<ChatPendingAttachments items={pending} onremove={remove} />
	<div class="grid grid-cols-[1fr_auto] items-end gap-2">
		<div class="relative">
			<ChatMentionPicker bind:this={picker} {songId} {sessionId} {box} bind:draft bind:picked />
			<textarea
				bind:this={box}
				class="field w-full text-15px"
				rows="2"
				maxlength={CHAT_MESSAGE_MAX}
				placeholder="Say something about this {about}… (Enter sends, Shift+Enter for a new line, @ to mention)"
				aria-label="Message"
				bind:value={draft}
				{...sendMessage.fields.body.as("text")}
				{...picker?.boxAria()}
				oninput={() => picker?.update()}
				{onkeydown}
				{onpaste}
				ondragover={(e) => {
					if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
				}}
				{ondrop}></textarea>
		</div>
		<div class="flex flex-col items-center gap-1">
			<button
				type="button"
				class="link grid place-items-center"
				aria-label="Attach files"
				title="Attach files"
				disabled={pending.length >= MAX_CHAT_ATTACHMENTS}
				onclick={() => fileInput?.click()}
			>
				<span class="i-ph-paperclip text-16px" aria-hidden="true"></span>
			</button>
			<input
				bind:this={fileInput}
				type="file"
				multiple
				accept={FILE_ACCEPT}
				class="hidden"
				data-chat-attach-input
				onchange={(e) => {
					attach(e.currentTarget.files);
					e.currentTarget.value = "";
				}}
			/>
			<button
				class="button button-xs"
				aria-label="Send"
				title={uploading ? "Waiting for the files to upload" : "Send (Enter)"}
				disabled={!!sendMessage.pending || !sendable}
			>
				<span class="i-ph-paper-plane-right text-14px" aria-hidden="true"></span>
			</button>
		</div>
	</div>
	{#each sendMessage.fields.body.issues() ?? [] as issue (issue.message)}
		<p class="mt-1 text-12px text-red-300">{issue.message}</p>
	{/each}
	{#each sendMessage.fields.attachments.issues() ?? [] as issue (issue.message)}
		<p class="mt-1 text-12px text-red-300">{issue.message}</p>
	{/each}
</form>
