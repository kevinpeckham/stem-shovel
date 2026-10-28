<script lang="ts">
	/** Whose dashboard a super admin (or a narrowed view) is looking at: another user's, or one account's. */
	type Viewing =
		| { kind: "user"; id: string; name: string }
		| { kind: "account"; slug: string; name: string; actingAs: boolean };

	let { viewing }: { viewing: Viewing } = $props();
</script>

<p
	class="surface mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-15px"
	role="status"
>
	{#if viewing.kind === "user"}
		<span
			class="rounded bg-red-400/20 px-1.5 py-0.5 text-10px uppercase tracking-wider text-red-300"
			>viewing as user</span
		>
		<span
			>You are viewing the dashboard of {viewing.name} as they see it. Every view is logged. Their pins
			and their "since your last visit" marker are not touched.</span
		>
	{:else if viewing.actingAs}
		<span
			class="rounded bg-red-400/20 px-1.5 py-0.5 text-10px uppercase tracking-wider text-red-300"
			>acting as owner</span
		>
		<span
			>You are viewing the dashboard of {viewing.name} as its owner. You are not a member here, and every
			action is logged.</span
		>
	{:else}
		<span>Showing {viewing.name} alone.</span>
	{/if}
	<a class="link" href="/dashboard">Back to your dashboard</a>
</p>
