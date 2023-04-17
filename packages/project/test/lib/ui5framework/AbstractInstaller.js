import test from "ava";
import AbstractInstaller from "../../../lib/ui5Framework/AbstractInstaller.js";

test("AbstractInstaller: constructor throws an error", (t) => {
	t.throws(() => {
		new AbstractInstaller();
	}, {
		instanceOf: TypeError,
		message: "Class 'AbstractInstaller' is abstract"
	});
});
