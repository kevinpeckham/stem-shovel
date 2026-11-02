<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * The progression pad's Import menu (docs/chord-player.md): a barmark
	 * chord chart pasted or read from a file, handed to `onimport`, which
	 * puts it on the pad and returns what it could not carry exactly (or
	 * throws with the chart's errors).
	 */
	interface Props {
		onimport: (text: string) => string[];
	}
	let { onimport }: Props = $props();

	let text = $state("");
	let warnings = $state<string[]>([]);
	let problem = $state("");

	async function pick(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (!file) return;
		try {
			text = await file.text();
			problem = "";
		} catch (err) {
			problem = `Could not read ${file.name}: ${errorMessage(err)}`;
		}
	}
	function put() {
		warnings = [];
		problem = "";
		try {
			warnings = onimport(text);
		} catch (err) {
			problem = errorMessage(err);
		}
	}
</script>

<ContextMenu
	ariaLabel="Import a chart"
	title="Paste or pick a barmark chord chart; it lands on the pad"
	iconClass="i-ph-upload-simple"
	label="Import"
	position="bottom left"
	buttonBaseClasses="device-button-sm px-3"
	popoverClasses="min-w-80 max-w-md"
	items={[{ id: "import", kind: "snippet", snippet: importBlock }]}
/>

{#snippet importBlock()}
	<div class="px-3 pt-3 pb-4 grid gap-3 text-13px">
		<div class="text-11px uppercase tracking-wider opacity-60">Import a chart</div>
		<textarea
			class="device-field w-full min-h-24 resize-y text-13px font-mono"
			rows="5"
			placeholder={"key: G\ntime: 4/4\n\n## Verse\n| G | D/F# | Em7 | C |"}
			bind:value={text}
			aria-label="Chart to import"></textarea>
		<input
			class="text-12px"
			type="file"
			accept=".md,.txt,text/markdown,text/plain"
			aria-label="Chart file"
			onchange={pick}
		/>
		<p class="text-12px opacity-70 -mt-1">
			A barmark chord chart, as the song pages and the Download menu write it: its key, meter, tempo
			and feel set the player, each chord lands with its beats, N.C. is a rest. Undo brings the pad
			back.
		</p>
		<div>
			<button class="device-button-xs px-3" type="button" disabled={!text.trim()} onclick={put}>
				<span class="i-ph-upload-simple" aria-hidden="true"></span>
				Put it on the pad
			</button>
		</div>
		{#if warnings.length > 0}
			<ul class="text-12px opacity-70 grid gap-1" role="status">
				{#each warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
		{#if problem}
			<p class="text-12px text-red-300" role="alert">{problem}</p>
		{/if}
	</div>
{/snippet}
