<script lang="ts">
	import { manageUser } from "$lib/remote/admin.remote";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>Users · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Users</h1>
	<ul class="surface divide-y divide-white/10 text-15px">
		{#each data.users as u (u.id)}
			{@const act = manageUser.for(u.id)}
			<li
				class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 {u.isActive
					? ''
					: 'opacity-60'}"
			>
				<span>
					{u.name} <span class="text-dim">· {u.email}</span>
					<span class="block text-13px text-dim">
						{#if u.memberships.length === 0}
							no accounts
						{:else}
							{#each u.memberships as m, i (m.slug)}
								{i > 0 ? " · " : ""}{m.role} of
								<a class="link-dim" href="/{m.slug}/projects">{m.account}</a>
							{/each}
						{/if}
					</span>
				</span>
				<span class="flex flex-wrap items-center gap-x-4 gap-y-1">
					<span class="text-13px uppercase tracking-wider text-dim">
						{u.isSuperAdmin ? "super admin · " : ""}{u.isSystemAdmin
							? "system admin · "
							: ""}{u.emailVerified ? "verified" : "unverified"}{u.isActive ? "" : " · suspended"}
					</span>
					{#if u.id !== data.me}
						<form
							class="flex items-center gap-3 text-13px"
							{...act.enhance(async ({ submit }) => {
								const action = act.fields.action.value();
								if (
									action === "delete" &&
									!confirm(
										`Delete ${u.name} (${u.email})? Their sign-in, memberships and comments go too. Accounts they alone belonged to are removed only when empty.`,
									)
								)
									return;
								await submit();
								if (act.result?.action) {
									const n = act.result.accountsRemoved;
									notify(
										act.result.action === "delete"
											? `${u.name} deleted${n ? ` with ${n} empty ${n === 1 ? "account" : "accounts"}` : ""}`
											: act.result.action === "suspend"
												? `${u.name} suspended`
												: `${u.name} reactivated`,
									);
								}
							})}
						>
							<input {...act.fields.id.as("hidden", u.id)} />
							<button
								class="link-dim"
								disabled={!!act.pending}
								{...act.fields.action.as("submit", u.isActive ? "suspend" : "reactivate")}
							>
								{u.isActive ? "Suspend" : "Reactivate"}
							</button>
							<button
								class="text-red-400 hover:underline"
								disabled={!!act.pending}
								{...act.fields.action.as("submit", "delete")}
							>
								Delete
							</button>
						</form>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
</section>
