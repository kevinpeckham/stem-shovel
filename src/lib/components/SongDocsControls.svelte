<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { DOC_KINDS, DOC_LABELS, type SongDocs } from "#lib/state/songDocs.svelte.js";
	import type { SongDocKind } from "#lib/val/SongDocKindSchema.js";

	interface Props {
		docs: SongDocs;
		canEdit: boolean;
		/** The rendered documents by kind (the page's `data.docs`): the Edit button's icon is a plus for an empty one. */
		docsHtml: Record<SongDocKind, string>;
		/** The AI draft or chord detection running: the ⋯ button spins. */
		busy: boolean;
	}
	let { docs, canEdit, docsHtml, busy }: Props = $props();

	/** What the Edit / Done button edits: the user's own note or the shown document. */
	let subject = $derived(docs.notesMine ? "your notes" : `the ${docs.doc}`);
	let editIcon = $derived(
		docs.editing
			? docs.saving
				? "i-ph-circle-notch animate-spin"
				: "i-ph-check"
			: (docs.notesMine ? docs.myNote.html : docsHtml[docs.doc])
				? "i-ph-pencil"
				: "i-ph-plus",
	);
	/** The tabs join into one bar: the first and last keep their outer corners. */
	const edge = (index: number) =>
		index === 0
			? "rounded-r-none border-r-none"
			: index === DOC_KINDS.length - 1
				? "rounded-l-none"
				: "rounded-none border-r-none";
</script>

{#snippet editButton()}
	<button
		class="button button-xs flex items-center {docs.editing
			? 'bg-blue-300 text-oxford border-blue-300'
			: ''}"
		type="button"
		title={docs.editing ? `Done editing ${subject}` : `Edit ${subject} here`}
		aria-label={docs.editing ? `Done editing ${subject}` : `Edit ${subject}`}
		aria-pressed={docs.editing}
		onclick={async () => {
			if (docs.editing) await docs.editor?.close();
			else docs.editing = true;
		}}
	>
		<span class={editIcon}></span>
	</button>
{/snippet}

<!-- The Docs panel's header: the documents as a dropdown on a phone and tabs from sm up, Edit / Done, the ⋯ menu, and the pop-out / dock button from lg. -->
<!-- A dropdown on a phone, the segmented control from sm up. -->
<ContextMenu
	ariaLabel="Document"
	buttonBaseClasses="button button-xs sm:hidden"
	iconClass="i-ph-caret-down"
	label={DOC_LABELS[docs.panel]}
	position="bottom left"
	items={DOC_KINDS.map((kind) => ({
		id: kind,
		label: DOC_LABELS[kind],
		iconClass: docs.panel === kind ? "i-ph-check" : "i-ph-check invisible",
		action: () => docs.show(kind),
	}))}
/>
<div
	class="hidden shrink-0 overflow-hidden rounded border border-white/15 items-center sm:flex"
	role="tablist"
	aria-label="Document"
>
	{#each DOC_KINDS as kind, index (kind)}
		<button
			type="button"
			role="tab"
			aria-selected={docs.panel === kind}
			class="{docs.panel === kind
				? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
				: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} inline-flex items-center min-h-7 {edge(
				index,
			)}"
			onclick={() => docs.show(kind)}>{DOC_LABELS[kind]}</button
		>
	{/each}
</div>
<div class="flex items-stretch gap-2 {canEdit || docs.notesMine ? '' : 'hidden'}">
	{@render editButton()}
	<ContextMenu
		ariaLabel="{DOC_LABELS[docs.panel]} menu"
		title="More"
		buttonBaseClasses="button button-xs"
		iconClass={busy ? "i-ph-circle-notch animate-spin" : "i-ph-dots-three-outline-vertical-fill"}
		position="bottom left"
		items={docs.menuItems}
	/>
</div>
<button
	class="button button-xs hidden lg-inline-flex"
	type="button"
	title={docs.mode === "floating"
		? "Put the docs back in their column"
		: "Pop the docs out into a panel"}
	aria-label={docs.mode === "floating" ? "Dock the docs" : "Pop out the docs"}
	onclick={() => void docs.setMode(docs.mode === "floating" ? "docked" : "floating")}
>
	<span
		class={docs.mode === "floating" ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
		aria-hidden="true"
	></span>
</button>
