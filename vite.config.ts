import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import UnoCSS from "unocss/vite";
import { defineConfig } from "vite-plus";

// One config for dev/build (Vite), lint (Oxlint) and format (Oxfmt).
export default defineConfig({
	// Oxlint. It has no Svelte template linting yet, so .svelte files are only
	// covered by svelte-check (`npm run check`); Oxlint covers .ts/.js/.svelte.ts.
	lint: {
		jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
		rules: { "vite-plus/prefer-vite-plus-imports": "error" },
		options: { typeAware: true, typeCheck: true },
	},
	// Oxfmt. Formats .svelte end to end (script AND template) via the bundled
	// prettier-plugin-svelte — the part Biome couldn't do.
	fmt: {
		useTabs: true, // match the SvelteKit scaffold
		printWidth: 100,
		svelte: true, // needs the `svelte` package present, which SvelteKit provides
		ignorePatterns: [],
	},
	plugins: [
		// UnoCSS must come before the SvelteKit plugin so `virtual:uno.css` resolves
		UnoCSS(),
		sveltekit({
			compilerOptions: {
				// Runes mode everywhere except node_modules (removable in Svelte 6)
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
			},
			// Vercel runs SvelteKit on Node; Bun is only used locally for install/scripts
			adapter: adapter(),
		}),
	],
});
