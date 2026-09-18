import { expect, test } from "vite-plus/test";
import { libsqlUrl } from "./libsqlUrl";

test("turso:// becomes libsql://, everything else is untouched", () => {
	expect(libsqlUrl("turso://db-org.aws-us-east-1.turso.io")).toBe(
		"libsql://db-org.aws-us-east-1.turso.io",
	);
	expect(libsqlUrl("libsql://db-org.turso.io")).toBe("libsql://db-org.turso.io");
	expect(libsqlUrl("file:local.db")).toBe("file:local.db");
});
