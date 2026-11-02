<script lang="ts">
	import ChartPreview from "#lib/components/ChartPreview.svelte";
	import MarkdownDocEditor from "#lib/components/MarkdownDocEditor.svelte";
	import { saveIdeaChart } from "#lib/remote/ideas.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * An idea's barmark chord chart (docs/barmark-integration-audit.md item 9):
	 * the embedded editor in monospace, autosaving on idle like the notes, with
	 * the chart drawn under it as it is typed. The idea is created on the first
	 * save when the page has none yet (`ensureIdea`).
	 */
	interface Props {
		idea: { id: string | null; chart: string; title?: string };
		/** The idea's id, creating the idea if there is none yet. */
		ensureIdea: () => Promise<string>;
		/** Receives the chart after every save, so the page keeps its copy current. */
		onchange?: (markdown: string) => void;
		/** After every save: whether emptying the chart removed the idea (it held nothing else). */
		onsaved?: (result: { markdown: string; ideaDeleted: boolean }) => void;
	}
	let { idea, ensureIdea, onchange = () => {}, onsaved = () => {} }: Props = $props();

	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);
	/** The text as it is typed (`markdownCurrent` is state), else the saved chart. */
	let current = $derived(editor?.markdownCurrent ?? idea.chart);

	/** After a save: the editor clean when nothing was typed since, and the page told. */
	function saved(sent: string, ideaDeleted: boolean) {
		if (editor?.markdownCurrent === sent) editor.markAsSaved();
		version++;
		onchange(sent);
		onsaved({ markdown: sent, ideaDeleted });
	}

	/** The idea's id, the idea made first when the page has none yet. */
	function currentId() {
		return idea.id ? Promise.resolve(idea.id) : ensureIdea();
	}

	async function save() {
		if (!editor || pending) return;
		const sent = editor.markdownCurrent;
		pending = true;
		saveError = null;
		try {
			const r = await saveIdeaChart({ id: await currentId(), markdown: sent });
			saved(sent, r.ideaDeleted);
		} catch (e) {
			saveError = errorMessage(e);
			notify(`Chart not saved: ${saveError}`, { kind: "error" });
		} finally {
			pending = false;
		}
	}
</script>

<div class="relative h-full min-h-300px max-w-full overflow-x-hidden overflow-y-auto rounded-md">
	<MarkdownDocEditor
		bind:editor
		markdown={idea.chart}
		docKey="idea-chart"
		label="Chart"
		hint=""
		backHref=""
		backLabel=""
		{version}
		{pending}
		confirmEmpty={false}
		{saveError}
		mode="embedded"
		view="markdown"
		mono
		plain
		onsave={() => void save()}
		onclose={() => {
			if (editor?.hasEdits) void save();
		}}
	/>
	<div class="mt-4 border-t border-current/20 pt-4">
		{#if current.trim()}
			<ChartPreview text={current} label="Chart preview" />
		{:else}
			<p class="text-sm text-dim">
				A barmark chord chart: key: G, time: 4/4, then bars like | G | D | Em | C | under a ##
				heading.
			</p>
		{/if}
	</div>
	{#if pending}
		<span
			class="absolute top-2 right-12 i-ph-circle-notch animate-spin opacity-80"
			aria-hidden="true"
		></span>
	{/if}
</div>
