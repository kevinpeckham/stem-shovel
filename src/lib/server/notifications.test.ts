import { DEFAULT_PREFS } from "#lib/utils/notificationPolicy.js";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vite-plus/test";
import type { Fixtures, Row } from "../../../tests/helpers/fakeDb";
import { callsTo, fake, reset } from "../../../tests/helpers/fakeDataLayer";

// The database is fakeDb (through fakeDataLayer, so data.ts's limits and
// storage sums run for real over it); only the mail goes to a double.
const mail = vi.hoisted(() => ({
	sendNotificationEmail: vi.fn(async (_opts: unknown) => {}),
	sendDigestEmail: vi.fn(async (_opts: unknown) => {}),
}));
vi.mock("#lib/server/email.js", () => mail);

const {
	checkSeats,
	checkStorage,
	listInbox,
	markAllRead,
	markRead,
	notifyComment,
	notifyDemo,
	notifyInvitationAccepted,
	notifySong,
	notifyStems,
	prefsOf,
	savePrefs,
	sendDigests,
	unreadCount,
} = await import("./notifications");

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MB = 1024 * 1024;
const at = (ms: number) => new Date(ms);

const users = [
	{ id: "u1", name: "Ann", email: "ann@example.com" },
	{ id: "u2", name: "Bob", email: "bob@example.com" },
	{ id: "u3", name: "Cy", email: "cy@example.com" },
	{ id: "u4", name: "Dee", email: "dee@example.com" },
	{ id: "u5", name: "Eve", email: "eve@example.com" },
];
/** Ann owns a1, Bob is a member, Cy an admin. */
const members = [
	{ id: "m1", accountId: "a1", userId: "u1", role: "owner" },
	{ id: "m2", accountId: "a1", userId: "u2", role: "member" },
	{ id: "m3", accountId: "a1", userId: "u3", role: "admin" },
];
const a1 = {
	id: "a1",
	name: "Lightning Jar",
	slug: "lj",
	plan: "free",
	isFounder: false,
	storageLimitBytes: null,
};
const p1 = { id: "p1", accountId: "a1", name: "Album", slug: "album", isRestricted: false };
const s1 = { id: "s1", accountId: "a1", projectId: "p1", title: "Intro", slug: "intro" };
/** Dee is on the project from outside the account. */
const dee = { id: "pm1", projectId: "p1", userId: "u4", role: "viewer" };

const base = (over: Fixtures = {}): Fixtures => ({
	account: [a1],
	project: [p1],
	song: [s1],
	user: users,
	accountMember: members,
	projectMember: [dee],
	...over,
});

/** An inbox row of Bob's about s1, a minute old. */
const item = (id: string, over: Row = {}): Row => ({
	id,
	userId: "u2",
	accountId: "a1",
	kind: "comment",
	priority: "normal",
	title: `t${id}`,
	body: `b${id}`,
	href: "/go/song/s1",
	subjectId: "s1",
	count: 1,
	readAt: null,
	emailedAt: null,
	createdAt: at(NOW - MINUTE),
	updatedAt: at(NOW - MINUTE),
	...over,
});
const prefRow = (userId: string, over: Row = {}): Row => ({
	userId,
	...DEFAULT_PREFS,
	digestSentAt: null,
	smsNumber: null,
	smsEnabled: false,
	...over,
});
const stem = (id: string, sizeBytes: number, status = "ready") => ({
	id,
	accountId: "a1",
	songId: "s1",
	status,
	sizeBytes,
});

const inboxOf = (userId: string) => fake.rows("notification").filter((r) => r.userId === userId);
const notificationById = (id: string) => fake.rows("notification").find((r) => r.id === id);
const prefOf = (userId: string) =>
	fake.rows("notificationPreference").find((r) => r.userId === userId);
const emailsTo = () =>
	mail.sendNotificationEmail.mock.calls.map((c) => (c[0] as { to: string }).to);

let errors: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
beforeEach(() => {
	reset(base());
	mail.sendNotificationEmail.mockClear();
	mail.sendDigestEmail.mockClear();
	errors = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

describe("prefsOf", () => {
	test("a person without a row has the defaults, with no text number", async () => {
		expect(await prefsOf("u2")).toEqual({ ...DEFAULT_PREFS, smsNumber: null, smsEnabled: false });
	});
	test("a saved row answers its settings and the text hook, not the digest stamp", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u2", {
						emailComments: true,
						emailDemos: true,
						digest: "weekly",
						digestSentAt: at(NOW - DAY),
						smsNumber: "+15550100",
						smsEnabled: true,
					}),
				],
			}),
		);
		expect(await prefsOf("u2")).toEqual({
			emailComments: true,
			emailStems: false,
			emailSongs: false,
			emailDemos: true,
			digest: "weekly",
			smsNumber: "+15550100",
			smsEnabled: true,
		});
		expect(await prefsOf("u3")).toEqual({ ...DEFAULT_PREFS, smsNumber: null, smsEnabled: false });
	});
});

describe("savePrefs", () => {
	test("the first save inserts a row; the next updates it in place", async () => {
		await savePrefs("u2", { ...DEFAULT_PREFS, emailStems: true, digest: "daily" });
		expect(fake.rows("notificationPreference")).toEqual([
			expect.objectContaining({
				userId: "u2",
				emailStems: true,
				digest: "daily",
				digestSentAt: null,
			}),
		]);
		await savePrefs("u2", { ...DEFAULT_PREFS, emailSongs: true });
		expect(fake.rows("notificationPreference")).toEqual([
			expect.objectContaining({
				userId: "u2",
				emailStems: false,
				emailSongs: true,
				digest: "none",
			}),
		]);
		expect(await prefsOf("u2")).toMatchObject({ emailStems: false, emailSongs: true });
	});
	test("another person's row is untouched", async () => {
		reset(base({ notificationPreference: [prefRow("u3", { emailComments: true })] }));
		await savePrefs("u2", { ...DEFAULT_PREFS, emailDemos: true });
		expect(prefOf("u3")).toMatchObject({ emailComments: true, emailDemos: false });
		expect(prefOf("u2")).toMatchObject({ emailComments: false, emailDemos: true });
	});
});

describe("notifyComment", () => {
	test("everyone on the project but the author gets an inbox row, and nobody an email by default", async () => {
		await notifyComment("a1", "s1", "u1");
		expect(inboxOf("u1")).toEqual([]);
		for (const id of ["u2", "u3", "u4"]) {
			expect(inboxOf(id)).toEqual([
				expect.objectContaining({
					userId: id,
					accountId: "a1",
					kind: "comment",
					priority: "normal",
					title: "New comment on Intro",
					body: "Ann commented in Album.",
					href: "/go/song/s1",
					subjectId: "s1",
					count: 1,
					readAt: null,
					emailedAt: null,
				}),
			]);
		}
		expect(inboxOf("u5")).toEqual([]);
		expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
	});
	test("a song of another account, or none, notifies nobody", async () => {
		await notifyComment("a2", "s1", "u1");
		await notifyComment("a1", "s9", "u1");
		expect(fake.rows("notification")).toEqual([]);
		expect(callsTo("insert", "notification")).toEqual([]);
	});
	test("a restricted project reaches its owners, admins and own people, not a plain member", async () => {
		reset(base({ project: [{ ...p1, isRestricted: true }] }));
		await notifyComment("a1", "s1", "u1");
		expect(fake.rows("notification").map((r) => r.userId)).toEqual(["u3", "u4"]);
	});
	test("a member who is also on the project's list gets one row", async () => {
		reset(
			base({
				projectMember: [dee, { id: "pm2", projectId: "p1", userId: "u2", role: "editor" }],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		expect(inboxOf("u2")).toHaveLength(1);
	});
	test("a second comment within half an hour folds into the unread item", async () => {
		reset(
			base({
				notification: [
					item("n1", {
						title: "New comment on Intro",
						body: "Ann commented in Album.",
						updatedAt: at(NOW - 10 * MINUTE),
					}),
				],
			}),
		);
		await notifyComment("a1", "s1", "u3");
		expect(inboxOf("u2")).toEqual([
			expect.objectContaining({
				id: "n1",
				count: 2,
				title: "New comment on Intro",
				body: "2 new comments, the latest from Cy, in Album.",
				updatedAt: at(NOW),
			}),
		]);
		expect(inboxOf("u1")).toEqual([expect.objectContaining({ count: 1 })]);
		expect(inboxOf("u4")).toEqual([expect.objectContaining({ count: 1 })]);
	});
	test("a read item, one older than half an hour, or one about another song gets a fresh row", async () => {
		reset(
			base({
				notification: [
					item("n1", { readAt: at(NOW - 5 * MINUTE) }),
					item("n2", { updatedAt: at(NOW - 31 * MINUTE) }),
					item("n3", { subjectId: "s2" }),
				],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		const bobs = inboxOf("u2");
		expect(bobs).toHaveLength(4);
		expect(bobs.filter((r) => r.count !== 1)).toEqual([]);
		expect(bobs[3]).toMatchObject({ subjectId: "s1", body: "Ann commented in Album." });
	});
	test("an opt-in with no digest is emailed at once and the row stamped; the others wait", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u2", { emailComments: true }),
					prefRow("u3", { emailComments: true, digest: "daily" }),
					prefRow("u4", { emailStems: true }),
				],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		expect(mail.sendNotificationEmail).toHaveBeenCalledTimes(1);
		expect(mail.sendNotificationEmail).toHaveBeenCalledWith({
			to: "bob@example.com",
			name: "Bob",
			title: "New comment on Intro",
			body: "Ann commented in Album.",
			href: "/go/song/s1",
		});
		expect(inboxOf("u2")[0].emailedAt).toEqual(at(NOW));
		expect(inboxOf("u3")[0].emailedAt).toBeNull();
		expect(inboxOf("u4")[0].emailedAt).toBeNull();
	});
	test("a folded burst that was already emailed is not emailed again", async () => {
		reset(
			base({
				notification: [item("n1", { emailedAt: at(NOW - 9 * MINUTE) })],
				notificationPreference: [prefRow("u2", { emailComments: true })],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		expect(inboxOf("u2")).toEqual([
			expect.objectContaining({ id: "n1", count: 2, emailedAt: at(NOW - 9 * MINUTE) }),
		]);
		expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
	});
	test("a fold that was never emailed is emailed once the opt-in is on", async () => {
		reset(
			base({
				notification: [item("n1")],
				notificationPreference: [prefRow("u2", { emailComments: true })],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		expect(mail.sendNotificationEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "bob@example.com", title: "New comment on Intro" }),
		);
		expect(notificationById("n1")).toMatchObject({ count: 2, emailedAt: at(NOW) });
	});
	test("a failed email keeps the row and leaves it unstamped", async () => {
		reset(base({ notificationPreference: [prefRow("u2", { emailComments: true })] }));
		mail.sendNotificationEmail.mockRejectedValueOnce(new Error("resend down"));
		await notifyComment("a1", "s1", "u1");
		expect(inboxOf("u2")).toEqual([expect.objectContaining({ emailedAt: null })]);
		expect(errors).toHaveBeenCalledWith("[notifications] email", expect.any(Error));
		expect(inboxOf("u3")).toHaveLength(1);
	});
	test("a person with no user row gets the inbox row but no email", async () => {
		reset(
			base({
				user: users.filter((u) => u.id !== "u2"),
				notificationPreference: [prefRow("u2", { emailComments: true })],
			}),
		);
		await notifyComment("a1", "s1", "u1");
		expect(inboxOf("u2")).toEqual([expect.objectContaining({ emailedAt: null })]);
		expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
	});
	test('an author nobody knows is "Someone"', async () => {
		await notifyComment("a1", "s1", "u9");
		expect(inboxOf("u2")[0].body).toBe("Someone commented in Album.");
	});
});

describe("notifyStems", () => {
	test("one item per song, counting the batch; the uploader hears nothing", async () => {
		await notifyStems("a1", "s1", "u2");
		expect(inboxOf("u2")).toEqual([]);
		expect(inboxOf("u1")).toEqual([
			expect.objectContaining({
				kind: "stems",
				title: "New stems on Intro",
				body: "Bob uploaded a stem in Album.",
				href: "/go/song/s1",
				subjectId: "s1",
				count: 1,
			}),
		]);
		await notifyStems("a1", "s1", "u2");
		await notifyStems("a1", "s1", "u2");
		expect(inboxOf("u1")).toEqual([
			expect.objectContaining({ count: 3, body: "Bob uploaded 3 stems in Album." }),
		]);
		expect(inboxOf("u3")).toHaveLength(1);
		expect(inboxOf("u4")).toHaveLength(1);
	});
	test("an opt-in for stems is emailed; a comment opt-in is not", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u1", { emailStems: true }),
					prefRow("u3", { emailComments: true }),
				],
			}),
		);
		await notifyStems("a1", "s1", "u2");
		expect(emailsTo()).toEqual(["ann@example.com"]);
	});
	test("a song of another account notifies nobody", async () => {
		await notifyStems("a2", "s1", "u2");
		expect(fake.rows("notification")).toEqual([]);
	});
});

describe("notifyDemo", () => {
	const demo = { id: "d1", accountId: "a1", songId: "s1", label: "Phone memo" };
	test("names the demo once and counts them after; the subject is the song", async () => {
		reset(base({ demo: [demo] }));
		await notifyDemo("a1", "d1", "u1");
		expect(inboxOf("u1")).toEqual([]);
		expect(inboxOf("u2")).toEqual([
			expect.objectContaining({
				kind: "demo",
				title: "New demo on Intro",
				body: 'Ann added the demo "Phone memo" in Album.',
				href: "/go/song/s1",
				subjectId: "s1",
			}),
		]);
		await notifyDemo("a1", "d1", "u1");
		expect(inboxOf("u2")).toEqual([
			expect.objectContaining({ count: 2, body: "Ann added 2 demos in Album." }),
		]);
	});
	test("a demo opt-in is emailed at once", async () => {
		reset(base({ demo: [demo], notificationPreference: [prefRow("u4", { emailDemos: true })] }));
		await notifyDemo("a1", "d1", "u1");
		expect(emailsTo()).toEqual(["dee@example.com"]);
		expect(mail.sendNotificationEmail).toHaveBeenCalledWith(
			expect.objectContaining({ title: "New demo on Intro" }),
		);
	});
	test("a demo of another account, none, or one whose song is gone notifies nobody", async () => {
		reset(base({ demo: [demo, { ...demo, id: "d2", songId: "s9" }] }));
		await notifyDemo("a2", "d1", "u1");
		await notifyDemo("a1", "d9", "u1");
		await notifyDemo("a1", "d2", "u1");
		expect(fake.rows("notification")).toEqual([]);
	});
});

describe("notifySong", () => {
	test("a new song reaches the project, named after its creator, and never folds", async () => {
		await notifySong("a1", "s1", "u4");
		expect(inboxOf("u4")).toEqual([]);
		expect(inboxOf("u2")).toEqual([
			expect.objectContaining({
				kind: "song",
				title: "New song in Album",
				body: 'Dee created "Intro".',
				href: "/go/song/s1",
				subjectId: "s1",
				count: 1,
			}),
		]);
		await notifySong("a1", "s1", "u4");
		expect(inboxOf("u2").map((r) => r.count)).toEqual([1, 1]);
	});
	test("a song opt-in is emailed; one with a digest waits", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u1", { emailSongs: true }),
					prefRow("u2", { emailSongs: true, digest: "weekly" }),
				],
			}),
		);
		await notifySong("a1", "s1", "u4");
		expect(emailsTo()).toEqual(["ann@example.com"]);
	});
	test("an unknown song notifies nobody", async () => {
		await notifySong("a1", "s9", "u4");
		expect(fake.rows("notification")).toEqual([]);
	});
});

describe("notifyInvitationAccepted", () => {
	const account = { id: "a1", name: "Lightning Jar", slug: "lj" };
	const project = { id: "p1", name: "Album", slug: "album" };
	test("nobody hears when the invitation had no sender or the sender accepted it", async () => {
		await notifyInvitationAccepted({ invitedBy: null, account, project: null }, "u2");
		await notifyInvitationAccepted({ invitedBy: "u2", account, project: null }, "u2");
		expect(fake.rows("notification")).toEqual([]);
	});
	test("the sender of an account invitation hears, by email whatever their settings", async () => {
		await notifyInvitationAccepted({ invitedBy: "u1", account, project: null }, "u2");
		expect(fake.rows("notification")).toEqual([
			expect.objectContaining({
				userId: "u1",
				accountId: "a1",
				kind: "invitation-accepted",
				priority: "normal",
				title: "Bob accepted your invitation",
				body: "Bob joined Lightning Jar.",
				href: "/go/account/a1/settings",
				subjectId: null,
				emailedAt: at(NOW),
			}),
		]);
		expect(mail.sendNotificationEmail).toHaveBeenCalledWith({
			to: "ann@example.com",
			name: "Ann",
			title: "Bob accepted your invitation",
			body: "Bob joined Lightning Jar.",
			href: "/go/account/a1/settings",
		});
	});
	test("a project invitation names the project and leads to it", async () => {
		await notifyInvitationAccepted({ invitedBy: "u1", account, project }, "u4");
		expect(fake.rows("notification")).toEqual([
			expect.objectContaining({
				userId: "u1",
				body: "Dee joined Album (a project of Lightning Jar).",
				href: "/go/project/p1",
			}),
		]);
	});
	test('an accepter nobody knows is "Someone"', async () => {
		await notifyInvitationAccepted({ invitedBy: "u1", account, project: null }, "u9");
		expect(fake.rows("notification")[0].title).toBe("Someone accepted your invitation");
	});
});

describe("checkStorage", () => {
	const limited = { ...a1, storageLimitBytes: 10 * MB };
	test("under 80 % nothing happens, and failed uploads do not count", async () => {
		reset(base({ account: [limited], stem: [stem("t1", 7 * MB), stem("t2", 5 * MB, "failed")] }));
		await checkStorage("a1");
		expect(fake.rows("notification")).toEqual([]);
		expect(mail.sendNotificationEmail).not.toHaveBeenCalled();
	});
	test("at 80 % the owners and admins are warned, by email whatever their settings", async () => {
		reset(
			base({
				account: [limited],
				stem: [stem("t1", 8 * MB)],
				notificationPreference: [prefRow("u1", { smsEnabled: true, smsNumber: "+15550100" })],
			}),
		);
		await checkStorage("a1");
		expect(inboxOf("u2")).toEqual([]);
		for (const id of ["u1", "u3"]) {
			expect(inboxOf(id)).toEqual([
				expect.objectContaining({
					accountId: "a1",
					kind: "storage-limit",
					priority: "high",
					title: "Lightning Jar is at 80% of its storage",
					body: "8.0 MB of 10.0 MB used. Uploads stop at the limit; remove files you no longer need, or ask about more storage.",
					href: "/go/account/a1/settings",
					subjectId: "80",
					emailedAt: at(NOW),
				}),
			]);
		}
		expect(emailsTo().sort()).toEqual(["ann@example.com", "cy@example.com"]);
	});
	test("95 % and 100 % have their own words", async () => {
		reset(base({ account: [limited], stem: [stem("t1", 9.5 * MB)] }));
		await checkStorage("a1");
		expect(inboxOf("u1")).toEqual([
			expect.objectContaining({
				title: "Lightning Jar is at 95% of its storage",
				body: expect.stringMatching(/^9\.5 MB of 10\.0 MB used\. Uploads stop/),
				subjectId: "95",
			}),
		]);
		reset(base({ account: [limited], stem: [stem("t1", 10 * MB)] }));
		await checkStorage("a1");
		expect(inboxOf("u1")).toEqual([
			expect.objectContaining({
				title: "Lightning Jar is out of storage",
				body: "10.0 MB of 10.0 MB used. Uploads are refused until files are removed.",
				subjectId: "100",
			}),
		]);
	});
	test("a threshold warned about within the week is not repeated; a higher one is new", async () => {
		const warned = item("n1", {
			userId: "u1",
			kind: "storage-limit",
			subjectId: "80",
			createdAt: at(NOW - 6 * DAY),
		});
		reset(base({ account: [limited], stem: [stem("t1", 8 * MB)], notification: [warned] }));
		await checkStorage("a1");
		expect(fake.rows("notification")).toHaveLength(1);
		expect(mail.sendNotificationEmail).not.toHaveBeenCalled();

		reset(base({ account: [limited], stem: [stem("t1", 9.5 * MB)], notification: [warned] }));
		await checkStorage("a1");
		expect(fake.rows("notification").map((r) => r.subjectId)).toEqual(["80", "95", "95"]);
	});
	test("after a week the warning goes again", async () => {
		reset(
			base({
				account: [limited],
				stem: [stem("t1", 8 * MB)],
				notification: [
					item("n1", {
						userId: "u1",
						kind: "storage-limit",
						subjectId: "80",
						createdAt: at(NOW - 8 * DAY),
					}),
				],
			}),
		);
		await checkStorage("a1");
		expect(fake.rows("notification")).toHaveLength(3);
	});
	test("a founder account has no limit; an unknown account is nothing", async () => {
		reset(base({ account: [{ ...limited, isFounder: true }], stem: [stem("t1", 10 * MB)] }));
		await checkStorage("a1");
		await checkStorage("a9");
		expect(fake.rows("notification")).toEqual([]);
	});
});

describe("checkSeats", () => {
	const more = [
		{ id: "m4", accountId: "a1", userId: "u6", role: "member" },
		{ id: "m5", accountId: "a1", userId: "u7", role: "member" },
		{ id: "m6", accountId: "a1", userId: "u8", role: "member" },
	];
	test("with a seat free nothing happens", async () => {
		await checkSeats("a1");
		expect(fake.rows("notification")).toEqual([]);
	});
	test("when every seat of the plan is taken, the owners and admins hear at once", async () => {
		reset(base({ accountMember: [...members, ...more] }));
		await checkSeats("a1");
		expect(inboxOf("u2")).toEqual([]);
		for (const id of ["u1", "u3"]) {
			expect(inboxOf(id)).toEqual([
				expect.objectContaining({
					accountId: "a1",
					kind: "seats-full",
					priority: "high",
					title: "Every seat on Lightning Jar is taken",
					body: "6 of 6 seats are in use. Invitations pause until a member leaves, or ask about more seats.",
					href: "/go/account/a1/settings",
					subjectId: "full",
					emailedAt: at(NOW),
				}),
			]);
		}
		expect(emailsTo().sort()).toEqual(["ann@example.com", "cy@example.com"]);
	});
	test("the warning is not repeated within a week", async () => {
		reset(
			base({
				accountMember: [...members, ...more],
				notification: [
					item("n1", {
						userId: "u1",
						kind: "seats-full",
						subjectId: "full",
						createdAt: at(NOW - DAY),
					}),
				],
			}),
		);
		await checkSeats("a1");
		expect(fake.rows("notification")).toHaveLength(1);
	});
	test("a founder account has no seat limit", async () => {
		reset(base({ account: [{ ...a1, isFounder: true }], accountMember: [...members, ...more] }));
		await checkSeats("a1");
		expect(fake.rows("notification")).toEqual([]);
	});
});

describe("the inbox", () => {
	beforeEach(() =>
		reset(
			base({
				notification: [
					item("n1", { updatedAt: at(NOW - 3 * MINUTE) }),
					item("n2", { updatedAt: at(NOW - MINUTE), kind: "stems" }),
					item("n3", { updatedAt: at(NOW - 2 * MINUTE), readAt: at(NOW - HOUR) }),
					item("n4", { userId: "u3" }),
				],
			}),
		),
	);
	test("unreadCount counts the person's unread items only", async () => {
		expect(await unreadCount("u2")).toBe(2);
		expect(await unreadCount("u3")).toBe(1);
		expect(await unreadCount("u9")).toBe(0);
	});
	test("listInbox answers the person's items newest first, with the columns the page shows", async () => {
		expect(await listInbox("u2")).toEqual([
			{
				id: "n2",
				kind: "stems",
				priority: "normal",
				title: "tn2",
				body: "bn2",
				href: "/go/song/s1",
				count: 1,
				readAt: null,
				updatedAt: at(NOW - MINUTE),
			},
			expect.objectContaining({ id: "n3", readAt: at(NOW - HOUR) }),
			expect.objectContaining({ id: "n1" }),
		]);
		expect(await listInbox("u9")).toEqual([]);
	});
	test("listInbox stops at a hundred", async () => {
		reset(
			base({
				notification: Array.from({ length: 101 }, (_, i) =>
					item(`n${i}`, { updatedAt: at(NOW - i * MINUTE) }),
				),
			}),
		);
		const rows = await listInbox("u2");
		expect(rows).toHaveLength(100);
		expect(rows[0].id).toBe("n0");
		expect(rows[99].id).toBe("n99");
	});
	test("markRead marks the owner's unread item and nothing else", async () => {
		await markRead("u2", "n1");
		expect(notificationById("n1")?.readAt).toEqual(at(NOW));
		await markRead("u3", "n2");
		expect(notificationById("n2")?.readAt).toBeNull();
		await markRead("u2", "n3");
		expect(notificationById("n3")?.readAt).toEqual(at(NOW - HOUR));
		expect(notificationById("n4")?.readAt).toBeNull();
	});
	test("markAllRead marks the person's unread items, keeping earlier read stamps", async () => {
		await markAllRead("u2");
		expect(fake.rows("notification").map((r) => [r.id, r.readAt])).toEqual([
			["n1", at(NOW)],
			["n2", at(NOW)],
			["n3", at(NOW - HOUR)],
			["n4", null],
		]);
	});
});

describe("sendDigests", () => {
	const now = at(NOW);
	test("a due daily and a due weekly digest each send one email, stamp the items and the person", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u2", { emailComments: true, digest: "daily" }),
					prefRow("u3", { emailStems: true, digest: "weekly", digestSentAt: at(NOW - 7 * DAY) }),
				],
				notification: [
					item("n1", { updatedAt: at(NOW - 2 * HOUR), readAt: at(NOW - HOUR) }),
					item("n2", { updatedAt: at(NOW - HOUR) }),
					item("n3", { userId: "u3", kind: "stems" }),
					item("n4", { kind: "stems" }),
					item("n5", { emailedAt: at(NOW - DAY) }),
					item("n6", { userId: "u1" }),
				],
			}),
		);
		expect(await sendDigests(now)).toEqual({ sent: 2 });
		expect(mail.sendDigestEmail).toHaveBeenCalledTimes(2);
		expect(mail.sendDigestEmail).toHaveBeenNthCalledWith(1, {
			to: "bob@example.com",
			name: "Bob",
			period: "daily",
			items: [
				{ id: "n2", title: "tn2", body: "bn2", href: "/go/song/s1" },
				{ id: "n1", title: "tn1", body: "bn1", href: "/go/song/s1" },
			],
		});
		expect(mail.sendDigestEmail).toHaveBeenNthCalledWith(2, {
			to: "cy@example.com",
			name: "Cy",
			period: "weekly",
			items: [{ id: "n3", title: "tn3", body: "bn3", href: "/go/song/s1" }],
		});
		expect(fake.rows("notification").map((r) => [r.id, r.emailedAt])).toEqual([
			["n1", now],
			["n2", now],
			["n3", now],
			["n4", null],
			["n5", at(NOW - DAY)],
			["n6", null],
		]);
		expect(prefOf("u2")?.digestSentAt).toEqual(now);
		expect(prefOf("u3")?.digestSentAt).toEqual(now);
	});
	test("a digest that is not yet due is skipped; one that is just due goes", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u2", {
						emailComments: true,
						digest: "daily",
						digestSentAt: at(NOW - 12 * HOUR),
					}),
					prefRow("u3", { emailComments: true, digest: "weekly", digestSentAt: at(NOW - 3 * DAY) }),
				],
				notification: [item("n1"), item("n2", { userId: "u3" })],
			}),
		);
		expect(await sendDigests(now)).toEqual({ sent: 0 });
		expect(mail.sendDigestEmail).not.toHaveBeenCalled();
		expect(fake.rows("notification").map((r) => r.emailedAt)).toEqual([null, null]);

		reset(
			base({
				notificationPreference: [
					prefRow("u2", {
						emailComments: true,
						digest: "daily",
						digestSentAt: at(NOW - 23 * HOUR),
					}),
					prefRow("u3", {
						emailComments: true,
						digest: "weekly",
						digestSentAt: at(NOW - 6.5 * DAY),
					}),
				],
				notification: [item("n1"), item("n2", { userId: "u3" })],
			}),
		);
		expect(await sendDigests(now)).toEqual({ sent: 2 });
	});
	test("a person with no opt-ins, no digest, or nothing pending gets no email and no stamp", async () => {
		reset(
			base({
				notificationPreference: [
					prefRow("u2", { digest: "daily" }),
					prefRow("u3", { emailComments: true, digest: "none" }),
					prefRow("u4", { emailComments: true, digest: "daily" }),
				],
				notification: [
					item("n1"),
					item("n2", { userId: "u3" }),
					item("n3", { userId: "u4", kind: "song" }),
				],
			}),
		);
		expect(await sendDigests(now)).toEqual({ sent: 0 });
		expect(mail.sendDigestEmail).not.toHaveBeenCalled();
		expect(fake.rows("notification").map((r) => r.emailedAt)).toEqual([null, null, null]);
		expect(fake.rows("notificationPreference").map((r) => r.digestSentAt)).toEqual([
			null,
			null,
			null,
		]);
	});
	test("a failed send leaves the items and the stamp for next time", async () => {
		reset(
			base({
				notificationPreference: [prefRow("u2", { emailComments: true, digest: "daily" })],
				notification: [item("n1")],
			}),
		);
		mail.sendDigestEmail.mockRejectedValueOnce(new Error("resend down"));
		expect(await sendDigests(now)).toEqual({ sent: 0 });
		expect(notificationById("n1")?.emailedAt).toBeNull();
		expect(prefOf("u2")?.digestSentAt).toBeNull();
		expect(errors).toHaveBeenCalledWith("[notifications] digest", expect.any(Error));
	});
	test("a digest carries at most fifty items; the oldest wait for the next", async () => {
		reset(
			base({
				notificationPreference: [prefRow("u2", { emailComments: true, digest: "daily" })],
				notification: Array.from({ length: 52 }, (_, i) =>
					item(`n${i + 1}`, { updatedAt: at(NOW - (i + 1) * MINUTE) }),
				),
			}),
		);
		expect(await sendDigests(now)).toEqual({ sent: 1 });
		const sent = (mail.sendDigestEmail.mock.calls[0][0] as { items: { id: string }[] }).items;
		expect(sent).toHaveLength(50);
		expect(sent[0].id).toBe("n1");
		expect(
			fake
				.rows("notification")
				.filter((r) => r.emailedAt === null)
				.map((r) => r.id),
		).toEqual(["n51", "n52"]);
	});
	test("the clock defaults to now", async () => {
		reset(
			base({
				notificationPreference: [prefRow("u2", { emailComments: true, digest: "daily" })],
				notification: [item("n1")],
			}),
		);
		expect(await sendDigests()).toEqual({ sent: 1 });
		expect(prefOf("u2")?.digestSentAt).toEqual(at(NOW));
	});
});
