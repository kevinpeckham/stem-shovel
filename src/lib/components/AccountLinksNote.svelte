<script lang="ts">
	import { page } from "$app/state";

	/** Under a page's own viewing links (ShareLinks.svelte): the way to every link of the account (/[account]/links), when the page is under an account. */
</script>

{#if page.params?.account}
	<p class="mt-2 text-12px">
		<a class="link" href="/{page.params.account}/links">All of this account's viewing links</a>
	</p>
{/if}
