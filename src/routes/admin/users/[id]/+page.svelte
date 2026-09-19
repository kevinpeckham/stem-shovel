<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatBytes } from "$lib/utils/formatBytes";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";

	let { data } = $props();
	const u = $derived(data.user);

	/** "Sep 19, 2026 1:42 am" for an instant, or a dash. */
	const when = (d: Date | null) =>
		d
			? `${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`
			: "–";
	/** "3 days ago", "2 hours ago"; "never" for null. */
	function ago(d: Date | null): string {
		if (!d) return "never";
		const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
		if (s < 60) return "just now";
		const m = s / 60;
		if (m < 60) return `${Math.round(m)} min ago`;
		const h = m / 60;
		if (h < 48) return `${Math.round(h)} h ago`;
		const days = h / 24;
		if (days < 60) return `${Math.round(days)} days ago`;
		return `${Math.round(days / 30)} months ago`;
	}
	const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
	/** Browser and OS from a user agent, roughly. */
	function client(ua: string | null): string {
		if (!ua) return "–";
		const os = /iPhone/.test(ua)
			? "iPhone"
			: /iPad|Macintosh.*Mobile/.test(ua)
				? "iPad"
				: /Android/.test(ua)
					? "Android"
					: /Mac OS X/.test(ua)
						? "Mac"
						: /Windows/.test(ua)
							? "Windows"
							: /Linux/.test(ua)
								? "Linux"
								: "unknown OS";
		const browser = /Edg\//.test(ua)
			? "Edge"
			: /CriOS|Chrome\//.test(ua)
				? "Chrome"
				: /FxiOS|Firefox\//.test(ua)
					? "Firefox"
					: /Safari\//.test(ua)
						? "Safari"
						: "unknown browser";
		return `${browser} on ${os}`;
	}
</script>

<svelte:head>
	<title>{pageTitle(`${u.name} · Users · Admin`)}</title>
</svelte:head>

<section class="grid gap-6">
	<div>
		<a class="link-dim text-13px" href="/admin/users">← Users</a>
		<h1 class="display mt-1 mb-0">{u.name}</h1>
		<p class="text-dim">
			{u.email} ·
			<span class="uppercase tracking-wider text-13px">
				{u.emailVerified ? "verified" : "unverified"}{u.isActive
					? ""
					: " · suspended"}{u.isSuperAdmin ? " · super admin" : ""}{u.isSystemAdmin
					? " · system admin"
					: ""}
			</span>
		</p>
	</div>

	<div class="grid gap-6 md:grid-cols-2">
		<section class="surface p-5">
			<h2 class="heading-3">Sign-in</h2>
			<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-15px">
				<dt class="text-dim">Joined</dt>
				<dd>{formatDate(u.createdAt)}</dd>
				<dt class="text-dim">Last sign-in</dt>
				<dd>
					{when(u.signIn.lastSignInAt)} <span class="text-dim">· {ago(u.signIn.lastSignInAt)}</span>
				</dd>
				<dt class="text-dim">Last seen</dt>
				<dd>
					{when(u.signIn.lastSeenAt)} <span class="text-dim">· {ago(u.signIn.lastSeenAt)}</span>
				</dd>
				<dt class="text-dim">Sessions</dt>
				<dd>{u.signIn.openSessions} open of {u.signIn.totalSessions}</dd>
				<dt class="text-dim">Last client</dt>
				<dd>
					{client(u.signIn.lastClient?.userAgent ?? null)}{#if u.signIn.lastClient?.ip}
						<span class="text-dim">· {u.signIn.lastClient.ip}</span>{/if}
				</dd>
				<dt class="text-dim">Methods</dt>
				<dd>
					{u.signIn.providers.length ? u.signIn.providers.join(", ") : "none"}{u.signIn.hasPassword
						? " · password set"
						: " · no password"}
				</dd>
				<dt class="text-dim">Two-factor</dt>
				<dd>
					{#if u.signIn.twoFactorEnabled}
						<span class="text-green-400">on</span>
					{:else if u.signIn.twoFactorEnrolled}
						enrolled but off
					{:else}
						<span class="text-yellow-300">off</span>
					{/if}
				</dd>
			</dl>
		</section>

		<section class="surface p-5">
			<h2 class="heading-3">Accounts</h2>
			{#if u.memberships.length === 0}
				<p class="text-dim text-15px">No accounts.</p>
			{:else}
				<ul class="divide-y divide-white/10 text-15px">
					{#each u.memberships as m (m.slug)}
						<li class="flex flex-wrap items-center justify-between gap-x-4 py-1.5">
							<span>
								<a class="link-dim" href="/{m.slug}/projects">{m.account}</a>
								<span class="text-dim">· {m.role}{m.isFounder ? " · founder" : ""}</span>
							</span>
							<span class="text-13px text-dim">
								since {formatDate(m.since)}{m.status !== "active" ? ` · ${m.status}` : ""}
							</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="surface p-5 md:col-span-2">
			<h2 class="heading-3">Activity</h2>
			<dl class="grid gap-x-6 gap-y-1.5 text-15px sm:grid-cols-[auto_1fr_auto_1fr]">
				<dt class="text-dim">Ideas</dt>
				<dd>{u.activity.ideas}</dd>
				<dt class="text-dim">Takes</dt>
				<dd>
					{u.activity.takes}
					{#if u.activity.takes > 0}
						<span class="text-dim">
							· {formatTime(u.activity.takeSeconds, 0)} · {formatBytes(u.activity.takeBytes)} · last {ago(
								u.activity.lastTakeAt,
							)}
						</span>
					{/if}
				</dd>
				<dt class="text-dim">Projects</dt>
				<dd>{u.activity.projects} created</dd>
				<dt class="text-dim">Songs</dt>
				<dd>{u.activity.songs} created</dd>
				<dt class="text-dim">Stems</dt>
				<dd>
					{u.activity.stems} uploaded
					{#if u.activity.stems > 0}
						<span class="text-dim"
							>· {formatBytes(u.activity.stemBytes)} · last {ago(u.activity.lastStemAt)}</span
						>
					{/if}
				</dd>
				<dt class="text-dim">Document edits</dt>
				<dd>
					{plural(u.activity.docVersions, "version")}
					{#if u.activity.docVersions > 0}<span class="text-dim"
							>· last {ago(u.activity.lastDocAt)}</span
						>{/if}
				</dd>
				<dt class="text-dim">AI requests</dt>
				<dd>{u.activity.aiRequests}</dd>
				<dt class="text-dim">Bug reports</dt>
				<dd>{u.activity.bugReports}</dd>
				<dt class="text-dim">Invitations sent</dt>
				<dd>{u.activity.invitations}</dd>
				<dt class="text-dim">Share links</dt>
				<dd>{u.activity.shareLinks}</dd>
				<dt class="text-dim">Invite codes</dt>
				<dd>{u.activity.inviteCodes}</dd>
			</dl>
		</section>

		<section class="surface p-5 md:col-span-2">
			<h2 class="heading-3">Recent audit lines</h2>
			{#if u.audit.length === 0}
				<p class="text-dim text-15px">
					None. Audit lines are written only for acting memberships (super admins outside their own
					accounts).
				</p>
			{:else}
				<ul class="divide-y divide-white/10 font-mono text-13px">
					{#each u.audit as a (a.id)}
						<li class="flex flex-wrap justify-between gap-x-4 py-1">
							<span class="truncate">{a.action}{a.account ? ` · ${a.account.name}` : ""}</span>
							<span class="text-dim">{when(a.at)}</span>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</section>
