import test from "ava";
import esmock from "esmock";
import sinon from "sinon";

import escapePropertiesFileReal from "../../../../lib/lbt/utils/escapePropertiesFile.js";

const BOM = "\uFEFF";

// Creates an lbtResource whose inner (@ui5/fs) resource keeps its content in a mutable buffer,
// so that the real nonAsciiEscaper can read and write it just like in a real build.
function createStatefulResource(initialContent, {encoding = "utf8", propertiesFileSourceEncoding = "UTF-8"} = {}) {
	let buffer = Buffer.from(initialContent, encoding);
	const innerResource = {
		getBuffer: async () => buffer,
		setString: (str) => {
			buffer = Buffer.from(str, encoding);
		}
	};
	return {
		getProject: () => ({
			getPropertiesFileSourceEncoding: () => propertiesFileSourceEncoding
		}),
		resource: innerResource,
		buffer: async () => buffer
	};
}


test.beforeEach(async (t) => {
	// Spying logger of processors/bootstrapHtmlTransformer
	t.context.getEncodingFromAliasStub = sinon.stub().returns("node encoding name");
	t.context.nonAsciiEscaperStub = sinon.stub().resolves();
	t.context.nonAsciiEscaperStub.getEncodingFromAlias = t.context.getEncodingFromAliasStub;

	t.context.escapePropertiesFile = await esmock("../../../../lib/lbt/utils/escapePropertiesFile", {
		"../../../../lib/processors/nonAsciiEscaper": t.context.nonAsciiEscaperStub
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("propertiesFileSourceEncoding UTF-8", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getPropertiesFileSourceEncoding: () => "UTF-8"
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "UTF-8",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});


test.serial("propertiesFileSourceEncoding ISO-8859-1", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getPropertiesFileSourceEncoding: () => "ISO-8859-1"
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "ISO-8859-1",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});

test.serial("propertiesFileSourceEncoding not set", async (t) => {
	const lbtResource = {
		getProject: () => {
			return undefined;
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "UTF-8",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});

// Note: escapePropertiesFile delegates the actual escaping (and BOM stripping) to nonAsciiEscaper.
// The following tests are integration tests that verify the delegation and the project-based
// encoding selection end-to-end. The authoritative unit coverage for BOM handling lives in
// test/lib/processors/nonAsciiEscaper.js.
test.serial("UTF-8 BOM is stripped and does not corrupt the first key", async (t) => {
	const resource = createStatefulResource(BOM + "TITLE=Hello World\nKEY2=Value\n");

	const res = await escapePropertiesFileReal(resource);

	t.false(res.startsWith(BOM), "result does not start with a BOM character");
	t.false(res.startsWith("\\uFEFF"), "result does not start with an escaped BOM sequence");
	t.true(res.startsWith("TITLE="), "first key is intact");
	t.is(res, "TITLE=Hello World\nKEY2=Value\n", "content equals the input without the BOM");
});

test.serial("UTF-8 BOM is stripped while non-ASCII characters are still escaped", async (t) => {
	const resource = createStatefulResource(BOM + "TITLE=Héllo\n");

	const res = await escapePropertiesFileReal(resource);

	t.false(res.startsWith("\\uFEFF"), "result does not start with an escaped BOM sequence");
	t.is(res, "TITLE=H\\u00e9llo\n", "BOM removed, non-ASCII character still escaped");
});

test.serial("Content without BOM is left unchanged", async (t) => {
	const resource = createStatefulResource("TITLE=Hello\n");

	const res = await escapePropertiesFileReal(resource);

	t.is(res, "TITLE=Hello\n", "content without BOM is unchanged");
});

test.serial("ISO-8859-1 file: UTF-8 BOM bytes are not treated as a BOM", async (t) => {
	// A file declared as ISO-8859-1 that happens to start with the UTF-8 BOM bytes (EF BB BF)
	// decodes to the three latin1 characters "ï»¿" (U+00EF U+00BB U+00BF), not U+FEFF. stripBOM
	// must therefore NOT strip anything here, so the bytes are preserved and escaped as-is. This
	// locks the invariant documented in nonAsciiEscaper.js that a latin1-decoded BOM is left intact.
	const resource = createStatefulResource("ï»¿KEY=val\n", {
		encoding: "latin1",
		propertiesFileSourceEncoding: "ISO-8859-1"
	});

	const res = await escapePropertiesFileReal(resource);

	t.is(res, "\\u00ef\\u00bb\\u00bfKEY=val\n",
		"UTF-8 BOM bytes decoded as latin1 are preserved and escaped, not stripped");
});

test.serial("propertiesFileSourceEncoding not set - specVersion 0.1", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getSpecVersion: () => {
					return {
						toString: () => "0.1",
						lte: () => true,
					};
				},
				getPropertiesFileSourceEncoding: () => ""
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "ISO-8859-1",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});

test.serial("propertiesFileSourceEncoding not set - specVersion 1.0", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getSpecVersion: () => {
					return {
						toString: () => "1.0",
						lte: () => true,
					};
				},
				getPropertiesFileSourceEncoding: () => ""
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "ISO-8859-1",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});

test.serial("propertiesFileSourceEncoding not set - specVersion 1.1", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getSpecVersion: () => {
					return {
						toString: () => "1.1",
						lte: () => true,
					};
				},
				getPropertiesFileSourceEncoding: () => ""
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "ISO-8859-1",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});

test.serial("propertiesFileSourceEncoding not set - specVersion 2.0", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getSpecVersion: () => {
					return {
						toString: () => "2.0",
						lte: () => false,
					};
				},
				getPropertiesFileSourceEncoding: () => ""
			};
		},
		resource: "actual resource",
		buffer: async () => {
			return "resource content";
		}
	};
	const res = await t.context.escapePropertiesFile(lbtResource);
	t.is(t.context.getEncodingFromAliasStub.callCount, 1, "getEncodingFromAlias got called once");
	t.is(t.context.getEncodingFromAliasStub.getCall(0).args[0], "UTF-8",
		"getEncodingFromAlias got called with excepted argument");
	t.is(t.context.nonAsciiEscaperStub.callCount, 1, "nonAsciiEscaper got called once");
	t.deepEqual(t.context.nonAsciiEscaperStub.getCall(0).args[0], {
		resources: ["actual resource"],
		options: {
			encoding: "node encoding name"
		}
	}, "getEncodingFromAlias got called with excepted argument");
	t.is(res, "resource content", "Correct result");
});
