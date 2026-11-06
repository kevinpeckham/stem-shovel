<script lang="ts">
	import { SONG_CHANGE_KINDS } from "#lib/constants/songChanges.js";
	import { artistLine } from "#lib/utils/artistLine.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatMonth } from "#lib/utils/formatMonth.js";
	import { formatSongChange } from "#lib/utils/formatSongChange.js";
	import { keyLine } from "#lib/utils/keyLine.js";
	import type { CreditRole } from "#lib/val/CreditRoleSchema.js";
	import type { SongChange } from "#lib/val/SongChangeSchema.js";

	interface Props {
		/** The song as the page loads it: what the popover spells out. */
		song: {
			title: string;
			description: string | null;
			version: string;
			writtenOn: string | null;
			stemsUpdatedAt: Date | null;
			changes: SongChange[];
			credits: { role: CreditRole; artist: { name: string } | null }[];
			project: { slug: string; name: string };
		};
		account: { slug: string; name: string };
		/** How many of the song's stems are ready to play. */
		readyCount: number;
		/** A member sees the hint to fill the details in when nothing is. */
		canEdit: boolean;
	}
	let { song, account, readyCount, canEdit }: Props = $props();

	// The song's fixed tempo, key and meter.
	// The key names every key the song moves through ("C major (also A♭ major, F major)", a user's wording).
	let metaLine = $derived(
		SONG_CHANGE_KINDS.map((kind) =>
			kind === "key"
				? keyLine(song.changes)
				: (() => {
						const c = song.changes.find((x) => x.kind === kind);
						return c ? formatSongChange(c) : "";
					})(),
		)
			.filter((line) => line !== "")
			.join(" · "),
	);
	// Credits by role (song_credit rows with their artist).
	const creditsOf = (role: CreditRole) =>
		song.credits.filter((c) => c.role === role && c.artist).map((c) => c.artist!.name);
	let composerLine = $derived(artistLine(creditsOf("composer")));
	let producerLine = $derived(artistLine(creditsOf("producer")));
	// "Written by X, produced by Y, first written June 2019".
	let writtenLine = $derived(
		[
			composerLine ? `Written by ${composerLine}` : "",
			producerLine ? `produced by ${producerLine}` : "",
			song.writtenOn ? `first written ${formatMonth(song.writtenOn)}` : "",
		]
			.filter(Boolean)
			.join(", "),
	);
</script>

<!-- Song info: what the header used to spell out, for anyone who opens it. -->
<div
	id="song-info"
	popover="auto"
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">{song.title}</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="song-info"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-15px">
		{#if song.description}
			<dt class="opacity-70">About</dt>
			<dd class="max-w-prose whitespace-pre-line">{song.description}</dd>
		{/if}
		{#if writtenLine}
			<dt class="opacity-70">Written</dt>
			<dd>{writtenLine.replace(/^Written by /, "")}</dd>
		{/if}
		{#if metaLine}
			<dt class="opacity-70">Music</dt>
			<dd>{metaLine}</dd>
		{/if}
		<dt class="opacity-70">Version</dt>
		<dd>v{song.version}</dd>
		<dt class="opacity-70">Stems</dt>
		<dd>
			{readyCount}
			{readyCount === 1 ? "stem" : "stems"}{#if song.stemsUpdatedAt}, last changed {formatDate(
					song.stemsUpdatedAt,
				)}{/if}
		</dd>
		<dt class="opacity-70">Project</dt>
		<dd>
			<a class="link" href="/{account.slug}/projects/{song.project.slug}">{song.project.name}</a>
			from {account.name}
		</dd>
	</dl>
	{#if !song.description && !writtenLine && !metaLine && canEdit}
		<p class="mt-4 text-sm opacity-70">
			Add a description, credits, tempo, key and time signature in song settings.
		</p>
	{/if}
</div>
