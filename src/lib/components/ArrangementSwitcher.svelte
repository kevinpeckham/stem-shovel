<script lang="ts">
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import ArrangementNewPopover from "#lib/components/ArrangementNewPopover.svelte";
	import ArrangementRenamePopover from "#lib/components/ArrangementRenamePopover.svelte";
	import ArrangementTip from "#lib/components/ArrangementTip.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
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
	 * for an editor + (New arrangement), and the arrangement shown as a split
	 * button whose caret opens its menu: Rename, Duplicate and Delete on an
	 * alternate, Duplicate on Main. A small heading with the info tip sits
	 * above the row. A viewer sees the row only when there is an
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

	/** New arrangement starting from the one shown (null, Main). */
	const duplicate = (from: string | null) => ({
		id: "duplicate",
		label: "Duplicate…",
		iconClass: "i-ph-copy",
		disabled: atMax,
		title: atMax ? maxTitle : "A new arrangement starting from this one",
		action: () => creatorPopover?.openNew(from ?? "main"),
	});
	/** The active arrangement's menu (the caret of its split button): Main can only be duplicated. */
	const menuItems = (a: Arrangement | null) =>
		a
			? [
					{
						id: "rename",
						label: "Rename…",
						iconClass: "i-ph-pencil-simple",
						action: () => renamePopover?.openRename(),
					},
					duplicate(a.id),
					{ id: "delete", label: "Delete…", iconClass: "i-ph-trash", action: () => void remove(a) },
				]
			: [duplicate(null)];
	const ACTIVE =
		"bg-blue-300 text-oxford border-blue-300 opacity-100 hover-bg-blue-200 hover-border-blue-200";
	const IDLE = "border-current/40 opacity-80 hover-bg-blue-200 hover-border-blue-200";
</script>

{#if canEdit || arrangements.length > 0}
	<div class="mb-3 grid gap-1" data-arrangement-switcher>
		<div class="flex items-center gap-1.5">
			<h3 class="text-12px uppercase tracking-wider text-blue-300 opacity-90">Arrangements</h3>
			<ArrangementTip {canEdit} />
		</div>
		<div class="flex items-stretch gap-2">
			<nav class="min-w-0 overflow-x-auto" aria-label="Arrangements">
				<ul class="flex w-max items-center gap-1.5 py-0.5">
					{#each tabs as a (a.id ?? "main")}
						{@const active = a.id === arrangementId}
						<li>
							{#if active && canEdit}
								<!-- A split button (Kevin, as the chord player's Arp): the arrangement shown, and on the caret its menu. -->
								<div class="flex gap-px" role="group" aria-label="{a.name}: the arrangement shown">
									{@render pill(a, true, "rounded-r-none")}
									<ContextMenu
										ariaLabel="{a.name}: options"
										title="{a.name}: options"
										buttonBaseClasses="button button-xs px-1.5 !min-w-0 rounded-l-none {ACTIVE}"
										iconClass="i-ph-caret-down"
										position="bottom left"
										items={menuItems(current)}
									/>
								</div>
							{:else}
								{@render pill(a, active, "")}
							{/if}
						</li>
					{/each}
				</ul>
			</nav>
			{#if canEdit}
				{@render editorControls()}
			{/if}
		</div>
		{#if about}
			<p class="text-12px text-dim">{about}</p>
		{/if}
	</div>
{/if}

{#snippet pill(a: { id: string | null; name: string }, active: boolean, extra: string)}
	<a
		href={arrangementHref(page.url, a.id)}
		data-sveltekit-reset="false"
		aria-current={active ? "page" : undefined}
		class="button button-xs whitespace-nowrap {extra} {active ? ACTIVE : IDLE}">{a.name}</a
	>
{/snippet}

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
		<ArrangementRenamePopover bind:this={renamePopover} arrangement={current} />
	{/if}
	<ArrangementNewPopover
		bind:this={creatorPopover}
		{songId}
		{arrangements}
		current={arrangementId}
	/>
{/snippet}
