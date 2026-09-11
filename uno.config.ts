import extractorSvelte from "@unocss/extractor-svelte";
import presetWind4 from "@unocss/preset-wind4";
import {
	defineConfig,
	presetWebFonts,
	transformerDirectives,
	transformerVariantGroup,
} from "unocss";
import { colors, lj } from "./src/lib/theme";

/**
 * Mirrors lightningjar.com's uno.config (lightning-jar/lj-website) so the
 * app shares its look: wind4 + reset, Atkinson Hyperlegible / Bungee Shade
 * from bunny, the same layers, palette and shortcuts. On top of that, the
 * app's semantic colour tokens (see src/lib/theme.ts).
 */
export default defineConfig({
	content: {
		pipeline: { include: [/\.(svelte|md|json|html)($|\?)/] },
		filesystem: ["./src/app.html"],
	},
	extractors: [extractorSvelte()],
	layers: {
		reset: 1,
		preflights: 2,
		variables: 3,
		components: 4,
		base: 5,
		default: 7,
		utilities: 8,
		shortcuts: 9,
	},
	outputToCssLayers: {
		cssLayerName: (layer) => (layer === "default" ? "utilities" : undefined),
	},
	preflights: [
		{
			layer: "preflights",
			getCSS: () => `html { --accent: ${lj.accent} }`,
		},
	],
	presets: [
		presetWind4({ preflights: { reset: true } }),
		presetWebFonts({
			provider: "bunny",
			fonts: {
				display: "Bungee Shade",
				sans: { name: "Atkinson Hyperlegible", weights: ["400", "700"] },
			},
		}),
	],
	theme: {
		colors: {
			...lj,
			...colors,
			accent: "var(--accent)", // themeable at runtime, like lj-website
		},
	},
	safelist: ["grid", "grid-cols-1", "grid-rows-[auto_1fr_auto]", "min-h-screen", "w-full"],
	shortcuts: [
		// lj-website's
		[
			"button",
			"flex max-w-fit gap-2 px-3 py-2 rounded border border-current opacity-90 text-[0.9em] hover:text-accent hover:opacity-100 hover:shadow hover:shadow-current disabled:(opacity-40 pointer-events-none)",
		],
		["button-accent", "button text-accent hover:text-oxford hover:bg-accent"],
		["page-x-padding", "px-4 sm:px-6 md:px-7 lg:px-8 xl:px-16 2xl:px-24"],
		["main-y-padding", "pt-10 pb-14 lg:(pt-12 pb-16) xl:(pt-14 pb-20) 2xl:(pt-16 pb-22)"],
		[
			"display",
			"text-balance font-700 font-display text-maximumYellow mb-3 text-32px lg:text-42px leading-snug",
		],
		["heading-2", "font-700 text-maximumYellow mb-3 text-20px lg:text-24px"],
		// app additions
		["page-title", "text-24px lg:text-28px font-700 text-maximumYellow text-balance"],
		["section-title", "text-15px font-700 text-maximumYellow"],
		["link-dim", "text-dim underline underline-offset-4 hover:text-maximumYellow"],
		["surface", "rounded border border-white/10 bg-row"],
		[
			"field",
			"block w-full rounded border border-white/15 bg-black/20 px-3 py-2 text-neutral-100 placeholder:text-slate-400 focus:(border-maximumYellow outline-none)",
		],
		["tab", "px-3 py-1 text-xs"],
		["tab-active", "tab bg-maximumYellow text-oxford"],
		["tab-idle", "tab text-dim hover:text-neutral-100"],
	],
	transformers: [transformerDirectives(), transformerVariantGroup()],
});
