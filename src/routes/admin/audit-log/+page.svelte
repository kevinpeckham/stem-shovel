<script lang="ts">
	import { formatDate } from "$lib/utils/formatDate";

	let { data } = $props();
</script>

<svelte:head>
	<title>Audit log · Admin — Stem Shovel</title>
</svelte:head>

<section>
	<h1 class="display">Audit log</h1>
	<p class="mt-1 text-sm opacity-90">
		Every request a super admin made inside an account they do not belong to (latest 50). Super
		admins are made with <code>bun run db:super-admin</code>.
	</p>
	{#if data.auditLog.length === 0}
		<p class="mt-2 text-dim">Nothing yet.</p>
	{:else}
		<ul class="mt-3 surface divide-y divide-white/10 text-13px">
			{#each data.auditLog as a (a.id)}
				<li class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-2">
					<span>
						<span class="font-600">{a.user?.name ?? "someone"}</span>
						in
						{#if a.account}
							<a class="link-dim" href="/{a.account.slug}/projects">{a.account.name}</a>
						{:else}
							a deleted account
						{/if}
						<span class="ml-2 font-mono opacity-80">{a.action}</span>
					</span>
					<span class="text-dim">{formatDate(a.createdAt)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
