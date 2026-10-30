<script lang="ts">
	import type { StemActions } from "#lib/state/stemActions.svelte.js";
	import { bumpVersion } from "#lib/utils/bumpVersion.js";

	/**
	 * After stems change, the offer to bump the song's version: patch, minor or
	 * major, or keep it (docs/song-page.md, step 7). The user decides, nothing
	 * bumps itself.
	 */
	interface Props {
		actions: StemActions;
		/** The song's version as saved. */
		version: string;
		canEdit: boolean;
	}
	let { actions, version, canEdit }: Props = $props();
</script>

{#if actions.versionOffer && canEdit}
	<div
		class="mb-2 flex flex-wrap items-center gap-3 rounded-md border border-current/40 bg-blue-300/5 px-3 py-2 text-sm"
		role="status"
	>
		<span>Stems changed. Bump the song version from v{version}?</span>
		<button
			class="button button-xs"
			type="button"
			disabled={actions.versionBusy}
			onclick={() => actions.bump("patch")}
		>
			{bumpVersion(version, "patch")}
		</button>
		<button
			class="button button-xs"
			type="button"
			disabled={actions.versionBusy}
			onclick={() => actions.bump("minor")}
		>
			{bumpVersion(version, "minor")}
		</button>
		<button
			class="button button-xs"
			type="button"
			disabled={actions.versionBusy}
			onclick={() => actions.bump("major")}
		>
			{bumpVersion(version, "major")}
		</button>
		<button class="link text-xs" type="button" onclick={actions.dismiss}>Keep v{version}</button>
	</div>
{/if}
