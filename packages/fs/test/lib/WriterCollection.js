const test = require("ava");
const sinon = require("sinon");
const WriterCollection = require("../../lib/WriterCollection");
const Resource = require("../../lib/Resource");

test("Constructor: Path mapping regex", async (t) => {
	const myWriter = {};
	const writer = new WriterCollection({
		name: "myCollection",
		writerMapping: {
			"/": myWriter,
			"/my/path/": myWriter,
			"/my/": myWriter,
		}
	});
	t.is(writer._basePathRegex.toString(), "^((?:/)??(?:/my/)??(?:/my/path/)??)+.*?$",
		"Created correct path mapping regular expression");
});

test("Constructor: Path mapping regex has correct escaping", async (t) => {
	const myWriter = {};
	const writer = new WriterCollection({
		name: "myCollection",
		writerMapping: {
			"/My\\Weird.Path/": myWriter,
			"/my/pa$h/": myWriter,
			"/my/": myWriter,
		}
	});
	t.is(writer._basePathRegex.toString(), "^((?:/My\\\\Weird\\.Path/)??(?:/my/)??(?:/my/pa\\$h/)??)+.*?$",
		"Created correct path mapping regular expression");
});

test("Constructor: Throws for missing path mapping", async (t) => {
	const err = t.throws(() => {
		new WriterCollection({
			name: "myCollection"
		});
	});
	t.is(err.message, "Missing parameter 'writerMapping'", "Threw with expected error message");
});

test("Constructor: Throws for empty path mapping", async (t) => {
	const err = t.throws(() => {
		new WriterCollection({
			name: "myCollection",
			writerMapping: {}
		});
	});
	t.is(err.message, "Empty parameter 'writerMapping'", "Threw with expected error message");
});

test("Constructor: Throws for empty path", async (t) => {
	const myWriter = {
		_write: sinon.stub()
	};
	const err = t.throws(() => {
		new WriterCollection({
			name: "myCollection",
			writerMapping: {
				"": myWriter
			}
		});
	});
	t.is(err.message, "Empty path in path mapping of WriterCollection myCollection",
		"Threw with expected error message");
});

test("Constructor: Throws for missing leading slash", async (t) => {
	const myWriter = {
		_write: sinon.stub()
	};
	const err = t.throws(() => {
		new WriterCollection({
			name: "myCollection",
			writerMapping: {
				"my/path/": myWriter
			}
		});
	});
	t.is(err.message, "Missing leading slash in path mapping 'my/path/' of WriterCollection myCollection",
		"Threw with expected error message");
});

test("Constructor: Throws for missing trailing slash", async (t) => {
	const myWriter = {
		_write: sinon.stub()
	};
	const err = t.throws(() => {
		new WriterCollection({
			name: "myCollection",
			writerMapping: {
				"/my/path": myWriter
			}
		});
	});
	t.is(err.message, "Missing trailing slash in path mapping '/my/path' of WriterCollection myCollection",
		"Threw with expected error message");
});

test("Write", async (t) => {
	const myPathWriter = {
		_write: sinon.stub()
	};
	const myWriter = {
		_write: sinon.stub()
	};
	const generalWriter = {
		_write: sinon.stub()
	};
	const writerCollection = new WriterCollection({
		name: "myCollection",
		writerMapping: {
			"/my/path/": myPathWriter,
			"/my/": myWriter,
			"/": generalWriter
		}
	});

	const myPathResource = new Resource({
		path: "/my/path/resource.res",
		string: "content"
	});
	const myResource = new Resource({
		path: "/my/resource.res",
		string: "content"
	});
	const resource = new Resource({
		path: "/resource.res",
		string: "content"
	});

	await writerCollection.write(myPathResource, "options 1");
	await writerCollection.write(myResource, "options 2");
	await writerCollection.write(resource, "options 3");

	t.is(myPathWriter._write.callCount, 1, "One write to /my/path/ writer");
	t.is(myWriter._write.callCount, 1, "One write to /my/ writer");
	t.is(generalWriter._write.callCount, 1, "One write to / writer");

	t.is(myPathWriter._write.getCall(0).args[0], myPathResource, "Correct resource for /my/path/ writer");
	t.is(myPathWriter._write.getCall(0).args[1], "options 1", "Correct write options for /my/path/ writer");
	t.is(myWriter._write.getCall(0).args[0], myResource, "Correct resource for /my/ writer");
	t.is(myWriter._write.getCall(0).args[1], "options 2", "Correct write options for /my/ writer");
	t.is(generalWriter._write.getCall(0).args[0], resource, "Correct resource for / writer");
	t.is(generalWriter._write.getCall(0).args[1], "options 3", "Correct write options for / writer");
});

test("byGlob", async (t) => {
	const myPathWriter = {
		_byGlob: sinon.stub().resolves([])
	};
	const myWriter = {
		_byGlob: sinon.stub().resolves([])
	};
	const generalWriter = {
		_byGlob: sinon.stub().resolves([])
	};
	const writerCollection = new WriterCollection({
		name: "myCollection",
		writerMapping: {
			"/my/path/": myPathWriter,
			"/my/": myWriter,
			"/": generalWriter
		}
	});

	await writerCollection.byGlob("/**");

	t.is(myPathWriter._byGlob.callCount, 1, "One _byGlob call to /my/path/ writer");
	t.is(myWriter._byGlob.callCount, 1, "One _byGlob call to /my/ writer");
	t.is(generalWriter._byGlob.callCount, 1, "One _byGlob call to / writer");

	t.is(myPathWriter._byGlob.getCall(0).args[0], "/**", "Correct glob pattern passed to /my/path/ writer");
	t.is(myWriter._byGlob.getCall(0).args[0], "/**", "Correct glob pattern passed to /my/ writer");
	t.is(generalWriter._byGlob.getCall(0).args[0], "/**", "Correct glob pattern passed to / writer");
});

test("byPath", async (t) => {
	const myPathWriter = {
		_byPath: sinon.stub().resolves(null)
	};
	const myWriter = {
		_byPath: sinon.stub().resolves(null)
	};
	const generalWriter = {
		_byPath: sinon.stub().resolves(null)
	};
	const writerCollection = new WriterCollection({
		name: "myCollection",
		writerMapping: {
			"/my/path/": myPathWriter,
			"/my/": myWriter,
			"/": generalWriter
		}
	});

	await writerCollection.byPath("/my/resource.res");

	t.is(myPathWriter._byPath.callCount, 1, "One _byPath to /my/path/ writer");
	t.is(myWriter._byPath.callCount, 1, "One _byPath to /my/ writer");
	t.is(generalWriter._byPath.callCount, 1, "One _byPath to / writer");

	t.is(myPathWriter._byPath.getCall(0).args[0], "/my/resource.res",
		"Correct _byPath argument passed to /my/path/ writer");
	t.is(myWriter._byPath.getCall(0).args[0], "/my/resource.res",
		"Correct _byPath argument passed to /my/ writer");
	t.is(generalWriter._byPath.getCall(0).args[0], "/my/resource.res",
		"Correct _byPath argument passed to / writer");
});
