<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import { CREDIT_ROLE_LABELS } from "#lib/constants/creditRoles.js";
	import { FRAME_RATES } from "#lib/constants/frameRates.js";
	import { POSITION_MODE_LABELS } from "#lib/constants/positionModes.js";
	import { updateSong } from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import type { DetailsSong, SongDetails } from "#lib/state/songDetails.svelte.js";
	import { slugify } from "#lib/utils/slugify.js";
	import { CREDIT_ROLES, type CreditRole } from "#lib/val/CreditRoleSchema.js";

	/**
	 * The song settings' Details tab: the settings form (title, URL, credits,
	 * first written, start and end, version, frame rate, description) on the
	 * `updateSong` remote form. The state is the page's (SongDetails in
	 * src/lib/state).
	 */
	interface Props {
		/** The form's entries, the position checks and the credits. */
		details: SongDetails;
		/** The position helpers every editor shares (editPos, the readout mode). */
		changes: SongChanges;
		/** The song as saved, with its project's slug and its credits. */
		song: DetailsSong & {
			project: { slug: string };
			credits: { id: string; role: CreditRole; artist: { name: string } }[];
		};
		/** The account's artist directory, for the credits picker. */
		artists: { id: string; name: string }[];
		accountSlug: string;
		/** The Stem Player's engine, for the Playhead buttons. */
		engine: StemEngine | null;
		/** After a successful save (the page closes the popover). */
		onsaved: () => void;
	}

	let { details, changes, song, artists, accountSlug, engine, onsaved }: Props = $props();

	const fields = updateSong.fields;
	let mode = $derived(changes.mode);
</script>

{#snippet issues(list: { message: string }[] | undefined)}
	{#each list ?? [] as issue (issue.message)}
		<p class="mt-1 text-sm text-red-400">{issue.message}</p>
	{/each}
{/snippet}

<!-- Start of bar 1 and End: typed in the readout's format, carried as seconds in the hidden field. -->
{#snippet position(
	label: string,
	entry: "startAtEntry" | "endAtEntry",
	field: "startAt" | "endAt",
	hint: string,
)}
	<label class="block">
		<span class="text-sm opacity-90">{label} <span class="opacity-60">(optional)</span></span>
		<span class="mt-1 flex items-center gap-2">
			<input
				class="field font-mono text-sm"
				placeholder={POSITION_PLACEHOLDER[mode]}
				autocomplete="off"
				bind:value={details[entry]}
				aria-label={label}
			/>
			<input {...fields[field].as("hidden", "")} />
			<button
				class="button button-xs shrink-0"
				type="button"
				title="Use the transport's current position"
				disabled={!engine || engine.status !== "ready"}
				onclick={() => (details[entry] = changes.editPos(engine?.position ?? 0))}
			>
				Playhead
			</button>
		</span>
		<span class="mt-1 block text-xs opacity-90">{hint}</span>
		{@render issues(fields[field].issues())}
	</label>
{/snippet}

{#snippet identity()}
	<label class="block">
		<span class="text-sm opacity-90">Title</span>
		<input class="mt-1 field" {...fields.title.as("text", song.title)} required />
		{@render issues(fields.title.issues())}
	</label>
	<label class="block">
		<span class="text-sm opacity-90">URL</span>
		<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
			<span class="truncate pl-3 text-sm opacity-90">/projects/{song.project.slug}/</span>
			<input
				class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
				{...fields.slug.as("text", song.slug)}
				required
			/>
		</span>
		{@render issues(fields.slug.issues())}
		<span class="mt-1 block text-xs opacity-80"
			>Change it and the old address keeps working as a redirect.</span
		>
		{#if details.slug !== slugify(details.title)}
			<button
				class="mt-1 text-xs link"
				type="button"
				onclick={() => {
					fields.slug.set(slugify(details.title));
				}}>Use title</button
			>
		{/if}
	</label>
{/snippet}

{#snippet creditFields()}
	<!-- Credits: artists from the account's directory (or new ones by name), one field per role, saved as you go. -->
	{#each CREDIT_ROLES as role (role)}
		{@const credits = song.credits.filter((c) => c.role === role)}
		<div class="block">
			<span class="text-sm opacity-90"
				>{CREDIT_ROLE_LABELS[role].many}
				<span class="opacity-60">(optional)</span></span
			>
			{#if credits.length > 0}
				<ul class="mt-1 flex flex-wrap gap-2" aria-label={CREDIT_ROLE_LABELS[role].many}>
					{#each credits as c (c.id)}
						<li
							class="flex items-center gap-1 rounded border border-white/15 bg-white/5 py-0.5 pl-2 pr-1 text-sm"
						>
							{c.artist.name}
							<button
								class="grid h-5 w-5 place-items-center rounded hover:bg-white/10"
								type="button"
								aria-label="Remove {c.artist.name} as {CREDIT_ROLE_LABELS[role].one.toLowerCase()}"
								disabled={details.creditBusy}
								onclick={() => details.removeCredit(c.id)}
							>
								<span class="i-ph-x text-12px" aria-hidden="true"></span>
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="mt-1 flex gap-2">
				<input
					class="field text-sm"
					list="song-artist-names"
					placeholder="Add {CREDIT_ROLE_LABELS[role].one.toLowerCase()}, then Enter"
					aria-label="Add {CREDIT_ROLE_LABELS[role].one.toLowerCase()}"
					autocomplete="off"
					bind:value={details.creditDraft[role]}
					disabled={details.creditBusy}
					onkeydown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							void details.addCredit(role);
						}
					}}
				/>
				<button
					class="button button-xs shrink-0"
					type="button"
					disabled={details.creditBusy || !details.creditDraft[role].trim()}
					onclick={() => details.addCredit(role)}>Add</button
				>
			</div>
		</div>
	{/each}
	<datalist id="song-artist-names">
		{#each artists as a (a.id)}
			<option value={a.name}></option>
		{/each}
	</datalist>
	<p class="text-xs opacity-70 sm:col-span-2">
		Artists show under the title; with none, the account's name does. Composers make the "Written
		by" line. <a class="link" href="/{accountSlug}/artists">Manage artists</a>.
	</p>
{/snippet}

{#snippet positions()}
	<label class="block">
		<span class="text-sm opacity-90">First written <span class="opacity-60">(optional)</span></span>
		<!-- color-scheme dark: the browser draws the calendar icon light on the dark field. -->
		<input
			class="mt-1 field [color-scheme:dark]"
			type="date"
			{...fields.writtenOn.as("text", song.writtenOn ?? "")}
		/>
		{@render issues(fields.writtenOn.issues())}
	</label>
	{@render position(
		"Start of bar 1",
		"startAtEntry",
		"startAt",
		"Leading silence or a count-in: bars are counted from here.",
	)}
	{@render position("End", "endAtEntry", "endAt", "Where the song ends, for the bars total.")}
	<p
		class="flex items-start gap-2 rounded border border-white/15 bg-blue-300/5 px-4 py-3 text-xs opacity-90 sm:col-span-2"
	>
		<span class="i-ph-info mt-px shrink-0 text-14px" aria-hidden="true"></span>
		<span>
			Positions read and are typed as {POSITION_MODE_LABELS[mode].toLowerCase()} — the transport's readout
			sets the format. Any of time (1:23.4), timecode (01:23:15.72) or bars (12|3) is accepted anywhere.
		</span>
	</p>
{/snippet}

{#snippet release()}
	<label class="block">
		<span class="text-sm opacity-90">Version</span>
		<input
			class="mt-1 field font-mono text-sm"
			placeholder="0.0.1"
			autocomplete="off"
			{...fields.version.as("text", song.version)}
		/>
		<span class="mt-1 block text-xs opacity-90">
			Yours to manage (major.minor.patch); after stems change you are offered a bump.
		</span>
		{@render issues(fields.version.issues())}
	</label>
	<label class="block">
		<span class="text-sm opacity-90">Frame rate <span class="opacity-60">(timecode)</span></span>
		<select
			class="mt-1 field text-sm"
			{...fields.frameRate.as(
				"select",
				String(song.frameRate) as `${(typeof FRAME_RATES)[number]}`,
			)}
		>
			{#each FRAME_RATES as rate (rate)}
				<option value={String(rate)}>{rate} fps</option>
			{/each}
		</select>
	</label>
	<label class="block sm:col-span-2">
		<span class="text-sm opacity-90">Description <span class="opacity-60">(optional)</span></span>
		<textarea
			class="mt-1 field text-sm"
			rows="3"
			{...fields.description.as("text", song.description)}></textarea>
		{@render issues(fields.description.issues())}
	</label>
{/snippet}

<form
	{...updateSong.enhance(async ({ submit }) => {
		if (!details.preparePositions()) return;
		await submit();
		if (!fields.allIssues()) {
			notify("Song settings saved");
			onsaved();
		}
	})}
>
	<input {...fields.id.as("hidden", song.id)} />
	<div class="grid gap-4 sm:grid-cols-2">
		{@render identity()}
		{@render creditFields()}
		{@render positions()}
		{@render release()}
	</div>
	{#if details.positionError}
		<p class="mt-2 text-sm text-red-400" role="alert">{details.positionError}</p>
	{/if}
	{#if details.slug.trim() !== song.slug}
		<p class="mt-2 text-xs opacity-90">Changing the URL breaks existing links to this song.</p>
	{/if}
	<div class="mt-4">
		<button
			class="button-accent disabled:opacity-40"
			disabled={!details.settingsDirty || !!updateSong.pending}
		>
			{updateSong.pending ? "Saving…" : "Save"}
		</button>
	</div>
</form>
