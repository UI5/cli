import test from "ava";

import FileSystem from "../../../lib/adapters/FileSystem.js";

test.serial("Missing parameter: fsBasePath", (t) => {
	t.throws(() => {
		new FileSystem({
			virBasePath: "/"
		});
	}, {
		message: "Unable to create adapter: Missing parameter 'fsBasePath'"
	}, "Threw with expected error message");
});
