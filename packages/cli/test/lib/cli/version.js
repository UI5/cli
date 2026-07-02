import test from "ava";
import {setVersion, getVersion, getVersionWithLocation} from "../../../lib/cli/version.js";

test("Set and get version", (t) => {
	t.is(getVersion(), undefined);
	t.is(getVersionWithLocation(), undefined);

	setVersion("1.2.3", "/path/to/ui5.cjs");
	t.is(getVersion(), "1.2.3");
	t.is(getVersionWithLocation(), "1.2.3 (from /path/to/ui5.cjs)");

	setVersion("4.5.6-foo.bar", "/another/path/ui5.cjs");
	t.is(getVersion(), "4.5.6-foo.bar");
	t.is(getVersionWithLocation(), "4.5.6-foo.bar (from /another/path/ui5.cjs)");

	setVersion("7.8.9");
	t.is(getVersion(), "7.8.9");
	t.is(getVersionWithLocation(), "7.8.9");
});
