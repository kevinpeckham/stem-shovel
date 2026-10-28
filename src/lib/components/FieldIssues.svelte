<script lang="ts">
	/** A remote form field's validation messages (`form.fields.<name>.issues()`), one line each; nothing when there are none. */
	let { issues }: { issues: { message: string }[] | undefined } = $props();
</script>

{#each issues ?? [] as issue (issue.message)}
	<p class="text-sm text-red-400">{issue.message}</p>
{/each}
