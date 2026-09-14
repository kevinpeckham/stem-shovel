<script lang="ts">
	import { formatBytes } from "$lib/utils/formatBytes";
	import {
		createInviteCode,
		inviteMember,
		revokeInviteCode,
		revokeInvitation,
		updateAccount,
	} from "$lib/remote/accounts.remote";
	import { INVITE_ROLES } from "$lib/val/InvitationSchema";
	import { INVITE_CODE_EXPIRY_DAYS } from "$lib/val/InviteCodeSchema";
	import { formatInviteCode } from "$lib/utils/formatInviteCode";
	import { page } from "$app/state";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";
	import { clearForm } from "$lib/utils/clearForm";
	import { slugify } from "$lib/utils/slugify";

	let { data } = $props();

	const fields = updateAccount.fields;
	let name = $derived(fields.name.value() ?? data.account.name);
	let slug = $derived(fields.slug.value() ?? data.account.slug);
	let dirty = $derived(name.trim() !== data.account.name || slug.trim() !== data.account.slug);
	let slugTouched = $state(false);
	let limit = $derived(data.usage.storageLimitBytes);

	/** The sign-up link an invite code goes out as. */
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
	<title>Settings · {data.account.name} — Stem Shovel</title>
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="display">Settings</h1>
		<p class="opacity-90">The account everything here belongs to.</p>
	</header>

	<section class="max-w-article">
		<h2 class="heading-2">Account</h2>
		<form
			class="grid gap-5"
			{...updateAccount.enhance(async ({ submit }) => {
				await submit();
				if (!fields.allIssues()) notify("Account settings saved");
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
		{#if data.canInvite}
			<h3 class="mt-6 text-15px font-700">Invite someone</h3>
			<form
				class="mt-2 flex flex-wrap items-end gap-3"
				{...inviteMember.enhance(async ({ submit, element }) => {
					await submit();
					if (inviteMember.result?.sent) {
						notify(`Invitation sent to ${inviteMember.result.sent}`);
						clearForm(inviteMember);
						element.reset();
					}
				})}
			>
				<input {...inviteMember.fields.accountId.as("hidden", data.account.id)} />
				<label class="block grow">
					<span class="text-13px text-dim">Email</span>
					<input
						class="mt-1 field"
						type="email"
						autocomplete="off"
						{...inviteMember.fields.email.as("text")}
						required
					/>
				</label>
				<label class="block">
					<span class="text-13px text-dim">Role</span>
					<select class="mt-1 field" {...inviteMember.fields.role.as("select", "member")}>
						{#each INVITE_ROLES as role (role)}
							<option value={role}>{role}</option>
						{/each}
					</select>
				</label>
				<button class="button-accent" disabled={!!inviteMember.pending}>
					{inviteMember.pending ? "Sending…" : "Send invitation"}
				</button>
			</form>
			{#each inviteMember.fields.email.issues() ?? [] as issue (issue.message)}
				<p class="mt-2 text-sm text-red-400">{issue.message}</p>
			{/each}
			{#if data.invitations.length > 0}
				<h3 class="mt-6 text-15px font-700">Pending invitations</h3>
				<ul class="mt-2 surface divide-y divide-white/10 text-15px">
					{#each data.invitations as inv (inv.id)}
						{@const revoke = revokeInvitation.for(inv.id)}
						<li class="flex flex-wrap items-baseline justify-between gap-4 px-5 py-3">
							<span>
								{inv.email}
								<span class="text-dim">· {inv.role} · expires {formatDate(inv.expiresAt)}</span>
							</span>
							<form {...revoke}>
								<input {...revoke.fields.id.as("hidden", inv.id)} />
								<button class="text-13px link-dim" disabled={!!revoke.pending}>
									{revoke.pending ? "Revoking…" : "Revoke"}
								</button>
							</form>
						</li>
					{/each}
				</ul>
			{/if}

			<h3 class="mt-8 text-15px font-700">Invite codes</h3>
			<p class="mt-1 text-sm opacity-90">
				Sign-up is invitation-only. A code lets anyone who has it create an account and join
				{data.account.name}; hand it out in person, or send the link.
			</p>
			<form
				class="mt-2 flex flex-wrap items-end gap-3"
				{...createInviteCode.enhance(async ({ submit, element }) => {
					await submit();
					if (createInviteCode.result?.code) {
						notify("Invite code created");
						clearForm(createInviteCode);
						element.reset();
					}
				})}
			>
				<input {...createInviteCode.fields.accountId.as("hidden", data.account.id)} />
				<label class="block grow">
					<span class="text-13px text-dim">Note (optional)</span>
					<input
						class="mt-1 field"
						type="text"
						autocomplete="off"
						placeholder="who it is for"
						{...createInviteCode.fields.note.as("text")}
					/>
				</label>
				<label class="block">
					<span class="text-13px text-dim">Role</span>
					<select class="mt-1 field" {...createInviteCode.fields.role.as("select", "member")}>
						{#each INVITE_ROLES as role (role)}
							<option value={role}>{role}</option>
						{/each}
					</select>
				</label>
				<label class="block w-24">
					<span class="text-13px text-dim">Max uses</span>
					<input
						class="mt-1 field"
						type="number"
						min="1"
						max="1000"
						placeholder="∞"
						{...createInviteCode.fields.maxUses.as("text")}
					/>
				</label>
				<label class="block">
					<span class="text-13px text-dim">Expires</span>
					<select class="mt-1 field" {...createInviteCode.fields.expiresDays.as("select", "0")}>
						{#each INVITE_CODE_EXPIRY_DAYS as days (days)}
							<option value={String(days)}>{days === 0 ? "never" : `in ${days} days`}</option>
						{/each}
					</select>
				</label>
				<button class="button-accent" disabled={!!createInviteCode.pending}>
					{createInviteCode.pending ? "Creating…" : "New code"}
				</button>
			</form>
			{#each createInviteCode.fields.allIssues() ?? [] as issue (issue.message)}
				<p class="mt-2 text-sm text-red-400">{issue.message}</p>
			{/each}
			{#if data.inviteCodes.length > 0}
				<ul class="mt-4 surface divide-y divide-white/10 text-15px">
					{#each data.inviteCodes as c (c.id)}
						{@const revoke = revokeInviteCode.for(c.id)}
						<li
							class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3 {c.state ===
							'open'
								? ''
								: 'opacity-50'}"
						>
							<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
								<code class="font-mono tracking-wider">{formatInviteCode(c.code)}</code>
								<span class="text-13px text-dim">
									{c.role}
									· {c.uses}{c.maxUses === null ? "" : ` of ${c.maxUses}`} used
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
		{/if}
	</section>
</main>
