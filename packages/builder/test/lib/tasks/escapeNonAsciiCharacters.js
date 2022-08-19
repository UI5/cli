const test = require("ava");

const escapeNonAsciiCharacters = require("../../../lib/tasks/escapeNonAsciiCharacters");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: escape non ascii characters (utf8, default)", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	const content = `welcome=Willkommen {0}. Bitte geben Sie einen neuen Kontakt ein:
lastname=Nachname:
firstname=Vorname:
street=Straße:♥
zip=PLZ:
city=Ort:`;

	const expected = `welcome=Willkommen {0}. Bitte geben Sie einen neuen Kontakt ein:
lastname=Nachname:
firstname=Vorname:
street=Stra\\u00dfe:\\u2665
zip=PLZ:
city=Ort:`;

	const resource = resourceFactory.createResource({
		path: "/i18n.properties",
		string: content
	});

	await workspace.write(resource);
	await escapeNonAsciiCharacters({
		workspace,
		options: {
			encoding: "UTF-8",
			pattern: "/**/*.properties"
		}
	});

	const escapedResource = await writer.byPath("/i18n.properties");

	if (!escapedResource) {
		t.fail("Could not find /i18n.properties in target");
	} else {
		t.deepEqual(await escapedResource.getString(), expected);
	}
});

test("integration: escape non ascii characters source encoding being (ISO-8859-1)", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	// create buffer in ISO encoding
	const content = Buffer.from(`welcome=Willkommen {0}. Bitte geben Sie einen neuen Kontakt ein:
lastname=Nachname:
firstname=Vorname:
street=Straße:
zip=PLZ:
city=Ort:`, "latin1");

	const expected = `welcome=Willkommen {0}. Bitte geben Sie einen neuen Kontakt ein:
lastname=Nachname:
firstname=Vorname:
street=Stra\\u00dfe:
zip=PLZ:
city=Ort:`;

	const resource = resourceFactory.createResource({
		path: "/i18n.properties",
		buffer: content
	});

	await workspace.write(resource);
	await escapeNonAsciiCharacters({
		workspace,
		options: {
			encoding: "ISO-8859-1",
			pattern: "/**/*.properties"
		}
	});

	const escapedResource = await writer.byPath("/i18n.properties");

	if (!escapedResource) {
		t.fail("Could not find /i18n.properties in target");
	} else {
		t.deepEqual(await escapedResource.getString(), expected);
	}
});

test("integration: escape non ascii characters source encoding being empty", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	const error = await t.throwsAsync(escapeNonAsciiCharacters({
		workspace,
		options: {
			encoding: "",
			pattern: "/**/*.properties"
		}
	}));
	return t.is(error.message, "[escapeNonAsciiCharacters] Mandatory option 'encoding' not provided");
});

test("integration: escape non ascii characters source encoding being UTF-16", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	const error = await t.throwsAsync(escapeNonAsciiCharacters({
		workspace,
		options: {
			encoding: "utf16le",
			pattern: "/**/*.properties"
		}
	}));
	return t.is(error.message, `Encoding "utf16le" is not supported. Only UTF-8, ISO-8859-1 are allowed values`);
});
