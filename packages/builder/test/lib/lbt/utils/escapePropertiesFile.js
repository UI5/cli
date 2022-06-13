const test = require("ava");
const mock = require("mock-require");
const sinon = require("sinon");


test.beforeEach((t) => {
	// Spying logger of processors/bootstrapHtmlTransformer
	t.context.getEncodingFromAliasStub = sinon.stub().returns("node encoding name");
	t.context.nonAsciiEscaperStub = sinon.stub().resolves();
	t.context.nonAsciiEscaperStub.getEncodingFromAlias = t.context.getEncodingFromAliasStub;
	mock("../../../../lib/processors/nonAsciiEscaper", t.context.nonAsciiEscaperStub);
	t.context.escapePropertiesFile = mock.reRequire("../../../../lib/lbt/utils/escapePropertiesFile");
});

test.afterEach.always((t) => {
	sinon.restore();
	mock.stopAll();
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

test.serial("propertiesFileSourceEncoding not set - specVersion 0.1", async (t) => {
	const lbtResource = {
		getProject: () => {
			return {
				getSpecVersion: () => "0.1",
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
				getSpecVersion: () => "1.0",
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
				getSpecVersion: () => "1.1",
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
				getSpecVersion: () => "2.0",
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
