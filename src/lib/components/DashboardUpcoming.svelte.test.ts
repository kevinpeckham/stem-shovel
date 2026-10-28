import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({ calendarFeedUrl: vi.fn(), notify: vi.fn() }));
vi.mock("#lib/remote/calendar.remote.js", () => ({ calendarFeedUrl: h.calendarFeedUrl }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));

const { default: DashboardUpcoming } = await import("./DashboardUpcoming.svelte");

const TODAY = "2026-10-28";
const one = [{ accountId: "a1", slug: "lj", name: "Lightning Jar" }];
const two = [...one, { accountId: "a2", slug: "ns", name: "Night Shift" }];
const show = {
	id: "ev1",
	accountSlug: "lj",
	accountName: "Lightning Jar",
	kind: "show" as const,
	title: "Release show",
	startsOn: "2026-10-29",
	startsAt: "20:00",
	place: "The Echo",
	posterThumbnailUrl: "https://blob.example/p-thumb.webp",
};
const practice = {
	...show,
	id: "ev2",
	accountSlug: "ns",
	accountName: "Night Shift",
	kind: "practice" as const,
	title: "",
	startsOn: "2026-11-11",
	startsAt: "",
	place: "",
	posterThumbnailUrl: null,
};

describe("DashboardUpcoming", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("nothing at all without events", () => {
		const { container } = render(DashboardUpcoming, {
			props: { events: [], accounts: one, today: TODAY },
		});
		expect(container.querySelector("section")).toBeNull();
	});

	test("rows link to the event with the poster, the countdown, the day, the time and the place", () => {
		render(DashboardUpcoming, { props: { events: [show], accounts: one, today: TODAY } });
		expect(screen.getByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
		const list = screen.getByRole("list", { name: "Upcoming shows and practices" });
		const link = within(list).getByRole("link");
		expect(link).toHaveAttribute("href", "/lj/events/ev1");
		expect(link).toHaveTextContent("Release show");
		expect(link).toHaveTextContent("Tomorrow · Oct 29, 2026 · 20:00 · The Echo");
		expect(link.querySelector("img")).toHaveAttribute("src", show.posterThumbnailUrl);
		expect(link).not.toHaveTextContent("Lightning Jar");
		expect(screen.getByRole("link", { name: "All shows" })).toHaveAttribute("href", "/lj/shows");
	});

	test("with several accounts: the account on each row, no footer; an untitled practice is called Practice", () => {
		render(DashboardUpcoming, { props: { events: [show, practice], accounts: two, today: TODAY } });
		const rows = within(screen.getByRole("list")).getAllByRole("link");
		expect(rows[1]).toHaveTextContent("Practice");
		expect(rows[1]).toHaveTextContent("In 2 weeks · Nov 11, 2026");
		expect(rows[1]).toHaveTextContent("Night Shift");
		expect(screen.queryByRole("link", { name: "All shows" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Calendar feed" })).toBeNull();
	});

	test("Calendar feed copies the feed's full address and says so", async () => {
		const user = userEvent.setup();
		h.calendarFeedUrl.mockResolvedValue({ url: "/cal/tok.ics" });
		const write = vi.spyOn(navigator.clipboard, "writeText");
		render(DashboardUpcoming, { props: { events: [show], accounts: one, today: TODAY } });
		await user.click(screen.getByRole("button", { name: "Calendar feed" }));
		expect(h.calendarFeedUrl).toHaveBeenCalledWith({ accountId: "a1" });
		expect(write).toHaveBeenCalledWith(`${location.origin}/cal/tok.ics`);
		expect(h.notify).toHaveBeenCalledWith(
			"Calendar link copied: subscribe to it in your calendar app",
		);
	});

	test("no feed button where the feed is not the viewer's", () => {
		render(DashboardUpcoming, {
			props: { events: [show], accounts: one, today: TODAY, feed: false },
		});
		expect(screen.queryByRole("button", { name: "Calendar feed" })).toBeNull();
	});
});
