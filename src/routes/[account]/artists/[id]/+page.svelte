<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { notify } from "$lib/state/notifications.svelte";
	import { clearForm } from "$lib/utils/clearForm";
	import { CREDIT_ROLE_LABELS } from "$lib/constants/creditRoles";
	import {
		addArtistMember,
		deleteArtist,
		inviteArtistMember,
		removeArtistMember,
		updateArtist,
	} from "$lib/remote/artists.remote";

	let { data } = $props();
	const fields = updateArtist.fields;
	/** The songs crediting this artist, one row per song with its roles. */
	let songs = $derived.by(() => {
		const by = new Map<
			string,
			{ song: (typeof data.artist.credits)[number]["song"]; roles: string[] }
		>();
		for (const c of data.artist.credits) {
			const row = by.get(c.song.id) ?? { song: c.song, roles: [] };
			row.roles.push(CREDIT_ROLE_LABELS[c.role].one.toLowerCase());
			by.set(c.song.id, row);
		}
		return [...by.values()];
	});
</script>

<svelte:head>
	<title>{pageTitle(`${data.artist.name} · Artists`)}</title>
</svelte:head>

<main class="page grid gap-8">
	<header class="max-w-article">
		<a class="link-dim text-sm" href="/{data.account.slug}/artists">← Artists</a>
		<h1 class="heading-2 mt-2">{data.artist.name}</h1>
		{#if data.artist.website}
			<a class="link-dim text-sm" href={data.artist.website} rel="noopener">{data.artist.website}</a
			>
		{/if}
	</header>

	{#if data.canEdit}
		<section class="max-w-article">
			<h2 class="heading-3">Details</h2>
			<form
				class="grid gap-4"
				{...updateArtist.enhance(async ({ submit }) => {
					await submit();
					if (updateArtist.result?.saved) notify("Artist saved");
				})}
			>
				<input {...fields.id.as("hidden", data.artist.id)} />
				<div class="grid gap-4 sm:grid-cols-2">
					<label class="block">
						<span class="text-sm text-dim">Name</span>
						<input class="mt-1 field" {...fields.name.as("text", data.artist.name)} required />
						{#each fields.name.issues() ?? [] as issue (issue.message)}
							<p class="mt-1 text-sm text-red-400">{issue.message}</p>
						{/each}
					</label>
					<label class="block">
						<span class="text-sm text-dim">Sort as <span class="opacity-60">(optional)</span></span>
						<input
							class="mt-1 field"
							{...fields.sortName.as("text", data.artist.sortName)}
							placeholder="Beatles, The"
						/>
					</label>
				</div>
				<label class="block">
					<span class="text-sm text-dim">Website <span class="opacity-60">(optional)</span></span>
					<input
						class="mt-1 field"
						type="url"
						inputmode="url"
						{...fields.website.as("text", data.artist.website)}
						placeholder="https://"
					/>
					{#each fields.website.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm text-dim">Notes <span class="opacity-60">(optional)</span></span>
					<textarea
						class="mt-1 field text-sm"
						rows="3"
						placeholder="Label, agent, anything the account should know."
						{...fields.note.as("text", data.artist.note)}></textarea>
				</label>
				<div>
					<button class="button-accent" disabled={!!updateArtist.pending}>
						{updateArtist.pending ? "Saving…" : "Save"}
					</button>
				</div>
			</form>
		</section>

		<section class="max-w-article">
			<h2 class="heading-3">People</h2>
			{#if data.artist.members.length === 0}
				<p class="text-sm text-dim">Nobody listed yet.</p>
			{:else}
				<ul class="surface divide-y divide-white/10 text-15px" aria-label="People">
					{#each data.artist.members as m (m.id)}
						{@const remove = removeArtistMember.for(m.id)}
						{@const invite = inviteArtistMember.for(m.id)}
						<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3">
							<span class="min-w-0">
								<span class="font-600">{m.name}</span>
								{#if m.role}<span class="text-dim"> · {m.role}</span>{/if}
								{#if m.email}
									<span class="block text-13px text-dim">
										{m.email}{#if m.inAccount}
											<span
												class="ml-2 rounded border border-green-400/60 px-1.5 py-0.5 text-10px uppercase tracking-wider text-green-400"
												>member</span
											>{/if}
									</span>
								{/if}
							</span>
							<span class="flex items-center gap-3 text-13px">
								{#if data.canInvite && m.email && !m.inAccount}
									<form
										{...invite.enhance(async ({ submit }) => {
											await submit();
											if (invite.result?.sent) notify(`Invitation sent to ${invite.result.email}`);
										})}
									>
										<input {...invite.fields.id.as("hidden", m.id)} />
										<input {...invite.fields.role.as("hidden", "member")} />
										<button class="button button-xs" disabled={!!invite.pending}>
											{invite.pending ? "Inviting…" : "Invite to account"}
										</button>
										{#each invite.fields.id.issues() ?? [] as issue (issue.message)}
											<p class="mt-1 text-red-400">{issue.message}</p>
										{/each}
									</form>
								{/if}
								<form
									{...remove.enhance(async ({ submit }) => {
										if (!confirm(`Remove ${m.name} from ${data.artist.name}?`)) return;
										await submit();
									})}
								>
									<input {...remove.fields.id.as("hidden", m.id)} />
									<button class="link-dim" disabled={!!remove.pending}>Remove</button>
								</form>
							</span>
						</li>
					{/each}
				</ul>
			{/if}
			<h3 class="mt-6 text-15px font-700">Add a person</h3>
			<form
				class="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
				{...addArtistMember.enhance(async ({ submit, element }) => {
					await submit();
					if (addArtistMember.result?.added) {
						notify("Person added");
						clearForm(addArtistMember);
						element.reset();
					}
				})}
			>
				<input {...addArtistMember.fields.artistId.as("hidden", data.artist.id)} />
				<label class="block">
					<span class="text-13px text-dim">Name</span>
					<input class="mt-1 field" {...addArtistMember.fields.name.as("text")} required />
					{#each addArtistMember.fields.name.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-13px text-dim">Does</span>
					<input
						class="mt-1 field"
						{...addArtistMember.fields.role.as("text")}
						placeholder="drums, vocals…"
					/>
				</label>
				<label class="block">
					<span class="text-13px text-dim">Email <span class="opacity-60">(optional)</span></span>
					<input
						class="mt-1 field"
						type="email"
						autocomplete="off"
						{...addArtistMember.fields.email.as("text")}
					/>
					{#each addArtistMember.fields.email.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-red-400">{issue.message}</p>
					{/each}
				</label>
				<button class="button button-sm" disabled={!!addArtistMember.pending}>
					{addArtistMember.pending ? "Adding…" : "Add"}
				</button>
			</form>
			<p class="mt-2 text-13px text-dim">
				With an email on file, an owner or admin can invite them into the account from here.
			</p>
		</section>
	{/if}

	<section class="max-w-article">
		<h2 class="heading-3">Songs</h2>
		{#if songs.length === 0}
			<p class="text-sm text-dim">Not credited on any song.</p>
		{:else}
			<ul class="surface divide-y divide-white/10 text-15px" aria-label="Songs">
				{#each songs as { song, roles } (song.id)}
					<li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
						<a
							class="font-600 hover-text-accent underline-offset-4 hover-underline"
							href="/{data.account.slug}/projects/{song.project.slug}/{song.slug}">{song.title}</a
						>
						<span class="text-13px text-dim">{song.project.name} · {roles.join(", ")}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if data.canEdit}
		<section class="max-w-article border-t border-white/15 pt-4">
			<form
				{...deleteArtist.enhance(async ({ submit }) => {
					if (
						!confirm(
							`Delete ${data.artist.name}? Its people and every credit naming it on ${songs.length} ${songs.length === 1 ? "song" : "songs"} go too.`,
						)
					)
						return;
					await submit();
				})}
			>
				<input {...deleteArtist.fields.id.as("hidden", data.artist.id)} />
				<button
					class="button text-red-400 hover-bg-red-400 hover-text-oxford"
					disabled={!!deleteArtist.pending}
				>
					<span class="i-ph-trash" aria-hidden="true"></span>
					{deleteArtist.pending ? "Deleting…" : "Delete artist"}
				</button>
			</form>
		</section>
	{/if}
</main>
