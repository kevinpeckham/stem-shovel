import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import UnoCSS from "unocss/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vite-plus";

// One config for dev/build (Vite), lint (Oxlint) and format (Oxfmt).
/** Where stems, renditions, mixes and demos are served from (any public Blob store). */
const BLOB_STORE = "https://*.public.blob.vercel-storage.com";
/** The private store, reached with presigned URLs (src/lib/server/blob.ts). */
const BLOB_PRIVATE_STORE = "https://*.private.blob.vercel-storage.com";
const production = process.env.NODE_ENV === "production";

export default defineConfig({
	// Loaded on demand by the chord detector; pre-bundling them at start-up
	// spares the dev server a mid-session re-optimisation (a 504 on first use).
	optimizeDeps: { include: ["@spotify/basic-pitch", "@tensorflow/tfjs"] },
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
		ignorePatterns: ["src/env.d.ts", "drizzle/**"], // generated: varlock types, drizzle-kit migrations
	},
	// better-auth is pure ESM but Vercel's file tracer (@vercel/nft) resolves
	// its package to package.json alone and never copies dist/, so the function
	// would fail with "Cannot find module 'better-auth'". Bundling it into the
	// server chunk sidesteps the tracer; its dependencies trace fine.
	ssr: { noExternal: [/^better-auth(\/|$)/] },
	plugins: [
		// varlock replaces Vite's .env loading with .env.schema (validated, typed,
		// secrets pulled from 1Password). Must come before the SvelteKit plugin.
		// `resolved-env` bakes the resolved values into the SSR bundle at build
		// time, encrypted in preview/production (see @encryptInjectedEnv in
		// .env.schema), so Vercel functions need no Blob env vars of their own.
		// CI has no 1Password: it sets SKIP_VARLOCK=1 and runs lint, check and the
		// tests (which mock the env) without the plugin. Never set it for a build.
		...(process.env.SKIP_VARLOCK ? [] : [varlockVitePlugin({ ssrInjectMode: "resolved-env" })]),
		// UnoCSS must come before the SvelteKit plugin so `virtual:uno.css` resolves
		UnoCSS(),
		sveltekit({
			compilerOptions: {
				// Runes mode everywhere except node_modules (removable in Svelte 6)
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
				// `await` in components, required by remote functions
				experimental: { async: true },
			},
			// Server mutations/queries are remote functions (*.remote.ts), not form actions
			experimental: { remoteFunctions: true },
			// Content Security Policy (docs/environment.md). SvelteKit adds a nonce
			// for its own inline script; inline styles stay allowed because
			// `style:` attributes and transitions need them. Audio and uploads
			// talk to Vercel Blob: files come from the public store, client
			// uploads go to Blob's API on vercel.com.
			csp: {
				mode: "auto",
				directives: {
					"default-src": ["self"],
					"script-src": ["self"],
					"style-src": ["self", "unsafe-inline"],
					"img-src": ["self", "data:", "blob:"],
					"font-src": ["self", "data:", "https://fonts.bunny.net"],
					"media-src": ["self", "blob:", BLOB_STORE, BLOB_PRIVATE_STORE],
					"connect-src": ["self", BLOB_STORE, BLOB_PRIVATE_STORE, "https://vercel.com/api/blob/"],
					"worker-src": ["self", "blob:"],
					"object-src": ["none"],
					"base-uri": ["self"],
					"form-action": ["self"],
					"frame-ancestors": ["none"],
					...(production ? { "upgrade-insecure-requests": true } : {}),
				},
			},
			// Vercel runs SvelteKit on Node; Bun is only used locally for install/scripts
			adapter: adapter(),
		}),
	],
	// Vitest (bundled with Vite+, `bun run test`). Two projects, as in
	// replicator: unit tests run in Node; component tests in jsdom with
	// @testing-library/svelte. Naming: `*.test.ts` and `*.svelte.test.ts`,
	// co-located with what they test (helpers in tests/ for the mocks).
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					environment: "node",
					include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
					exclude: ["src/**/*.svelte.test.ts"],
				},
			},
			{
				extends: true,
				plugins: [svelteTesting()],
				test: {
					name: "components",
					environment: "jsdom",
					include: ["src/**/*.svelte.test.ts"],
					setupFiles: ["tests/setup-components.ts"],
				},
			},
		],
	},
});
