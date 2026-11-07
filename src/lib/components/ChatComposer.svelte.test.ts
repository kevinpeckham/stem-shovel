import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";

/**
 * The chat composer's files (docs/chat.md, "Attachments"): a picked file
 * uploads at once and waits in the strip above the box; once up, its id
 * goes with the message as a hidden `attachments[i]`, a message of files
 * alone may be sent, and × removes one through the remote. The remote
 * functions and the upload are doubles.
 */
const sendMessage = fakeRemoteForm();
const removePendingChatAttachment = vi.fn(async () => ({ ok: true }));
const chatPeople = vi.fn(async () => []);
vi.mock("#lib/remote/chat.remote.js", () => ({
	sendMessage,
	removePendingChatAttachment,
	chatPeople,
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));
const uploadChatAttachment = vi.fn();
vi.mock("#lib/upload.js", () => ({ uploadChatAttachment }));

const { default: ChatComposer } = await import("./ChatComposer.svelte");

const attachment = {
	id: "att1",
	filename: "chart.pdf",
	kind: "pdf",
	contentType: "application/pdf",
	sizeBytes: 1024,
	url: "https://blob.example/a.pdf",
	thumbnailUrl: null,
	width: null,
	height: null,
	shareCode: "c1",
};

beforeEach(() => {
	vi.clearAllMocks();
});

async function attachOne() {
	render(ChatComposer, { songId: "s1", onsent: vi.fn() });
	const input = document.querySelector<HTMLInputElement>("[data-chat-attach-input]");
	if (!input) throw new Error("no file input");
	const file = new File(["%PDF-1.7"], "chart.pdf", { type: "application/pdf" });
	await fireEvent.change(input, { target: { files: [file] } });
	await vi.waitFor(() =>
		expect(screen.getByRole("button", { name: "Remove chart.pdf" })).toBeInTheDocument(),
	);
	return file;
}

describe("ChatComposer attachments", () => {
	test("a ready attachment goes with the message as its id", async () => {
		uploadChatAttachment.mockResolvedValueOnce(attachment);
		const file = await attachOne();
		expect(uploadChatAttachment).toHaveBeenCalledWith({ songId: "s1" }, file, expect.any(Function));
		const hidden = document.querySelector<HTMLInputElement>('input[name="attachments[0]"]');
		expect(hidden?.value).toBe("att1");
	});

	test("an empty draft with one attachment can be sent", async () => {
		uploadChatAttachment.mockResolvedValueOnce(attachment);
		await attachOne();
		const send = screen.getByRole("button", { name: "Send" });
		expect(send).toBeEnabled();
		await fireEvent.keyDown(screen.getByRole("textbox", { name: "Message" }), { key: "Enter" });
		await vi.waitFor(() => expect(sendMessage.submit).toHaveBeenCalledTimes(1));
	});

	test("Send waits while a file uploads", async () => {
		uploadChatAttachment.mockReturnValueOnce(new Promise(() => {}));
		render(ChatComposer, { songId: "s1", onsent: vi.fn() });
		const input = document.querySelector<HTMLInputElement>("[data-chat-attach-input]");
		const file = new File(["x"], "take.wav", { type: "audio/wav" });
		if (input) await fireEvent.change(input, { target: { files: [file] } });
		await fireEvent.input(screen.getByRole("textbox", { name: "Message" }), {
			target: { value: "hi" },
		});
		expect(screen.getByRole("progressbar", { name: "Uploading take.wav" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	});

	test("× removes a pending attachment through the remote", async () => {
		uploadChatAttachment.mockResolvedValueOnce(attachment);
		await attachOne();
		await fireEvent.click(screen.getByRole("button", { name: "Remove chart.pdf" }));
		expect(removePendingChatAttachment).toHaveBeenCalledWith({ id: "att1" });
		await vi.waitFor(() =>
			expect(screen.queryByRole("button", { name: "Remove chart.pdf" })).toBeNull(),
		);
		expect(document.querySelector('input[name="attachments[0]"]')).toBeNull();
		expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
	});
});
