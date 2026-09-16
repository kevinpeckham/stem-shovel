<script lang="ts">
	import PlanBadge from "$lib/components/PlanBadge.svelte";
	import { createSystemInviteCode, revokeSystemInviteCode } from "$lib/remote/admin.remote";
	import { manageAccount, manageUser } from "$lib/remote/admin.remote";
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
		{@render reportList(data.bugReports.filter((b) => b.kind !== "feature"))}
	</section>

	<section class="max-w-article" id="feature-requests">
		<h2 class="heading-2">Feature requests</h2>
		{@render reportList(data.bugReports.filter((b) => b.kind === "feature"))}
	</section>

	<section class="max-w-article" id="audit-log">
		<h2 class="heading-2">Audit log</h2>
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

	<section class="max-w-article" id="ai-requests">
		<h2 class="heading-2">AI requests</h2>
		<p class="mt-1 text-sm opacity-90">
			The last 50 calls to the model (the text sent, the reply, whether it parsed, time and tokens).
			The audio itself is not kept.
		</p>
		{#if data.aiRequests.length === 0}
			<p class="mt-2 text-dim">None yet.</p>
		{:else}
			<ul class="mt-3 surface divide-y divide-white/10 text-15px">
				{#each data.aiRequests as r (r.id)}
					<li class="px-5 py-3">
						<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
							<span>
								<span class="font-600">{r.kind}</span>
								<span class="text-dim">· {r.model}</span>
								{#if r.song}
									· <a
										class="link-dim"
										href="/{r.song.project.account.slug}/projects/{r.song.project.slug}/{r.song
											.slug}">{r.song.title}</a
									>
								{/if}
							</span>
							<span class="text-13px text-dim">
								{r.user?.name ?? "someone"} · {formatDate(r.createdAt)} · {(
									r.durationMs / 1000
								).toFixed(1)} s{#if r.inputTokens !== null}
									· {r.inputTokens} in / {r.outputTokens ?? 0} out{/if}
								{#if r.error}
									· <span class="text-red-400">{r.error}</span>{/if}
							</span>
						</div>
						{#if r.parsed}
							<p class="mt-1 font-mono text-12px opacity-90">{JSON.stringify(r.parsed)}</p>
						{/if}
						<details class="mt-1 text-12px">
							<summary class="cursor-pointer text-dim">Prompt and reply</summary>
							<pre
								class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{r.prompt}</pre>
							<pre
								class="mt-1 whitespace-pre-wrap rounded bg-black/20 p-2 opacity-90">{r.response ||
									"(no reply)"}</pre>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="max-w-article">
		<h2 class="heading-2">Accounts</h2>
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
</main>

{#snippet reportList(items: typeof data.bugReports)}
	{#if items.length === 0}
		<p class="text-dim">None yet.</p>
	{:else}
		<ul class="surface divide-y divide-white/10 text-15px">
			{#each items as b (b.id)}
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
{/snippet}
