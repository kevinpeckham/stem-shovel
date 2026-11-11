import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import { httpError } from "../../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../../tests/helpers/fakeServerModules";

/** A share link's own address: the code's page, now, with the code attached; a code nobody made is a 404. */
const { load } = await import("./+page.server");

const run = (code: string) => load({ params: { code } } as never);

beforeEach(() => resetRemoteMocks());

describe("/s/[code]", () => {
	it("sends a demo's code to the demo's page with the code attached", async () => {
		data.shareLinkTarget.mockResolvedValue("/acct/projects/lp/clocks/demos/demo1");
		await expect(run("ABCD2345")).rejects.toMatchObject({
			status: 307,
			location: "/acct/projects/lp/clocks/demos/demo1?share=ABCD2345",
		});
		expect(data.shareLinkTarget).toHaveBeenCalledWith("ABCD2345");
	});

	it("404 for a code nobody made", async () => {
		data.shareLinkTarget.mockResolvedValue(null);
		await expect(run("NOPE")).rejects.toMatchObject(httpError(404));
	});
});
