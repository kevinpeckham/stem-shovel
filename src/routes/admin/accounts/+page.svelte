<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import PlanBadge from "$lib/components/PlanBadge.svelte";
	import { manageAccount } from "$lib/remote/admin.remote";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Accounts · Admin")}</title>
</svelte:head>

<section>
	<h1 class="display">Accounts</h1>
	<ul class="surface divide-y divide-white/10 text-15px">
		{#each data.accounts as a (a.id)}
			{@const act = manageAccount.for(a.id)}
			<li class="px-5 py-3 {a.status === 'active' ? '' : 'opacity-60'}">
				<div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
					<span class="flex items-center gap-2">
						<a class="link-dim" href="/{a.slug}/projects">{a.name}</a>
						<PlanBadge plan={a.plan} lifetimeFree={a.lifetimeFree} isFounder={a.isFounder} />
					</span>
					<span class="flex flex-wrap items-center gap-x-4 gap-y-1">
						<span class="text-13px text-dim">
							{a.songs}
							{a.songs === 1 ? "song" : "songs"} · {formatBytes(a.bytes)} · since {formatDate(
								a.createdAt,
							)}{#if a.status !== "active"}
								· <span class="uppercase tracking-wider">{a.status}</span>{/if}
						</span>
						<form
							class="flex items-center gap-3 text-13px"
							{...act.enhance(async ({ submit }) => {
								const action = act.fields.action.value();
								if (
									action === "delete" &&
									!confirm(
										`Delete the account ${a.name} with its ${a.songs} ${a.songs === 1 ? "song" : "songs"} and every file (${formatBytes(a.bytes)})? Members keep their users. This cannot be undone.`,
									)
								)
									return;
								await submit();
								if (act.result?.action) {
									notify(
										act.result.action === "delete"
											? `${a.name} deleted`
											: act.result.action === "suspend"
												? `${a.name} suspended`
												: act.result.action === "founder"
													? `${a.name} is a founder account`
													: act.result.action === "unfounder"
														? `${a.name} is no longer a founder account`
														: `${a.name} reactivated`,
									);
								}
							})}
						>
							<input {...act.fields.id.as("hidden", a.id)} />
							{#if data.superAdmin}
								<button
									class="link-dim"
									disabled={!!act.pending}
									title={a.isFounder
										? "Revoke founder status"
										: "Founder: never charged, unlimited data, every feature"}
									{...act.fields.action.as("submit", a.isFounder ? "unfounder" : "founder")}
								>
									{a.isFounder ? "Revoke founder" : "Make founder"}
								</button>
							{/if}
							<button
								class="link-dim"
								disabled={!!act.pending}
								{...act.fields.action.as(
									"submit",
									a.status === "active" ? "suspend" : "reactivate",
								)}
							>
								{a.status === "active" ? "Suspend" : "Reactivate"}
							</button>
							<button
								class="text-red-400 hover:underline"
								disabled={!!act.pending}
								{...act.fields.action.as("submit", "delete")}
							>
								Delete
							</button>
						</form>
					</span>
				</div>
				<p class="mt-1 text-13px text-dim">
					{#each a.members as m, i (m.email)}
						{i > 0 ? " · " : ""}{m.name} ({m.role})
					{/each}
				</p>
			</li>
		{/each}
	</ul>
</section>
