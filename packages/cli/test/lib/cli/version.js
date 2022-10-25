import test from "ava";
import {setVersion, getVersion} from "../../../lib/cli/version.js";

test("Set and get version", (t) => {
	t.is(getVersion(), undefined);

	setVersion("1.2.3");
	t.is(getVersion(), "1.2.3");

	setVersion("4.5.6-foo.bar");
	t.is(getVersion(), "4.5.6-foo.bar");
});
