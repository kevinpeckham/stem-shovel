import { render, screen } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import type { ChatAttachmentRow } from "#lib/server/data.js";

/**
 * The files under a chat message (docs/chat.md, "Attachments"): a picture
 * is its thumbnail opening the share link in a new tab; any other file a
 * chip with its name and size that downloads it.
 */
const { default: ChatAttachments } = await import("./ChatAttachments.svelte");

const row = (over: Partial<ChatAttachmentRow>): ChatAttachmentRow => ({
	id: "a1",
	filename: "photo.jpg",
	kind: "image",
	contentType: "image/jpeg",
	sizeBytes: 2048,
	url: "https://blob.example/accounts/x/chat/a1.jpg",
	thumbnailUrl: "https://blob.example/accounts/x/chat/a1-thumb.webp",
	width: 800,
	height: 600,
	shareCode: "abc123",
	...over,
});

describe("ChatAttachments", () => {
	test("an image is its thumbnail, linking to the share page in a new tab", () => {
		render(ChatAttachments, { attachments: [row({})] });
		const link = screen.getByRole("link", { name: "Open photo.jpg" });
		expect(link.getAttribute("href")).toBe("/f/abc123");
		expect(link.getAttribute("target")).toBe("_blank");
		const img = link.querySelector("img");
		expect(img?.getAttribute("src")).toBe("https://blob.example/accounts/x/chat/a1-thumb.webp");
	});

	test("an image without a thumbnail shows the file itself", () => {
		render(ChatAttachments, { attachments: [row({ thumbnailUrl: null })] });
		const img = screen.getByRole("img", { name: "photo.jpg" });
		expect(img.getAttribute("src")).toBe("https://blob.example/accounts/x/chat/a1.jpg");
	});

	test("a PDF is a chip with its name and size that downloads it", () => {
		render(ChatAttachments, {
			attachments: [
				row({
					id: "a2",
					filename: "chart.pdf",
					kind: "pdf",
					contentType: "application/pdf",
					sizeBytes: 3 * 1024 * 1024,
					shareCode: "pdf999",
				}),
			],
		});
		const chip = screen.getByRole("link", { name: "Download chart.pdf" });
		expect(chip.getAttribute("href")).toBe("/f/pdf999?download=1");
		expect(chip.textContent).toContain("chart.pdf");
		expect(chip.textContent).toContain("3.0 MB");
		expect(screen.queryByRole("img")).toBeNull();
	});

	test("nothing renders without attachments", () => {
		const { container } = render(ChatAttachments, { attachments: [] });
		expect(container.querySelector("[data-chat-attachments]")).toBeNull();
	});
});
