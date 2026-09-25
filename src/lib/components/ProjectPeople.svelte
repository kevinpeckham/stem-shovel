<script lang="ts">
	import {
		addProjectMember,
		inviteProjectViewer,
		removeProjectPerson,
		revokeProjectInvitation,
		setProjectRestricted,
	} from "$lib/remote/projects.remote";
	import { clearForm } from "$lib/utils/clearForm";
	import { formatDate } from "$lib/utils/formatDate";
	import { notify } from "$lib/state/notifications.svelte";

	/**
	 * Who is on a project besides the account's owners and admins (docs/auth.md):
	 * viewers invited from outside the account by email (they see the project's
	 * private work and comment, take no seat) and, once the project is
	 * restricted, the account members added to it. Shown in the project's
	 * settings to whoever may edit the project.
	 */
	interface Person {
		userId: string;
		name: string;
		email: string;
		role: "member" | "viewer";
		since: Date;
	}
	interface Props {
		projectId: string;
		projectName: string;
		isRestricted: boolean;
		people: Person[];
		invitations: { id: string; email: string; expiresAt: Date }[];
		/** The account's members, to add one to a restricted project. */
		accountMembers: { userId: string; name: string; email: string; role: string }[];
	}
	let { projectId, projectName, isRestricted, people, invitations, accountMembers }: Props =
		$props();

	const onProject = $derived(new Set(people.map((p) => p.userId)));
	/** Members who could be added: not owners or admins (on every project already), not already here. */
	const addable = $derived(
		accountMembers.filter(
			(m) => m.role !== "owner" && m.role !== "admin" && !onProject.has(m.userId),
		),
	);
	const viewers = $derived(people.filter((p) => p.role === "viewer"));
	const members = $derived(people.filter((p) => p.role === "member"));
</script>

<div>
	<h3 class="text-15px font-700">
		<span
			class="mr-1 inline-block align-[-2px] {isRestricted ? 'i-ph-lock-key' : 'i-ph-users'}"
			aria-hidden="true"
		></span>
		People
	</h3>

	<!-- restricted -->
	<p class="mt-1 text-sm opacity-90">
		{#if isRestricted}
			Restricted: only the people below and the account's owners and admins can open this project.
			Other members of the account do not see it.
		{:else}
			Every member of the account can open and edit this project. Restrict it to let only the people
			added here (and the account's owners and admins) in.
		{/if}
	</p>
	<form
		class="mt-2"
		{...setProjectRestricted.enhance(async ({ submit }) => {
			await submit();
			if (setProjectRestricted.result)
				notify(
					setProjectRestricted.result.restricted
						? "Project restricted to the people added to it"
						: "Project open to every member again",
				);
		})}
	>
		<input {...setProjectRestricted.fields.id.as("hidden", projectId)} />
		<input
			{...setProjectRestricted.fields.restricted.as("hidden", isRestricted ? "false" : "true")}
		/>
		<button class="button button-sm" disabled={!!setProjectRestricted.pending}>
			{setProjectRestricted.pending
				? "Saving…"
				: isRestricted
					? "Open to every member"
					: "Restrict to the people added"}
		</button>
	</form>

	<!-- who is on it -->
	{#if people.length > 0}
		<ul class="mt-4 surface divide-y divide-white/10 text-sm" aria-label="People on {projectName}">
			{#each people as p (p.userId)}
				{@const remove = removeProjectPerson.for(p.userId)}
				<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
					<span class="min-w-0">
						<span class="font-500">{p.name}</span>
						<span class="text-dim"> · {p.email}</span>
						<span class="ml-2 text-11px uppercase tracking-wider text-dim">{p.role}</span>
					</span>
					<form
						{...remove.enhance(async ({ submit }) => {
							if (!confirm(`Remove ${p.name} from ${projectName}?`)) return;
							await submit();
							if (remove.result?.removed) notify(`${p.name} removed from the project`);
						})}
					>
						<input {...remove.fields.projectId.as("hidden", projectId)} />
						<input {...remove.fields.userId.as("hidden", p.userId)} />
						<button class="link-dim text-13px" disabled={!!remove.pending}>Remove</button>
					</form>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="mt-4 text-sm text-dim">
			Nobody added yet{isRestricted ? ": only the account's owners and admins can open it" : ""}.
		</p>
	{/if}
	{#if members.length === 0 && viewers.length > 0 && isRestricted}
		<p class="mt-1 text-13px text-dim">
			Viewers only: no member of the account is on it besides its owners and admins.
		</p>
	{/if}

	<!-- add a member -->
	{#if addable.length > 0}
		<form
			class="mt-4 flex flex-wrap items-end gap-3"
			{...addProjectMember.enhance(async ({ submit, element }) => {
				await submit();
				const issue = addProjectMember.fields.allIssues()?.[0];
				if (issue) notify(issue.message, { kind: "error" });
				else if (addProjectMember.result) {
					notify(addProjectMember.result.added ? "Added to the project" : "Already on the project");
					clearForm(addProjectMember);
					element.reset();
				}
			})}
		>
			<input {...addProjectMember.fields.projectId.as("hidden", projectId)} />
			<label class="block grow">
				<span class="text-13px text-dim">Add a member of the account</span>
				<select
					class="mt-1 field text-sm"
					{...addProjectMember.fields.userId.as("select")}
					required
				>
					<option value="">Choose…</option>
					{#each addable as m (m.userId)}
						<option value={m.userId}>{m.name} · {m.email}</option>
					{/each}
				</select>
			</label>
			<button class="button button-sm" disabled={!!addProjectMember.pending}>
				{addProjectMember.pending ? "Adding…" : "Add"}
			</button>
		</form>
		{#if !isRestricted}
			<p class="mt-1 text-13px text-dim">
				Members are on every open project already; adding one here matters once the project is
				restricted.
			</p>
		{/if}
	{/if}

	<!-- invite a viewer -->
	<h4 class="mt-6 text-14px font-700">Invite a viewer</h4>
	<p class="mt-1 text-13px opacity-90">
		Someone outside the account who should hear this project and comment on it: a producer, a label,
		a friend. They can play its songs and stems and read its charts, lyrics and notes, and change
		nothing. Viewers take no seat.
	</p>
	<form
		class="mt-2 flex flex-wrap items-end gap-3"
		{...inviteProjectViewer.enhance(async ({ submit, element }) => {
			await submit();
			if (inviteProjectViewer.result?.sent) {
				notify(`Invitation sent to ${inviteProjectViewer.result.sent}`);
				clearForm(inviteProjectViewer);
				element.reset();
			}
		})}
	>
		<input {...inviteProjectViewer.fields.projectId.as("hidden", projectId)} />
		<label class="block grow">
			<span class="text-13px text-dim">Email</span>
			<input
				class="mt-1 field text-sm"
				type="email"
				autocomplete="off"
				{...inviteProjectViewer.fields.email.as("text")}
				required
			/>
		</label>
		<button class="button-accent button-sm" disabled={!!inviteProjectViewer.pending}>
			{inviteProjectViewer.pending ? "Sending…" : "Send invitation"}
		</button>
	</form>
	{#each inviteProjectViewer.fields.email.issues() ?? [] as issue (issue.message)}
		<p class="mt-1 text-sm text-red-400">{issue.message}</p>
	{/each}
	{#if invitations.length > 0}
		<ul class="mt-3 surface divide-y divide-white/10 text-sm" aria-label="Open viewer invitations">
			{#each invitations as inv (inv.id)}
				{@const revoke = revokeProjectInvitation.for(inv.id)}
				<li class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
					<span>
						{inv.email}
						<span class="text-dim"> · invited, expires {formatDate(inv.expiresAt)}</span>
					</span>
					<form
						{...revoke.enhance(async ({ submit }) => {
							await submit();
							if (revoke.result?.revoked) notify("Invitation revoked");
						})}
					>
						<input {...revoke.fields.id.as("hidden", inv.id)} />
						<button class="link-dim text-13px" disabled={!!revoke.pending}>Revoke</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</div>
