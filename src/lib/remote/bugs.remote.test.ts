import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asOwnerOf,
	asSignedOut,
	asSystemAdmin,
	asUser,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, rateLimited, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of bug reports and feature requests: any signed-in user reports and votes; the operator manages. */
const bugs = await import("./bugs.remote");

const REPORT = fakeId("report-one");

beforeEach(resetRemoteMocks);

describe("reportBug", () => {
	const input = { kind: "feature", title: "Loop export", body: "Please export loops as WAV." };
	beforeEach(() =>
		data.createBugReport.mockResolvedValue({
			kind: "feature",
			title: "Loop export",
			body: "",
			flags: null,
		}),
	);
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(bugs.reportBug, input)).rejects.toMatchObject(httpError(401));
	});
	it("a signed-in user in no account files it as themselves", async () => {
		asUser();
		await expect(call(bugs.reportBug, input)).resolves.toEqual({ sent: true });
		expect(data.createBugReport).toHaveBeenCalledWith(
			USER,
			expect.objectContaining({ title: "Loop export" }),
		);
	});
	it("429 once the limiter says so", async () => {
		asUser();
		rateLimited.mockResolvedValue(true);
		await expect(call(bugs.reportBug, input)).rejects.toMatchObject(httpError(429));
		expect(data.createBugReport).not.toHaveBeenCalled();
	});
});

describe("voteOnBug", () => {
	const input = { id: REPORT, vote: "up" };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(bugs.voteOnBug, input)).rejects.toMatchObject(httpError(401));
	});
	it("a signed-in user votes as themselves", async () => {
		asUser();
		data.voteOnBugReport.mockResolvedValue({ up: 1, down: 0 });
		await expect(call(bugs.voteOnBug, input)).resolves.toEqual({ up: 1, down: 0 });
		expect(data.voteOnBugReport).toHaveBeenCalledWith(REPORT, USER, "up");
	});
});

describe("the operator's functions", () => {
	const cases = [
		{
			name: "approveBug",
			fn: bugs.approveBug,
			input: { id: REPORT, approved: "true" },
			dataFn: "setBugReportApproval",
			result: true,
			args: [REPORT, true],
			outcome: { approved: true },
		},
		{
			name: "setBugStatus",
			fn: bugs.setBugStatus,
			input: { id: REPORT, status: "closed" },
			dataFn: "setBugReportStatus",
			result: { kind: "bug", contactEmail: null },
			args: [REPORT, "closed"],
			outcome: { status: "closed" },
		},
		{
			name: "setBugPriority",
			fn: bugs.setBugPriority,
			input: { id: REPORT, priority: "high" },
			dataFn: "setBugReportPriority",
			result: true,
			args: [REPORT, "high"],
			outcome: { priority: "high" },
		},
		{
			name: "respondToBug",
			fn: bugs.respondToBug,
			input: { id: REPORT, response: "" },
			dataFn: "respondToBugReport",
			result: { kind: "bug", contactEmail: null, reporter: null },
			args: [REPORT, ""],
			outcome: { responded: false },
		},
		{
			name: "deleteBug",
			fn: bugs.deleteBug,
			input: { id: REPORT },
			dataFn: "deleteBugReport",
			result: true,
			args: [REPORT],
			outcome: { deleted: true },
		},
	];
	for (const c of cases) {
		const run = () => {
			data[c.dataFn].mockResolvedValue(c.result);
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it("404 signed out", async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a signed-in user, an account owner included", async () => {
				asOwnerOf(ACCOUNT);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("the system admin does it", async () => {
				asSystemAdmin();
				await expect(run()).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});
