<script lang="ts">
	import { onMount } from "svelte";
	import SetListShowRow from "#lib/components/SetListShowRow.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * A set list's show view (docs/band-plan.md, "Set list"): big numbered
	 * rows in high contrast for a phone on the stage floor, a tap on a song
	 * opening its chart or lyrics in place (tabs when it has both), the
	 * screen kept awake while it is open, and a print layout (the controls
	 * left out, an opened chart printed).
	 */
	let { data } = $props();

	onMount(() => {
		let lock: WakeLockSentinel | null = null;
		let gone = false;
		navigator.wakeLock
			?.request("screen")
			.then((l) => {
				if (gone) void l.release();
				else lock = l;
			})
			.catch(() => {});
		return () => {
			gone = true;
			void lock?.release().catch(() => {});
		};
	});
</script>

<svelte:head>
	<title>{pageTitle(`${data.setList.title} · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main
	class="min-h-screen bg-black px-4 py-6 text-white sm:px-8 print:min-h-0 print:bg-white print:p-0 print:text-black"
>
	<div class="mx-auto max-w-3xl">
		{#if data.member}
			<p class="mb-4 text-14px print:hidden">
				<a class="link" href="/{data.account.slug}/set-lists/{data.setList.id}"
					>← Back to the set list</a
				>
			</p>
		{/if}
		<h1 class="mb-6 text-32px font-700 leading-tight sm:text-40px">{data.setList.title}</h1>
		{#if data.rows.length === 0}
			<p class="text-20px opacity-80">Nothing on this set list yet.</p>
		{:else}
			<ol class="grid gap-1" aria-label="The set">
				{#each data.rows as row, i (row.id)}
					<SetListShowRow {row} number={i + 1} />
				{/each}
			</ol>
		{/if}
	</div>
</main>
