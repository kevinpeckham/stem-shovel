import { fireEvent, render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vite-plus/test";
import ExportPanel from "./ExportPanel.svelte";

describe("ExportPanel", () => {
	test("exports the mix as 24-bit WAV in a zip by default; the choices reach the caller", async () => {
		const user = userEvent.setup();
		const onexport = vi.fn();
		render(ExportPanel, { props: { trackCount: 2, busCount: 1, busy: false, onexport } });
		await user.click(screen.getByRole("button", { name: "Export" }));
		expect(onexport).toHaveBeenLastCalledWith(
			{ mix: true, tracks: false, buses: false, dawproject: false, bits: 24, normalize: false },
			true,
		);
		await user.click(screen.getByRole("checkbox", { name: /A stem per track/ }));
		await user.click(screen.getByRole("checkbox", { name: /A stem per bus/ }));
		await user.click(screen.getByRole("checkbox", { name: /A DAWproject/ }));
		await user.click(screen.getByRole("radio", { name: "16-bit WAV" }));
		await user.click(screen.getByRole("checkbox", { name: /Normalize to -14 LUFS/ }));
		await user.click(screen.getByRole("checkbox", { name: /One zip/ }));
		await user.click(screen.getByRole("button", { name: "Export" }));
		expect(onexport).toHaveBeenLastCalledWith(
			{ mix: true, tracks: true, buses: true, dawproject: true, bits: 16, normalize: true },
			false,
		);
	});
	test("nothing chosen disables Export; no tracks or buses disable their stems", async () => {
		const user = userEvent.setup();
		render(ExportPanel, { props: { trackCount: 0, busCount: 0, busy: false, onexport: vi.fn() } });
		expect(screen.getByRole("checkbox", { name: /A stem per track/ })).toBeDisabled();
		expect(screen.getByRole("checkbox", { name: /A stem per bus/ })).toBeDisabled();
		await user.click(screen.getByRole("checkbox", { name: /The mix/ }));
		expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
	});
	test("busy locks the controls and shows the step; the results list each file's loudness", () => {
		render(ExportPanel, {
			props: {
				trackCount: 1,
				busCount: 0,
				busy: true,
				step: "Rendering the mix…",
				onexport: vi.fn(),
				results: [
					{
						name: "Song.wav",
						blob: new Blob([new Uint8Array(2048)]),
						loudness: { integrated: -14.04, truePeak: -1.2, samplePeak: -1.5 },
						gainDb: 6,
					},
					{ name: "Song.dawproject", blob: new Blob([new Uint8Array(3 * 1024 * 1024)]) },
				],
			},
		});
		expect(screen.getByRole("button", { name: "Exporting…" })).toBeDisabled();
		expect(screen.getByText("Rendering the mix…")).toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: /The mix/ })).toBeDisabled();
		const list = screen.getByRole("list", { name: "Exported files" });
		expect(list).toHaveTextContent(
			"Song.wav 2 KB · -8.0 LUFS · 4.8 dBTP · +6 dB applied (was -14.0 LUFS)",
		);
		expect(list).toHaveTextContent("Song.dawproject 3.0 MB");
	});
	test("a silent file says so", async () => {
		render(ExportPanel, {
			props: {
				trackCount: 1,
				busCount: 0,
				busy: false,
				onexport: vi.fn(),
				results: [
					{
						name: "Quiet.wav",
						blob: new Blob([]),
						loudness: { integrated: null, truePeak: -Infinity, samplePeak: -Infinity },
						gainDb: 0,
					},
				],
			},
		});
		expect(screen.getByRole("list", { name: "Exported files" })).toHaveTextContent(
			"Quiet.wav 0 KB · silent",
		);
		await fireEvent.click(screen.getByRole("button", { name: "Export" }));
	});
});
