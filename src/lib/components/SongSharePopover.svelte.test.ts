import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The song's Share by email popover: the wording for a private song or a
 * public one, and the send through the remote function (a double), with the
 * notice, the cleared form and the error. The share links list is a stand-in.
 */
const h = vi.hoisted(() => ({
	shareSong: vi.fn(async (_args: unknown) => ({ sent: "jo@example.com" })),
	notify: vi.fn(),
}));
vi.mock("#lib/remote/songs.remote.js", () => ({ shareSong: h.shareSong }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/components/ShareLinks.svelte", () => ({ default: () => {} }));

const { default: SongSharePopover } = await import("./SongSharePopover.svelte");

const DEMO_AIM = {
	kind: "demo" as const,
	id: "demo1",
	name: "“Phone memo”",
	url: "http://localhost/a/projects/p/s/demos/demo1",
};

function setup(isPrivate = false, projectPrivate = false, aim: typeof DEMO_AIM | null = null) {
	const { container } = render(SongSharePopover, {
		song: { id: "song1", isPrivate, project: { isPrivate: projectPrivate } },
		shareLinks: [],
		aim,
	});
	const popover = container.querySelector<HTMLElement>("#song-share")!;
	popover.showPopover();
	return { popover };
}

describe("SongSharePopover", () => {
	beforeAll(() => installFakePopover());
	beforeEach(() => vi.clearAllMocks());

	test("a public song sends the page's link", () => {
		setup();
		expect(screen.getByText(/Sends the link to this page/)).toBeTruthy();
		expect(screen.queryByText(/made for the recipient/)).toBeNull();
	});

	test("a song in a private project sends a viewing link made for the recipient", () => {
		setup(false, true);
		expect(screen.getByText(/made for the recipient/)).toBeTruthy();
	});

	test("send calls shareSong, notifies, clears the form and closes", async () => {
		const { popover } = setup();
		const to = screen.getByLabelText("To") as HTMLInputElement;
		const note = screen.getByLabelText(/Note/) as HTMLTextAreaElement;
		await fireEvent.input(to, { target: { value: "jo@example.com" } });
		await fireEvent.input(note, { target: { value: "Have a listen" } });
		await fireEvent.submit(to.form!);
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Sent to jo@example.com"));
		expect(h.shareSong).toHaveBeenCalledWith({
			songId: "song1",
			to: "jo@example.com",
			message: "Have a listen",
		});
		expect(to.value).toBe("");
		expect(note.value).toBe("");
		expect(popover.style.display).toBe("none");
	});

	test("a failed send shows the error in the popover", async () => {
		h.shareSong.mockRejectedValueOnce(new Error("Too many emails"));
		setup();
		const to = screen.getByLabelText("To") as HTMLInputElement;
		await fireEvent.input(to, { target: { value: "jo@example.com" } });
		await fireEvent.submit(to.form!);
		expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Too many emails");
		expect(h.notify).not.toHaveBeenCalled();
		expect(screen.getByText("Send")).toBeTruthy();
	});

	test("aimed at a demo: the heading names it, a public song offers its page to copy, the send carries its id", async () => {
		setup(false, false, DEMO_AIM);
		expect(screen.getByRole("heading", { name: "Share “Phone memo”" })).toBeTruthy();
		expect(screen.getByText(/Sends a link that opens this demo/)).toBeTruthy();
		expect(screen.getByText(DEMO_AIM.url)).toBeTruthy();
		const to = screen.getByLabelText("To") as HTMLInputElement;
		await fireEvent.input(to, { target: { value: "jo@example.com" } });
		await fireEvent.submit(to.form!);
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Sent to jo@example.com"));
		expect(h.shareSong).toHaveBeenCalledWith({
			songId: "song1",
			demoId: "demo1",
			to: "jo@example.com",
			message: "",
		});
	});

	test("aimed at a demo of a private song: a viewing link made for the recipient, nothing to copy", () => {
		setup(true, false, DEMO_AIM);
		expect(screen.getByText(/made for the recipient/)).toBeTruthy();
		expect(screen.queryByText(DEMO_AIM.url)).toBeNull();
	});
});
