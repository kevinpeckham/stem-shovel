<script lang="ts">
	import { MIX_ACCEPT } from "#lib/constants/mixFormats.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import InfoTip from "#lib/components/InfoTip.svelte";

	/**
	 * The song page's Mixes view (docs/mixes.md, "Phase 2"): the mixes
	 * newest first, each a link to its own page where the listening and the
	 * review happen, with its comment count; Upload Mix for editors, and
	 * the uploads in flight.
	 */
	interface Props {
		mixes: {
			id: string;
			version: number;
			label: string;
			createdAt: Date;
			uploader: { name: string } | null;
		}[];
		/** Comments per mix id. */
		commentCounts: Map<string, number>;
		/** A mix's page. */
		hrefOf: (id: string) => string;
		canEdit?: boolean;
		jobs?: { name: string; percent: number; error?: string; decoding?: boolean }[];
		/** At least this tall (the stem player's box, so the page keeps its shape across the toggle). */
		minHeight?: number;
		onfiles?: (files: File[]) => void;
	}
	let {
		mixes,
		commentCounts,
		hrefOf,
		canEdit = false,
		jobs = [],
		minHeight = 0,
		onfiles,
	}: Props = $props();
	let newestFirst = $derived(mixes.toSorted((a, b) => b.version - a.version));
	let picker = $state<HTMLInputElement | null>(null);
	export function pick() {
		picker?.click();
	}
	function onpick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = "";
		if (files.length) onfiles?.(files);
	}
</script>

<section
	class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 grid gap-4 content-start"
	style:min-height={minHeight ? `${minHeight}px` : undefined}
	aria-label="Mixes"
>
	<div class="flex items-center gap-2">
		<h3 class="opacity-90 text-15px max-w-740px text-balance">Latest Mixes</h3>
		<InfoTip
			text="Mixes are bounces uploaded by a producer or engineer for the band's feedback during the
	recording, mixing, or mastering phase of a project. Each opens on its own page to listen,
	comment and download."
		/>
	</div>
	{#if newestFirst.length === 0}
		<p class="">
			{canEdit ? "No mixes yet. Upload the first bounce for the band to hear." : "No mixes yet."}
		</p>
	{:else}
		<ul class="grid gap-2" aria-label="All mixes">
			{#each newestFirst as m (m.id)}
				{@const n = commentCounts.get(m.id) ?? 0}
				<li>
					<a
						class="app-list-tile flex w-full items-baseline gap-3 px-3 py-2 text-sm"
						href={hrefOf(m.id)}
						title="Listen, comment and download"
					>
						<span class="rounded border border-current/30 px-1 text-11px tabular-nums"
							>v{m.version}</span
						>
						<span class="min-w-0 grow truncate font-500">{m.label}</span>
						<span class="text-12px opacity-60 tabular-nums">
							{#if n}{n} {n === 1 ? "comment" : "comments"} ·
							{/if}{#if m.uploader}{m.uploader.name}
								·
							{/if}{formatDate(m.createdAt)}
						</span>
						<span class="i-ph-arrow-right opacity-60" aria-hidden="true"></span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
	{#if jobs.length}
		<ul class="grid gap-1 text-sm" aria-label="Mix uploads">
			{#each jobs as job (job.name)}
				<li class="flex items-center gap-3">
					<span class="min-w-0 grow truncate">{job.name}</span>
					{#if job.error}<span class="text-red-300">{job.error}</span>{:else if job.decoding}<span
							class="opacity-70">Reading the waveform…</span
						>{:else}<span class="tabular-nums opacity-70">{Math.round(job.percent)}%</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if canEdit}
		<div>
			<input
				bind:this={picker}
				type="file"
				class="hidden"
				accept={MIX_ACCEPT}
				multiple
				onchange={onpick}
			/>
			<button class="button button-sm" type="button" onclick={pick}>
				<span class="i-ph-upload-simple" aria-hidden="true"></span>
				Upload Mix
			</button>
		</div>
	{/if}
</section>
