<script lang="ts">
	import { notifications } from "$lib/state/notifications.svelte";

	/**
	 * The notification stack: fixed to the bottom-right corner so it never
	 * pushes content around; newest at the bottom. Screen readers get the
	 * region as a polite live region.
	 */
	const tone = {
		success: "border-accent/60",
		info: "border-blue-300/60",
		error: "border-red-400/70",
	} as const;
</script>

<div
	class="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6 sm:bottom-6"
	aria-live="polite"
	aria-relevant="additions"
>
	{#each notifications.items as n (n.id)}
		<div
			class="pointer-events-auto flex max-w-sm items-start gap-3 rounded-md border-l-4 bg-oxford-800 px-4 py-3 text-15px text-neutral-100 shadow-lg shadow-black/50 {tone[
				n.kind
			]}"
			role={n.kind === "error" ? "alert" : "status"}
			data-notification={n.kind}
		>
			<p class="min-w-0 grow">{n.message}</p>
			{#if n.dismissable}
				<button
					type="button"
					class="shrink-0 opacity-60 hover-opacity-100"
					aria-label="Dismiss"
					onclick={() => notifications.dismiss(n.id)}
				>
					<span class="block i-ph-x"></span>
				</button>
			{/if}
		</div>
	{/each}
</div>
