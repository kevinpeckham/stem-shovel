<script lang="ts">
	import IconChat from "#lib/components/IconChat.svelte";
	import { afterNavigate, goto, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import MixPanel, { type MixComment, type PanelMix } from "#lib/components/MixPanel.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import SongChat from "#lib/components/SongChat.svelte";
	import { MAX_MIXES_PER_SONG, MIX_FORMAT_LIST } from "#lib/constants/mixFormats.js";
	import { STEM_MAX_BYTES } from "#lib/constants/stemFormats.js";
	import { createComment, updateComment } from "#lib/remote/comments.remote.js";
	import { removeMix, renameMix, setMixNotes } from "#lib/remote/mixes.remote.js";
	import { shareSong } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { postJson, saveAs, uploadMixFile } from "#lib/upload.js";
	import { demoContentType } from "#lib/utils/demoContentType.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { unreadCount } from "#lib/utils/groupChat.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { tick } from "svelte";

	/**
	 * A mix's page (docs/mixes.md, "Phase 2"): the review surface. The
	 * MixPanel with the chosen mix (the address names it; choosing another
	 * goes to its page), the song's chat in a panel, one popover to post or
	 * edit a comment on the mix (positions as time), the share popover aimed
	 * at the mix, and uploads that open the new mix's page.
	 */
	let { data } = $props();

	let mix = $derived(data.mixes.find((m) => m.id === data.mixId) ?? null);
	const songPath = $derived(
		`/${data.account.slug}/projects/${data.song.project.slug}/${data.song.slug}`,
	);
	const mixPath = (id: string) => `${songPath}/mixes/${id}`;
	let membership = $derived(data.memberships?.find((m) => m.accountId === data.account.id));
	let isAdmin = $derived(membership?.role === "owner" || membership?.role === "admin");
	let mixPanel = $state<MixPanel | null>(null);
	// The name, renamed in place in the header (the panel's title row is off here).
	let renaming = $state(false);
	let labelDraft = $state("");
	function startRename() {
		labelDraft = mix?.label ?? "";
		renaming = true;
	}
	async function commitRename() {
		if (!renaming || !mix) return;
		renaming = false;
		const label = labelDraft.trim();
		if (label && label !== mix.label) await renameMixRow(mix, label);
	}
	function onlabelkeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			void commitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			renaming = false;
		}
	}
	/** A position on a mix is time, never bars (docs/mixes.md). */
	const mixPos = (seconds: number) => formatTime(seconds, 2);

	// ---- uploads: the new mix's page opens ----
	let mixJobs = $state<{ name: string; percent: number; error?: string; decoding?: boolean }[]>([]);
	let mixBusy = $state(false);
	let mixCtx: AudioContext | null = null;
	async function uploadMixes(picked: File[]) {
		if (picked.length === 0 || mixBusy) return;
		const unsupported = picked.filter((f) => !demoContentType(f.name));
		const tooBig = picked.filter((f) => f.size > STEM_MAX_BYTES);
		const room = Math.max(0, MAX_MIXES_PER_SONG - data.mixes.length);
		if (unsupported.length) {
			notify(
				`Not a supported format (${MIX_FORMAT_LIST}): ${unsupported.map((f) => f.name).join(", ")}`,
				{ kind: "error" },
			);
			return;
		}
		if (tooBig.length) {
			notify(
				`Over the ${formatBytes(STEM_MAX_BYTES)} limit: ${tooBig.map((f) => f.name).join(", ")}`,
				{ kind: "error" },
			);
			return;
		}
		if (picked.length > room) {
			notify(
				`Only ${room} more ${room === 1 ? "mix" : "mixes"} fit on this song (${MAX_MIXES_PER_SONG} max).`,
				{ kind: "error" },
			);
			return;
		}
		mixBusy = true;
		mixJobs = picked.map((f) => ({ name: f.name, percent: 0 }));
		mixCtx ??= new AudioContext();
		let last: string | null = null;
		for (const [i, file] of picked.entries()) {
			try {
				const { mixId } = await uploadMixFile(
					file,
					() =>
						postJson<{
							mixId: string;
							version: number;
							pathname: string;
							access?: "public" | "private";
						}>("/api/mixes", { songId: data.song.id, filename: file.name, sizeBytes: file.size }),
					{
						ctx: mixCtx,
						onProgress: (percent) => (mixJobs[i].percent = percent),
						onDecoding: () => (mixJobs[i].decoding = true),
					},
				);
				last = mixId;
			} catch (e) {
				mixJobs[i].error = errorMessage(e);
			}
		}
		mixBusy = false;
		if (mixJobs.every((j) => !j.error)) mixJobs = [];
		if (last) {
			notify(picked.length === 1 ? "Mix uploaded" : `${picked.length} mixes uploaded`);
			await goto(mixPath(last), { invalidateAll: true });
		}
	}
	async function removeMixRow(m: PanelMix) {
		if (!confirm(`Remove mix v${m.version} "${m.label}"? Its comments and file are deleted.`))
			return;
		try {
			await removeMix({ id: m.id });
			notify(`Mix v${m.version} removed`);
			// The newest of what is left, else the song.
			const next = data.mixes
				.filter((x) => x.id !== m.id)
				.toSorted((a, b) => b.version - a.version)[0];
			await goto(next ? mixPath(next.id) : songPath, { invalidateAll: true });
		} catch (e) {
			notify(`Could not remove it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function renameMixRow(m: PanelMix, label: string) {
		try {
			await renameMix({ id: m.id, label });
			await goto(mixPath(m.id), { invalidateAll: true });
		} catch (e) {
			notify(`Could not rename it: ${errorMessage(e)}`, { kind: "error" });
		}
	}
	async function saveMixNotes(m: PanelMix, notes: string) {
		try {
			await setMixNotes({ id: m.id, notes });
			notify("Notes saved");
			await goto(mixPath(m.id), { invalidateAll: true });
		} catch (e) {
			notify(`Could not save the notes: ${errorMessage(e)}`, { kind: "error" });
			throw e;
		}
	}

	// ---- the comment popover: one, to post or edit ----
	let commentPanel = $state<HTMLDivElement | null>(null);
	let commentDraft = $state<{ id: string | null; title: string; body: string; at: string }>({
		id: null,
		title: "",
		body: "",
		at: "",
	});
	function openComment(draft: Partial<typeof commentDraft> = {}) {
		commentDraft = { id: null, title: "", body: "", at: "", ...draft };
		const f = commentDraft.id ? updateComment.fields : createComment.fields;
		f.title.set(commentDraft.title);
		f.body.set(commentDraft.body);
		f.position.set(commentDraft.at);
		commentPanel?.showPopover();
	}
	function editComment(c: MixComment) {
		openComment({ id: c.id, title: c.title, body: c.body, at: c.at === null ? "" : mixPos(c.at) });
	}

	// ---- ⌘-click on the waveform: Seek here, Comment here ----
	let menuAt = $state<{ seconds: number; x: number; y: number } | null>(null);
	function closeMenu(e: Event) {
		if (menuAt && !(e.target as HTMLElement).closest("[data-mix-context]")) menuAt = null;
	}

	// ---- share by email, aimed at this mix ----
	let sharePanel = $state<HTMLDivElement | null>(null);
	let shareTo = $state("");
	let shareMessage = $state("");
	let shareBusy = $state(false);
	let shareError = $state<string | null>(null);
	let isPrivate = $derived(data.song.isPrivate || data.song.project.isPrivate);
	async function sendShare(e: SubmitEvent) {
		e.preventDefault();
		if (!mix) return;
		shareError = null;
		shareBusy = true;
		try {
			const { sent } = await shareSong({
				songId: data.song.id,
				mixId: mix.id,
				to: shareTo,
				message: shareMessage,
			});
			shareTo = "";
			shareMessage = "";
			notify(`Sent to ${sent}`);
			sharePanel?.hidePopover();
		} catch (err) {
			shareError = errorMessage(err);
		} finally {
			shareBusy = false;
		}
	}
	let mixUrl = $derived(mix ? `${page.url.origin}${mixPath(mix.id)}` : "");

	// ---- the song's chat, as on the song page ----
	let chatOpen = $state(false);
	// svelte-ignore state_referenced_locally
	let chatMessages = $state(data.chat?.messages ?? []);
	// svelte-ignore state_referenced_locally
	let chatReadAt = $state<number | null>(data.chat?.readAt ?? null);
	let chatUnread = $derived(
		data.chat ? unreadCount(chatMessages, chatReadAt, data.user?.id ?? null) : 0,
	);
	afterNavigate(() => {
		chatMessages = data.chat?.messages ?? [];
		chatReadAt = data.chat?.readAt ?? null;
		if (data.chat && page.url.searchParams.get("open") === "chat") {
			chatOpen = true;
			const url = new URL(page.url.href);
			url.searchParams.delete("open");
			replaceState(url, {});
		}
	});
	let title = $derived(mix ? `Mix v${mix.version} · ${data.song.title}` : data.song.title);
</script>

<svelte:head>
	<title>{pageTitle(title)}</title>
</svelte:head>

<svelte:window onpointerdown={closeMenu} />

<main class="page">
	<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="text-sm opacity-80">
				<a class="underline underline-offset-2" href={songPath}>{data.song.title}</a>
				<span class="opacity-60">·</span>
				<a
					class="underline underline-offset-2"
					href="/{data.account.slug}/projects/{data.song.project.slug}">{data.song.project.name}</a
				>
			</p>
			<h1 class="app-page-heading">
				{#if mix}Mix v{mix.version}{:else}Mixes{/if}
				<span class="opacity-70 text-0.8em">of {data.song.title}</span>
			</h1>
			{#if mix}
				<p class="flex flex-wrap items-baseline gap-x-2 text-15px opacity-90">
					{#if renaming}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="field w-72 max-w-full py-0"
							aria-label="Mix name"
							maxlength="120"
							autofocus
							bind:value={labelDraft}
							onkeydown={onlabelkeydown}
							onblur={() => void commitRename()}
						/>
					{:else}
						<span>{mix.label}</span>
						{#if data.canEdit}
							<button
								type="button"
								class="inline-flex h-4 w-4 items-center justify-center rounded bg-blue-300/5 text-11px opacity-90 hover-bg-blue-300/15 hover-text-accent hover-opacity-100 align-middle"
								title="Rename this mix"
								aria-label="Rename Mix"
								onclick={startRename}
							>
								<span class="i-ph-pencil block" aria-hidden="true"></span>
							</button>
						{/if}
					{/if}
					<span class="opacity-70">
						{#if mix.uploader}· {mix.uploader.name}{/if} · {formatDate(mix.createdAt)}
					</span>
				</p>
			{/if}
		</div>
		<div class="flex flex-wrap justify-end gap-2">
			{#if mix && data.canComment}
				<button
					type="button"
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					title="Comment on this mix"
					aria-label="Comment on this mix"
					onclick={() => openComment()}
				>
					<span class="block i-ph-chat-circle-dots"></span>
				</button>
			{/if}
			{#if mix}
				<ContextMenu
					ariaLabel="Download"
					title="Download the mix"
					clearButtonBaseClasses={true}
					buttonClasses="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					iconClass="i-ph-download-simple"
					position="bottom right"
					items={[
						{
							id: "mix-download-source",
							kind: "button",
							label: `Download .${mix.filename.split(".").pop()} (${formatBytes(mix.sizeBytes)})`,
							title: "The file as uploaded",
							iconClass: "i-ph-download-simple",
							action: () => void saveAs(mix.url, mix.filename),
						},
						{
							id: "mix-download-mp3",
							kind: "button",
							label: "Download .mp3",
							title: "The MP3 made for streaming",
							iconClass: "i-ph-download-simple",
							condition: !!mix.playbackUrl && !/\.mp3$/i.test(mix.filename),
							action: () =>
								void saveAs(mix.playbackUrl ?? "", `${mix.filename.replace(/\.[^.]+$/, "")}.mp3`),
						},
					]}
				/>
			{/if}
			{#if mix && data.canEdit}
				<button
					type="button"
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					title="Share this mix by email"
					aria-label="Share mix"
					onclick={() => sharePanel?.showPopover()}
				>
					<span class="block i-ph-paper-plane-tilt"></span>
				</button>
				<button
					type="button"
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					title="Upload a new mix"
					aria-label="Upload a new mix"
					onclick={() => mixPanel?.pick()}
				>
					<span class="block i-ph-upload-simple"></span>
				</button>
				<button
					type="button"
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
					title="Remove this mix, its comments and its file"
					aria-label="Delete Mix"
					onclick={() => void removeMixRow(mix)}
				>
					<span class="block i-ph-trash"></span>
				</button>
			{/if}
			{#if data.chat}
				<button
					class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent relative"
					type="button"
					title={chatUnread ? `Chat: ${chatUnread} new` : "Chat about this song"}
					aria-label="Chat{chatUnread ? ` (${chatUnread} new)` : ''}"
					aria-pressed={chatOpen}
					onclick={() => (chatOpen = !chatOpen)}
				>
					<IconChat class="block" />
					{#if chatUnread}
						<span
							class="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-accent ring-2 ring-oxford"
							aria-hidden="true"
						></span>
					{/if}
				</button>
			{/if}
			<a
				class="button button-sm bg-blue-300/5 border-current/40 hover-border-accent"
				href={songPath}
				title="The song: stems, chart, lyrics, notes"
			>
				<span class="i-ph-arrow-u-up-left" aria-hidden="true"></span>
				Song
			</a>
		</div>
	</header>

	<div class="max-w-3xl">
		<MixPanel
			bind:this={mixPanel}
			selectedId={data.mixId}
			mixes={data.mixes}
			comments={data.mixComments}
			canEdit={data.canEdit}
			canComment={data.canComment}
			me={data.user ? { id: data.user.id } : null}
			{isAdmin}
			jobs={mixJobs}
			card={commentCard}
			header={false}
			onchoose={(id) => void goto(mixPath(id))}
			onfiles={(files) => void uploadMixes(files)}
			onrename={renameMixRow}
			onnotes={saveMixNotes}
			onremove={(m) => void removeMixRow(m)}
			onshare={() => sharePanel?.showPopover()}
			oncomment={(_m, seconds) => openComment({ at: seconds === null ? "" : mixPos(seconds) })}
			oneditcomment={editComment}
			oncontext={(_m, seconds, x, y) => (menuAt = { seconds, x, y })}
		/>
	</div>

	{#if data.chat}
		<div class="{chatOpen ? '' : 'hidden'} mt-6 max-w-full lg:contents">
			<FloatingPanel
				open={chatOpen}
				title="Chat"
				storageKey="stemshovel.song.chat-panel"
				width={440}
				height={600}
				onminimise={() => (chatOpen = false)}
			>
				<SongChat
					songId={data.song.id}
					bind:messages={chatMessages}
					bind:readAt={chatReadAt}
					me={data.user ? { id: data.user.id, name: data.user.name } : null}
					{isAdmin}
					canWrite={data.canComment}
					onseek={(s) => mixPanel?.seekTo(s)}
				/>
			</FloatingPanel>
		</div>
	{/if}
</main>

{#snippet commentCard(id: string)}
	{@const c = data.mixComments.find((x) => x.id === id)}
	{#if c}
		<div class="flex items-baseline justify-between gap-3">
			<h3 class="font-600">{c.title}</h3>
			{#if c.editedAt}<span
					class="rounded border border-current/30 px-1 text-9px uppercase tracking-wider"
					>edited</span
				>{/if}
		</div>
		<p class="mt-1 text-12px opacity-70">
			{c.authorName} · {formatDate(c.createdAt)}{#if c.at !== null}
				· {formatTime(c.at, 1)}{/if}
		</p>
		<p class="mt-2 whitespace-pre-line">{c.body}</p>
		<div class="mt-3 flex gap-3 text-12px">
			{#if c.at !== null}
				<button type="button" class="link-dim" onclick={() => mixPanel?.seekTo(c.at ?? 0)}
					>Go to</button
				>
			{/if}
			{#if data.user?.id === c.userId}
				<button type="button" class="link-dim" onclick={() => editComment(c)}>Edit</button>
			{/if}
		</div>
	{/if}
{/snippet}

{#if menuAt && mix}
	<!-- Ctrl / ⌘-click menu at the pointer -->
	<div
		class="fixed z-40 w-56 rounded border border-white/15 bg-oxford-800 p-1 text-sm shadow-lg shadow-black/50"
		style:left="{Math.min(menuAt.x, window.innerWidth - 240)}px"
		style:top="{menuAt.y + 4}px"
		role="menu"
		data-mix-context
	>
		<div class="truncate px-3 py-1.5 text-xs opacity-70">
			{mix.label} · {formatTime(menuAt.seconds, 1)}
		</div>
		<button
			class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
			type="button"
			role="menuitem"
			onclick={() => {
				mixPanel?.seekTo(menuAt?.seconds ?? 0);
				menuAt = null;
			}}
		>
			<span class="i-ph-skip-forward mr-2" aria-hidden="true"></span>Seek here
		</button>
		{#if data.canComment}
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				type="button"
				role="menuitem"
				onclick={() => {
					const at = mixPos(menuAt?.seconds ?? 0);
					menuAt = null;
					openComment({ at });
				}}
			>
				<span class="i-ph-chat-circle-dots mr-2" aria-hidden="true"></span>Comment here
			</button>
		{/if}
	</div>
{/if}

{#if data.canComment && mix}
	<!-- One popover for posting and editing a comment on the mix. -->
	<div
		id="song-comment"
		popover="auto"
		bind:this={commentPanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">
				{commentDraft.id ? "Edit comment" : "Add a comment"} on mix v{mix.version}
			</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-comment"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		{#if commentDraft.id}
			{@const remoteForm = updateComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment updated");
						commentPanel?.hidePopover();
					}
				})}
			>
				<input {...remoteForm.fields.id.as("hidden", commentDraft.id)} />
				{@render commentFields(remoteForm)}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Saving…" : "Save"}</button
				>
			</form>
		{:else}
			{@const remoteForm = createComment}
			<form
				class="grid gap-3"
				{...remoteForm.enhance(async ({ submit }) => {
					await submit();
					if (!remoteForm.fields.allIssues()) {
						notify("Comment posted");
						commentPanel?.hidePopover();
					}
				})}
			>
				<input {...remoteForm.fields.songId.as("hidden", data.song.id)} />
				<input {...remoteForm.fields.mixId.as("hidden", mix.id)} />
				{@render commentFields(remoteForm)}
				<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
					>{remoteForm.pending ? "Posting…" : "Post comment"}</button
				>
			</form>
		{/if}
	</div>
{/if}

{#snippet commentFields(remoteForm: typeof createComment | typeof updateComment)}
	<label class="block">
		<span class="text-sm opacity-80">Title</span>
		<input
			class="mt-1 field"
			{...remoteForm.fields.title.as("text", commentDraft.title)}
			required
		/>
		{#each remoteForm.fields.title.issues() ?? [] as issue (issue.message)}
			<p class="mt-1 text-sm text-red-400">{issue.message}</p>
		{/each}
	</label>
	<label class="block">
		<span class="text-sm opacity-80">Comment</span>
		<textarea
			class="mt-1 field text-sm"
			rows="5"
			{...remoteForm.fields.body.as("text", commentDraft.body)}
			required></textarea>
		{#each remoteForm.fields.body.issues() ?? [] as issue (issue.message)}
			<p class="mt-1 text-sm text-red-400">{issue.message}</p>
		{/each}
	</label>
	<label class="block">
		<span class="text-sm opacity-80"
			>Position <span class="opacity-60">(optional, as time)</span></span
		>
		<span class="mt-1 flex items-center gap-2">
			<input
				class="field font-mono text-sm"
				placeholder="1:23.4"
				{...remoteForm.fields.position.as("text", commentDraft.at)}
			/>
			<button
				class="button button-xs shrink-0"
				type="button"
				disabled={!mixPanel}
				onclick={() => remoteForm.fields.position.set(mixPos(mixPanel?.currentPosition() ?? 0))}
				>Playhead</button
			>
		</span>
		{#each remoteForm.fields.position.issues() ?? [] as issue (issue.message)}
			<p class="mt-1 text-sm text-red-400">{issue.message}</p>
		{/each}
	</label>
{/snippet}

{#if data.canEdit && mix}
	<!-- Share this mix by email; the viewing links made here land on it (docs/mixes.md). -->
	<div
		id="song-share"
		popover="auto"
		bind:this={sharePanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Share mix v{mix.version}</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="song-share"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<p class="mb-3 text-sm text-dim">
			Sends a link that opens this mix{#if isPrivate}, as a viewing link made for the recipient (it
				appears below and can be revoked){/if}. Links made below land on the mix too.
		</p>
		{#if !isPrivate}
			<div class="mb-3 flex flex-wrap items-center gap-3 text-sm">
				<code class="min-w-0 truncate font-mono text-12px opacity-80">{mixUrl}</code>
				<button
					type="button"
					class="link-dim text-12px"
					onclick={() =>
						navigator.clipboard
							.writeText(mixUrl)
							.then(() => notify("Link copied"))
							.catch(() => notify("Could not copy the link", { kind: "error" }))}>Copy link</button
				>
			</div>
		{/if}
		<form class="grid gap-3" onsubmit={sendShare}>
			<label class="block">
				<span class="text-sm text-dim">To</span>
				<input class="mt-1 field" type="email" bind:value={shareTo} required autocomplete="off" />
			</label>
			<label class="block">
				<span class="text-sm text-dim">Note <span class="opacity-60">(optional)</span></span>
				<textarea class="mt-1 field text-sm" rows="3" bind:value={shareMessage}></textarea>
			</label>
			{#if shareError}<p class="text-sm text-red-400" role="alert">{shareError}</p>{/if}
			<button class="button-accent justify-self-start" disabled={shareBusy}>
				{shareBusy ? "Sending…" : "Send"}
			</button>
		</form>
		<div class="mt-6 border-t border-white/15 pt-4">
			<ShareLinks
				target={{ songId: data.song.id, mixId: mix.id }}
				links={data.shareLinks}
				{isPrivate}
			/>
		</div>
	</div>
{/if}
