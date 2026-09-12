<script lang="ts">
	import { formatBytes } from "$lib/format";
	import { updateAccount } from "$lib/remote/accounts.remote";
	import { slugify } from "$lib/slug";

	let { data } = $props();

	const fields = updateAccount.fields;
	let name = $derived(fields.name.value() ?? data.account.name);
	let slug = $derived(fields.slug.value() ?? data.account.slug);
	let dirty = $derived(name.trim() !== data.account.name || slug.trim() !== data.account.slug);
	let slugTouched = $state(false);
	let limit = $derived(data.usage.storageLimitBytes);
</script>

<svelte:head>
	<title>Settings · {data.account.name} — Stem Shovel</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Settings</h1>
		<p class="opacity-90">
			The account everything here belongs to. Sign-in comes later; for now every request is
			{data.user?.name}.
		</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">Account</h2>
		<form
			class="grid gap-5"
			{...updateAccount.enhance(async ({ submit }) => {
				await submit();
			})}
		>
			<input {...fields.id.as("hidden", data.account.id)} />
			<label class="block">
				<span class="text-15px text-dim">Name</span>
				<input
					class="mt-1 field"
					{...fields.name.as("text", data.account.name)}
					oninput={(e) => {
						if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
					}}
					required
				/>
				{#each fields.name.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<label class="block">
				<span class="text-15px text-dim">Slug</span>
				<input
					class="mt-1 field font-mono text-sm"
					{...fields.slug.as("text", data.account.slug)}
					oninput={() => (slugTouched = true)}
					required
				/>
				<span class="mt-1 block text-13px text-dim">
					Identifies the account; not part of any URL yet.
				</span>
				{#each fields.slug.issues() ?? [] as issue (issue.message)}
					<p class="mt-1 text-sm text-red-400">{issue.message}</p>
				{/each}
			</label>
			<div>
				<button class="button-accent" disabled={!dirty || !!updateAccount.pending}>
					{updateAccount.pending ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	</section>

	<section class="max-w-article">
		<h2 class="heading-2">Usage</h2>
		<dl class="surface grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-4 text-15px sm:grid-cols-4">
			<div>
				<dt class="text-13px text-dim">Projects</dt>
				<dd class="text-20px font-700 tabular-nums">{data.usage.projects}</dd>
			</div>
			<div>
				<dt class="text-13px text-dim">Songs</dt>
				<dd class="text-20px font-700 tabular-nums">{data.usage.songs}</dd>
			</div>
			<div>
				<dt class="text-13px text-dim">Stems</dt>
				<dd class="text-20px font-700 tabular-nums">{data.usage.stems}</dd>
			</div>
			<div>
				<dt class="text-13px text-dim">Storage</dt>
				<dd class="text-20px font-700 tabular-nums">
					{formatBytes(data.usage.bytes)}
					{#if limit}<span class="text-13px font-400 text-dim"> / {formatBytes(limit)}</span>{/if}
				</dd>
			</div>
		</dl>
		{#if limit}
			<div class="mt-2 h-1 overflow-hidden rounded bg-white/10">
				<div
					class="h-full bg-maximumYellow"
					style:width="{Math.min(100, (100 * data.usage.bytes) / limit)}%"
				></div>
			</div>
		{/if}
	</section>

	<section class="max-w-article">
		<h2 class="heading-2">Members</h2>
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each data.usage.members as m (m.email)}
				<li class="flex items-baseline justify-between gap-4 px-5 py-3">
					<span>{m.name} <span class="text-dim">· {m.email}</span></span>
					<span class="text-13px uppercase tracking-wider text-dim">{m.role}</span>
				</li>
			{/each}
		</ul>
		<p class="mt-2 text-13px text-dim">Inviting people arrives with sign-in.</p>
	</section>
</main>
