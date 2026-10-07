import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	USER,
	asSignedOut,
	asUser,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { notifications, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the inbox: everything is the signed-in caller's own, keyed by their user id. */
const inbox = await import("./notifications.remote");

const NOTE = fakeId("note-one");

beforeEach(resetRemoteMocks);

const cases = [
	{
		name: "markNotificationRead",
		fn: inbox.markNotificationRead,
		input: { id: NOTE },
		fnName: "markRead",
		args: [USER, NOTE],
		outcome: { read: true },
	},
	{
		name: "markAllNotificationsRead",
		fn: inbox.markAllNotificationsRead,
		input: {},
		fnName: "markAllRead",
		args: [USER],
		outcome: { read: true },
	},
	{
		name: "saveNotificationPreferences",
		fn: inbox.saveNotificationPreferences,
		input: { emailComments: true },
		fnName: "savePrefs",
		args: [
			USER,
			{
				emailComments: true,
				emailStems: false,
				emailSongs: false,
				emailDemos: false,
				digest: "none",
			},
		],
		outcome: { saved: true },
	},
];

for (const c of cases) {
	describe(c.name, () => {
		it("401 signed out", async () => {
			asSignedOut();
			await expect(call(c.fn, c.input)).rejects.toMatchObject(httpError(401));
			expect(notifications[c.fnName]).not.toHaveBeenCalled();
		});
		it("acts on the caller's own inbox", async () => {
			asUser();
			await expect(call(c.fn, c.input)).resolves.toEqual(c.outcome);
			expect(notifications[c.fnName]).toHaveBeenCalledWith(...c.args);
		});
	});
}
