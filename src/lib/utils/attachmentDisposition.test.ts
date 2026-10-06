import { describe, expect, it } from "vite-plus/test";
import { attachmentDisposition } from "./attachmentDisposition";

describe("attachmentDisposition", () => {
	it("names the file twice, ASCII and encoded", () => {
		expect(attachmentDisposition("chart.pdf")).toBe(
			`attachment; filename="chart.pdf"; filename*=UTF-8''chart.pdf`,
		);
	});
	it("keeps quotes and line breaks out and encodes the rest", () => {
		expect(attachmentDisposition('Zoë "lead"\nsheet.pdf')).toBe(
			`attachment; filename="Zo_ _lead__sheet.pdf"; filename*=UTF-8''Zo%C3%AB%20_lead__sheet.pdf`,
		);
	});
	it("falls back for an empty name", () => {
		expect(attachmentDisposition("  ")).toContain('filename="download"');
	});
});
