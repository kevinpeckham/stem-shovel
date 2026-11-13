<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import ArrangementNewPopover from "#lib/components/ArrangementNewPopover.svelte";
	import ArrangementRenamePopover from "#lib/components/ArrangementRenamePopover.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { MAX_ARRANGEMENTS } from "#lib/constants/arrangements.js";
	import { deleteArrangement } from "#lib/remote/arrangements.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { arrangementHref } from "#lib/utils/arrangementHref.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/** An alternate as the song page lists it (`data.song.arrangements`). */
	interface Arrangement {
		id: string;
		name: string;
		note: string;
		creator: { id: string; name: string } | null;
		/** It has its own tempo, key, time signature and start of bar 1 (docs/arrangements.md, "Settings of its own"). */
		settingsOwn?: boolean;
	}

	/**
	 * The arrangement switcher at the top of the song player's Stems view
	 * (docs/arrangements.md): Main and each alternate as links (the
	 * arrangement rides in the URL), the shown one's note and creator, and
	 * for an editor + (New arrangement) and, on an alternate, ⋯ with Rename,
	 * Duplicate and Delete. A viewer sees the row only when there is an
	 * alternate to switch to.
	 */
	interface Props {
		/** The song's alternates in order; Main is implicit. */
		arrangements: Arrangement[];
		/** The arrangement shown, null for Main. */
		arrangementId: string | null;
		songId: string;
		canEdit: boolean;
	}
	let { arrangements, arrangementId, songId, canEdit }: Props = $props();

	let current = $derived(arrangements.find((a) => a.id === arrangementId) ?? null);
	let tabs = $derived([{ id: null, name: "Main" }, ...arrangements]);
	/** Under the row for an alternate: its note, who made it, and whether it keeps time of its own. */
	let about = $derived(
		current
			? [
					current.note,
					current.creator ? `by ${current.creator.name}` : "",
					current.settingsOwn ? "own tempo" : "",
				]
					.filter(Boolean)
					.join(" · ")
			: "",
	);
	let atMax = $derived(arrangements.length >= MAX_ARRANGEMENTS);
	const maxTitle = `A song holds at most ${MAX_ARRANGEMENTS} arrangements besides Main`;
	let creatorPopover = $state<ArrangementNewPopover | null>(null);
	let renamePopover = $state<ArrangementRenamePopover | null>(null);

	/** Deletes the shown alternate after a confirmation, then goes back to Main. */
	async function remove(a: Arrangement) {
		if (
			!confirm(
				`Delete the arrangement "${a.name}"? Its stems go with it; stems shared with other arrangements stay there.`,
			)
		)
			return;
		try {
			await deleteArrangement({ id: a.id });
			notify("Arrangement deleted");
			await goto(arrangementHref(page.url, null), { reset: false });
		} catch (e) {
			notify(`Could not delete the arrangement: ${errorMessage(e)}`, { kind: "error" });
		}
	}

	const menuItems = (a: Arrangement) => [
		{
			id: "rename",
			label: "Rename…",
			iconClass: "i-ph-pencil-simple",
			action: () => renamePopover?.openRename(),
		},
		{
			id: "duplicate",
			label: "Duplicate…",
			iconClass: "i-ph-copy",
			disabled: atMax,
			title: atMax ? maxTitle : "A new arrangement starting from this one",
			action: () => creatorPopover?.openNew(a.id),
		},
		{ id: "delete", label: "Delete…", iconClass: "i-ph-trash", action: () => void remove(a) },
	];
</script>

{#if canEdit || arrangements.length > 0}
	<div class="mb-3 grid gap-1" data-arrangement-switcher>
		<div class="flex items-stretch gap-2">
			<nav class="min-w-0 overflow-x-auto" aria-label="Arrangements">
				<ul class="flex w-max items-center gap-1.5 py-0.5">
					{#each tabs as a (a.id ?? "main")}
						<li>
							<a
								href={arrangementHref(page.url, a.id)}
								data-sveltekit-reset="false"
								aria-current={a.id === arrangementId ? "page" : undefined}
								class="button button-xs whitespace-nowrap {a.id === arrangementId
									? 'bg-blue-300 text-oxford border-blue-300 opacity-100 hover-bg-blue-200 hover-border-blue-200'
									: 'border-current/40 opacity-80 hover-bg-blue-200 hover-border-blue-200'}"
								>{a.name}</a
							>
						</li>
					{/each}
				</ul>
			</nav>
			{#if canEdit}
				{@render editorControls()}
			{/if}
			<!-- What the row is and does, for whoever meets it first; an editor is told about + and ⋯ too. -->
			<InfoTip label="About arrangements" class="self-center" width="w-80">
				<p>
					Arrangements are sets of stems for this song. <strong>Main</strong> is the song's own. Each
					other one is an alternate: a different treatment, or one member's ideas for the band to hear.
					Click one to switch to its stems.
				</p>
				{#if canEdit}
					<p class="mt-2">
						<strong>+</strong> makes a new arrangement, copied from an existing one or empty. A copy shares
						its audio, so it takes no extra storage. From there you can mute, remove, replace or add stems
						without changing the arrangement it came from.
					</p>
					<p class="mt-2">
						<strong>⋯</strong> renames, duplicates or deletes the alternate you are on. An alternate can
						have its own tempo and start of bar 1, set in the song's settings.
					</p>
				{/if}
			</InfoTip>
		</div>
		{#if about}
			<p class="text-12px text-dim">{about}</p>
		{/if}
	</div>
{/if}

{#snippet editorControls()}
	<span class="flex shrink-0 py-0.5" title={atMax ? maxTitle : "New arrangement"}>
		<button
			class="button button-xs h-full border-current/40"
			type="button"
			aria-label="New arrangement"
			disabled={atMax}
			onclick={() => creatorPopover?.openNew()}
		>
			<span class="i-ph-plus" aria-hidden="true"></span>
		</button>
	</span>
	{#if current}
		<ContextMenu
			ariaLabel="{current.name}: options"
			title="{current.name}: options"
			buttonBaseClasses="button button-xs border-current/40 shrink-0"
			iconClass="i-ph-dots-three-bold"
			position="bottom left"
			items={menuItems(current)}
		/>
		<ArrangementRenamePopover bind:this={renamePopover} arrangement={current} />
	{/if}
	<ArrangementNewPopover
		bind:this={creatorPopover}
		{songId}
		{arrangements}
		current={arrangementId}
	/>
{/snippet}
