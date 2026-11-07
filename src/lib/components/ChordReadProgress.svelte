<script lang="ts">
	import { onMount } from "svelte";
	import { chordReadStates } from "#lib/remote/admin.remote.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	/** The songs of one posted chord batch, polled until each is read or has failed. */
	let { ids, ondone }: { ids: string[]; ondone?: () => void } = $props();

	const POLL_MS = 3000;
	const GIVE_UP_MS = 15 * 60 * 1000;

	type Row = Awaited<ReturnType<typeof chordReadStates>>[number];
	type Shown = Row["state"] | "failed";

	let rows = $state<Row[]>([]);
	/** Ids seen "reading" that are "waiting" again: the job released its claim with no chords. */
	let failed = $state<string[]>([]);
	let now = $state(Date.now());
	let finished = $state(false);
	const started = Date.now();
	const seenReading = new Set<string>();

	const shownOf = (r: Row): Shown =>
		r.state === "waiting" && failed.includes(r.id) ? "failed" : r.state;
	let done = $derived(rows.filter((r) => r.state === "done").length);
	let width = $derived(ids.length === 0 ? 100 : (done / ids.length) * 100);

	async function poll() {
		// A query is cached while its proxy lives: refresh, so each poll asks the server again.
		const query = chordReadStates({ ids });
		await query.refresh();
		const fresh = await query;
		const order = new Map(ids.map((id, i) => [id, i]));
		rows = fresh.toSorted((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
		for (const r of rows) {
			if (r.state === "reading") seenReading.add(r.id);
			if (r.state === "waiting" && seenReading.has(r.id) && !failed.includes(r.id))
				failed = [...failed, r.id];
		}
		now = Date.now();
		if (rows.every((r) => shownOf(r) === "done" || shownOf(r) === "failed")) finished = true;
	}

	onMount(() => {
		let timer: ReturnType<typeof setInterval> | undefined;
		const stop = () => {
			clearInterval(timer);
			timer = undefined;
		};
		const tick = async () => {
			try {
				await poll();
			} catch (e) {
				console.error("[chords] progress poll", e);
			}
			if (finished) {
				stop();
				ondone?.();
			} else if (Date.now() - started >= GIVE_UP_MS) stop();
		};
		timer = setInterval(() => void tick(), POLL_MS);
		void tick();
		return stop;
	});
</script>

<div class="mt-4 surface px-5 py-4">
	<div class="flex items-baseline justify-between gap-3 text-15px">
		<span class="font-600">{done} of {ids.length} read</span>
		<span class="text-13px opacity-60">{formatTime((now - started) / 1000, 0)}</span>
	</div>
	<div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
		<div class="h-full bg-green-500 transition-all" style:width="{width}%"></div>
	</div>
	<p class="mt-2 text-13px opacity-60">
		A song reads in one step: its bar fills when the model's chords land.
	</p>
	<ul class="mt-3 divide-y divide-white/10 text-sm">
		{#each rows as row (row.id)}
			{@const shown = shownOf(row)}
			<li class="flex items-center gap-3 py-2" data-testid="chord-read-row">
				<a
					class="link min-w-0 flex-1 truncate"
					href="/{row.accountSlug}/projects/{row.projectSlug}/{row.slug}">{row.title}</a
				>
				<span class="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-white/10">
					{#if shown === "done"}
						<span class="block h-full w-full bg-green-500"></span>
					{:else if shown === "reading"}
						<span class="block h-full w-full animate-pulse bg-white/50"></span>
					{/if}
				</span>
				<span class="w-40 shrink-0 text-right">
					{#if shown === "done"}
						<span class="inline-flex items-center gap-1"><span class="i-ph-check"></span>done</span>
					{:else if shown === "reading"}
						reading, started {Math.max(0, Math.round((now - (row.startedAt ?? now)) / 1000))}s ago
					{:else if shown === "failed"}
						<span class="text-red-400">did not read</span>
					{:else}
						<span class="opacity-60">waiting</span>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</div>
