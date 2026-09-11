import presetUno from "@unocss/preset-uno";
import { defineConfig } from "unocss";
import { colors } from "./src/lib/theme";

export default defineConfig({
	presets: [presetUno()],
	theme: {
		// Exposes e.g. `bg-panel`, `text-dim`, `border-line`, `bg-playhead`
		colors,
	},
	// Classes toggled from script (class:active etc.) are still discovered by
	// the extractor as long as they appear literally somewhere in a .svelte file.
});
