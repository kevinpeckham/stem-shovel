<script lang="ts">
	import { createSystemInviteCode, revokeSystemInviteCode } from "$lib/remote/admin.remote";
	import { manageUser } from "$lib/remote/admin.remote";
	import { setBugStatus } from "$lib/remote/bugs.remote";
	import { INVITE_CODE_EXPIRY_DAYS } from "$lib/val/InviteCodeSchema";
	import { clearForm } from "$lib/utils/clearForm";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatInviteCode } from "$lib/utils/formatInviteCode";
	import { notify } from "$lib/state/notifications.svelte";
	import { page } from "$app/state";

	let { data } = $props();

	const signUpLink = (code: string) => `${page.url.origin}/sign-up?code=${code}`;
	async function copy(text: string, what: string) {
		try {
			await navigator.clipboard.writeText(text);
			notify(`${what} copied`);
		} catch {
			notify(`Could not copy the ${what.toLowerCase()}`, { kind: "error" });
		}
	}
</script>

<svelte:head>
	<title>Admin — Stem Shovel</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Admin</h1>
		<p class="opacity-90">Every account and user, and the codes that open sign-up.</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">New-account invite codes</h2>
		<p class="mt-1 text-sm opacity-90">
			Sign-up is invitation-only. A code from here lets someone create an account and get a
			workspace of their own, without joining anyone's. Codes that also join an account come from
			that account's settings.
		</p>
		<form
			class="mt-2 flex flex-wrap items-end gap-3"
			{...createSystemInviteCode.enhance(async ({ submit, element }) => {
				await submit();
				if (createSystemInviteCode.result?.code) {
					notify("Invite code created");
					clearForm(createSystemInviteCode);
					element.reset();
				}
			})}
		>
			<label class="block grow">
				<span class="text-13px text-dim">Note (optional)</span>
				<input
					class="mt-1 field"
					type="text"
					autocomplete="off"
					placeholder="who it is for"
					{...createSystemInviteCode.fields.note.as("text")}
				/>
			</label>
			<label class="block w-24">
				<span class="text-13px text-dim">Max uses</span>
				<input
					class="mt-1 field"
					type="number"
					min="1"
					max="1000"
					placeholder="∞"
					{...createSystemInviteCode.fields.maxUses.as("text")}
				/>
			</label>
			<label class="block">
				<span class="text-13px text-dim">Expires</span>
				<select class="mt-1 field" {...createSystemInviteCode.fields.expiresDays.as("select", "0")}>
					{#each INVITE_CODE_EXPIRY_DAYS as days (days)}
						<option value={String(days)}>{days === 0 ? "never" : `in ${days} days`}</option>
					{/each}
				</select>
			</label>
			<button class="button-accent" disabled={!!createSystemInviteCode.pending}>
				{createSystemInviteCode.pending ? "Creating…" : "New code"}
			</button>
		</form>
		{#each createSystemInviteCode.fields.allIssues() ?? [] as issue (issue.message)}
			<p class="mt-2 text-sm text-red-400">{issue.message}</p>
		{/each}
		{#if data.inviteCodes.length > 0}
			<ul class="mt-4 surface divide-y divide-white/10 text-15px">
				{#each data.inviteCodes as c (c.id)}
					{@const revoke = revokeSystemInviteCode.for(c.id)}
					<li
						class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 {c.state ===
						'open'
							? ''
							: 'opacity-50'}"
					>
						<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<code class="font-mono tracking-wider">{formatInviteCode(c.code)}</code>
							<span class="text-13px text-dim">
								{c.uses}{c.maxUses === null ? "" : ` of ${c.maxUses}`} used
								{#if c.expiresAt}
									· expires {formatDate(c.expiresAt)}
								{/if}
								{#if c.note}
									· {c.note}
								{/if}
								{#if c.state !== "open"}
									· <span class="uppercase tracking-wider">{c.state}</span>
								{/if}
							</span>
						</div>
						{#if c.state === "open"}
							<div class="flex items-center gap-3 text-13px">
								<button
									type="button"
									class="link-dim"
									onclick={() => copy(formatInviteCode(c.code), "Code")}>Copy code</button
								>
								<button
									type="button"
									class="link-dim"
									onclick={() => copy(signUpLink(c.code), "Sign-up link")}>Copy link</button
								>
								<form {...revoke}>
									<input {...revoke.fields.id.as("hidden", c.id)} />
									<button class="link-dim" disabled={!!revoke.pending}>
										{revoke.pending ? "Revoking…" : "Revoke"}
									</button>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="max-w-article" id="bug-reports">
		<h2 class="heading-2">Bug reports</h2>
		{#if data.bugReports.length === 0}
			<p class="text-dim">None yet.</p>
		{:else}
			<ul class="surface divide-y divide-white/10 text-15px">
				{#each data.bugReports as b (b.id)}
					{@const toggle = setBugStatus.for(b.id)}
					<li class="px-5 py-3 {b.status === 'closed' ? 'opacity-50' : ''}">
						<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<span class="font-600">{b.title}</span>
							<span class="text-13px text-dim">
								{b.reporter?.name ?? "someone"} · {formatDate(b.createdAt)}
								{#if b.status === "closed"}
									· <span class="uppercase tracking-wider">closed</span>
								{/if}
							</span>
						</div>
						<p class="mt-1 whitespace-pre-wrap text-sm">{b.body}</p>
						<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-13px text-dim">
							{#if b.pageUrl}
								<a class="link-dim truncate max-w-full" href={b.pageUrl}>{b.pageUrl}</a>
							{/if}
							{#if b.userAgent}
								<span class="truncate max-w-full" title={b.userAgent}>{b.userAgent}</span>
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
								<button class="link-dim" disabled={!!toggle.pending}>
									{b.status === "open" ? "Close" : "Reopen"}
								</button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="max-w-article">
		<h2 class="heading-2">Accounts</h2>
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each data.accounts as a (a.id)}
				<li class="px-5 py-3">
					<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
						<a class="link-dim" href="/{a.slug}/projects">{a.name}</a>
						<span class="text-13px text-dim">
							{a.songs}
							{a.songs === 1 ? "song" : "songs"} · {formatBytes(a.bytes)} · since {formatDate(
								a.createdAt,
							)}
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

	<section class="max-w-article">
		<h2 class="heading-2">Users</h2>
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
					</span>
					<span class="flex flex-wrap items-center gap-x-4 gap-y-1">
						<span class="text-13px uppercase tracking-wider text-dim">
							{u.isSystemAdmin ? "system admin · " : ""}{u.emailVerified
								? "verified"
								: "unverified"}{u.isActive ? "" : " · suspended"}
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
</main>
