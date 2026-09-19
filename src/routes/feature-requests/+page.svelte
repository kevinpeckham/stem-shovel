<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatDate } from "$lib/utils/formatDate";
	import ReportForm from "$lib/components/ReportForm.svelte";

	let { data } = $props();
	const LABEL = { open: "Open", complete: "Complete", closed: "Closed" } as const;
	const BADGE = {
		open: "border-current/40",
		complete: "border-green-400/60 text-green-400",
		closed: "border-white/20 text-dim",
	} as const;
	const PRIORITY = { high: "text-red-400", medium: "text-maximumYellow", low: "text-dim" } as const;
	const open = $derived(data.requests.filter((r) => r.status === "open"));
	const complete = $derived(data.requests.filter((r) => r.status === "complete"));
	const closed = $derived(data.requests.filter((r) => r.status === "closed"));
</script>

<svelte:head>
	<title>{pageTitle("Feature requests")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Feature requests</h1>
		<p class="opacity-90 text-balance">
			What members have asked for, what we said, and what has shipped.
		</p>
		<div class="mt-4 flex flex-wrap items-center gap-4">
			<button class="button-accent" type="button" popovertarget="feature-request">
				<span class="i-ph-lightbulb text-lg"></span>
				Request a feature
			</button>
			{#if data.user?.isSystemAdmin}
				<a class="link-dim text-sm" href="/admin/feature-requests">Manage requests</a>
			{/if}
		</div>
	</header>

	{#snippet list(items: typeof data.requests, heading: string)}
		{#if items.length > 0}
			<section class="max-w-article mb-8">
				<h2 class="heading-3">{heading}</h2>
				<ul class="surface divide-y divide-white/10 text-15px">
					{#each items as r (r.id)}
						<li class="px-5 py-3">
							<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
								<span class="font-600">
									{r.title}
									{#if r.priority}
										<span class="ml-2 text-11px uppercase tracking-wider {PRIORITY[r.priority]}"
											>{r.priority} priority</span
										>
									{/if}
								</span>
								<span class="flex items-center gap-3 text-13px text-dim">
									{formatDate(r.createdAt)}
									<span
										class="rounded border px-2 py-0.5 text-11px uppercase tracking-wider {BADGE[
											r.status
										]}">{LABEL[r.status]}</span
									>
								</span>
							</div>
							<p class="mt-1 whitespace-pre-wrap text-sm opacity-90">{r.body}</p>
							{#if r.response}
								<div class="mt-2 rounded border border-white/10 bg-blue-300/5 px-3 py-2 text-sm">
									<span class="text-11px uppercase tracking-wider text-dim"
										>Stem Shovel{r.respondedAt ? ` · ${formatDate(r.respondedAt)}` : ""}</span
									>
									<p class="mt-1 whitespace-pre-wrap">{r.response}</p>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/snippet}

	{#if data.requests.length === 0}
		<p class="opacity-80">No requests yet.</p>
	{/if}
	{@render list(open, "Open")}
	{@render list(complete, "Complete")}
	{@render list(closed, "Closed")}
</main>

{#if data.user}
	<ReportForm id="feature-request" kind="feature" user={data.user} />
{/if}
