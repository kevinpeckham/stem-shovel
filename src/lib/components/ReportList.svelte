<script lang="ts">
	import {
		approveBug,
		deleteBug,
		respondToBug,
		setBugPriority,
		setBugStatus,
	} from "$lib/remote/bugs.remote";
	import { REPORT_PRIORITIES } from "$lib/val/BugReportSchema";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	/**
	 * Bug reports or feature requests on /admin: mark complete, close, reopen,
	 * set a priority, write a response (saved on the request and emailed to
	 * the requester) and delete.
	 */
	interface Props {
		items: {
			id: string;
			title: string;
			body: string;
			status: "open" | "complete" | "closed";
			priority: "high" | "medium" | "low" | null;
			response: string;
			pageUrl: string;
			userAgent: string;
			/** Where they said we may write about it, when they offered one. */
			contactEmail: string | null;
			/** Thumbs up minus thumbs down from signed-in users. */
			score: number;
			/** Shown on the public page since; null while it waits for an admin. */
			approvedAt: Date | null;
			/** Words the profanity check found, comma-separated; empty when clean. */
			flags: string;
			createdAt: Date;
			reporter: { name: string } | null;
		}[];
		/** Feature requests get Mark complete; bug reports only close. */
		kind?: "bug" | "feature";
	}
	let { items, kind = "bug" }: Props = $props();
	const PRIORITY_CLASS = {
		high: "text-red-400",
		medium: "text-accent",
		low: "text-dim",
	} as const;
</script>

{#if items.length === 0}
	<p class="text-dim">None yet.</p>
{:else}
	<ul class="surface divide-y divide-white/10 text-15px">
		{#each items as b (b.id)}
			{@const toggle = setBugStatus.for(b.id)}
			{@const complete = setBugStatus.for(`complete:${b.id}`)}
			{@const priority = setBugPriority.for(b.id)}
			{@const respond = respondToBug.for(b.id)}
			{@const remove = deleteBug.for(b.id)}
			{@const approve = approveBug.for(b.id)}
			<li class="px-5 py-3 {b.status === 'closed' ? 'opacity-50' : ''}">
				<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<span class="font-600">
						{b.title}
						{#if b.priority}
							<span class="ml-2 text-11px uppercase tracking-wider {PRIORITY_CLASS[b.priority]}"
								>{b.priority}</span
							>
						{/if}
					</span>
					<span class="text-13px text-dim">
						{#if kind === "feature"}
							<span title="Thumbs up minus thumbs down">score {b.score}</span> ·
						{/if}
						{b.reporter?.name ?? "someone"} · {formatDate(b.createdAt)}
						{#if b.status !== "open"}
							· <span
								class="uppercase tracking-wider {b.status === 'complete' ? 'text-green-400' : ''}"
								>{b.status}</span
							>
						{/if}
					</span>
				</div>
				<p class="mt-1 whitespace-pre-wrap text-sm">{b.body}</p>
				{#if b.flags || (kind === "feature" && !b.approvedAt)}
					<p class="mt-1 flex flex-wrap gap-2 text-11px uppercase tracking-wider">
						{#if kind === "feature" && !b.approvedAt}
							<span class="rounded border border-accent/60 px-1.5 py-0.5 text-accent"
								>awaiting approval</span
							>
						{/if}
						{#if b.flags}
							<span class="rounded border border-red-400/60 px-1.5 py-0.5 text-red-400"
								>flagged: {b.flags.split(",").join(", ")}</span
							>
						{/if}
					</p>
				{/if}
				{#if b.contactEmail}
					<p class="mt-1 text-13px text-dim">
						Happy to be emailed at <a class="link-dim" href="mailto:{b.contactEmail}"
							>{b.contactEmail}</a
						>{#if kind === "feature"}; told when it ships{/if}.
					</p>
				{/if}
				{#if b.response}
					<p
						class="mt-2 whitespace-pre-wrap rounded border border-white/10 bg-blue-300/5 px-3 py-2 text-sm"
					>
						<span class="text-11px uppercase tracking-wider text-dim">Response</span><br
						/>{b.response}
					</p>
				{/if}
				<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-13px text-dim">
					{#if b.pageUrl}
						<a class="link-dim truncate max-w-full" href={b.pageUrl}>{b.pageUrl}</a>
					{/if}
					{#if b.userAgent}
						<span class="truncate max-w-full" title={b.userAgent}>{b.userAgent}</span>
					{/if}
					{#if kind === "feature"}
						<form
							class="flex items-center gap-2"
							{...priority.enhance(async ({ submit }) => {
								await submit();
								notify(
									priority.result?.priority
										? `Priority: ${priority.result.priority}`
										: "Priority cleared",
								);
							})}
						>
							<input {...priority.fields.id.as("hidden", b.id)} />
							<label class="flex items-center gap-1">
								Priority
								<select
									class="field py-0.5 text-13px"
									{...priority.fields.priority.as("select", b.priority ?? "")}
									onchange={(e) => e.currentTarget.form?.requestSubmit()}
								>
									<option value="">none</option>
									{#each REPORT_PRIORITIES as p (p)}
										<option value={p}>{p}</option>
									{/each}
								</select>
							</label>
						</form>
						<form
							{...approve.enhance(async ({ submit }) => {
								await submit();
								if (approve.result)
									notify(
										approve.result.approved
											? "Shown on the public page"
											: "Hidden from the public page",
									);
							})}
						>
							<input {...approve.fields.id.as("hidden", b.id)} />
							<input {...approve.fields.approved.as("hidden", b.approvedAt ? "false" : "true")} />
							<button
								class="button button-sm {b.approvedAt ? '' : 'button-accent'}"
								disabled={!!approve.pending}
							>
								{b.approvedAt ? "Hide from public" : "Approve"}
							</button>
						</form>
						{#if b.status !== "complete"}
							<form
								{...complete.enhance(async ({ submit }) => {
									await submit();
									if (complete.result?.status) notify("Marked complete");
								})}
							>
								<input {...complete.fields.id.as("hidden", b.id)} />
								<input {...complete.fields.status.as("hidden", "complete")} />
								<button class="button button-sm" disabled={!!complete.pending}>Mark complete</button
								>
							</form>
						{/if}
					{/if}
					<form
						{...toggle.enhance(async ({ submit }) => {
							await submit();
							if (toggle.result?.status) notify(`Report ${toggle.result.status}`);
						})}
					>
						<input {...toggle.fields.id.as("hidden", b.id)} />
						<input
							{...toggle.fields.status.as("hidden", b.status === "open" ? "closed" : "open")}
						/>
						<button class="button button-sm" disabled={!!toggle.pending}>
							{b.status === "open" ? "Close" : "Reopen"}
						</button>
					</form>
					<details class="w-full">
						<summary
							class="button button-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden"
						>
							{b.response ? "Edit response" : "Respond"}
						</summary>
						<form
							class="mt-2 grid gap-2"
							{...respond.enhance(async ({ submit }) => {
								await submit();
								if (respond.result) {
									notify(
										respond.result.responded
											? "Response saved and emailed to the requester"
											: "Response cleared",
									);
								}
							})}
						>
							<input {...respond.fields.id.as("hidden", b.id)} />
							<textarea
								class="field min-h-24 text-sm"
								rows="3"
								placeholder="What you decided, what shipped, or what you need to know."
								{...respond.fields.response.as("text", b.response)}></textarea>
							{#each respond.fields.response.issues() ?? [] as issue (issue.message)}
								<p class="text-sm text-red-400">{issue.message}</p>
							{/each}
							<div>
								<button class="button button-xs" disabled={!!respond.pending}>
									{respond.pending ? "Saving…" : "Save and email"}
								</button>
							</div>
						</form>
					</details>
					<form
						{...remove.enhance(async ({ submit }) => {
							if (!confirm(`Delete "${b.title}"?`)) return;
							await submit();
							if (remove.result?.deleted) notify("Deleted");
						})}
					>
						<input {...remove.fields.id.as("hidden", b.id)} />
						<button class="text-red-400 hover:underline" disabled={!!remove.pending}>Delete</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
{/if}
