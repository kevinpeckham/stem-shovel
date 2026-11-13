<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";

	/**
	 * The info tip at the end of the arrangement row (ArrangementSwitcher):
	 * what the row is and does, for whoever meets it first. An editor is told
	 * about + and the arrangement's own menu too.
	 */
	let { canEdit }: { canEdit: boolean } = $props();
</script>

<InfoTip label="About arrangements" width="w-80">
	<p>
		Arrangements are sets of stems for this song. <strong>Main</strong> is the song's own. Each other
		one is an alternate: a different treatment, or one member's ideas for the band to hear. Click one
		to switch to its stems.
	</p>
	{#if canEdit}
		<p class="mt-2">
			<strong>+</strong> makes a new arrangement, copied from an existing one or empty. A copy shares
			its audio, so it takes no extra storage. From there you can mute, remove, replace or add stems without
			changing the arrangement it came from.
		</p>
		<p class="mt-2">
			The <strong>arrow</strong> on the arrangement you are on opens its menu: rename, duplicate or delete
			an alternate, or duplicate Main. An alternate can have its own tempo and start of bar 1, set in
			the song's settings.
		</p>
	{/if}
</InfoTip>
