const test = require("ava");

const replaceCopyright = require("../../../lib/tasks/replaceCopyright");
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: replace copyright", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	/* eslint-disable no-useless-escape */
	const content = `/*!
 * $\{copyright\}
 */
console.log('HelloWorld');`;
	/* eslint-enable no-useless-escape */

	const copyright = `UI development toolkit for HTML5 (OpenUI5)
 * (c) Copyright 2009-\${currentYear} SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.`;

	const year = new Date().getFullYear();
	const expected = `/*!
 * UI development toolkit for HTML5 (OpenUI5)
 * (c) Copyright 2009-${year} SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 */
console.log('HelloWorld');`;

	const resource = resourceFactory.createResource({
		path: "/test.js",
		string: content
	});

	await workspace.write(resource);

	await replaceCopyright({
		workspace,
		options: {
			copyright: copyright,
			pattern: "/**/*.js"
		}
	});

	const transformedResource = await writer.byPath("/test.js");

	if (!transformedResource) {
		t.fail("Could not find /test.js in target");
	} else {
		t.deepEqual(await transformedResource.getString(), expected);
	}
});


test("test.xml: replace @copyright@", async (t) => {
	const reader = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const writer = resourceFactory.createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});
	const content = `<!--
 * @copyright@
 -->
<xml></xml>`;

	const copyright = `UI development toolkit for HTML5 (OpenUI5)
 * (c) Copyright 2009-\${currentYear} SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.`;

	const year = new Date().getFullYear();
	const expected = `<!--
 * UI development toolkit for HTML5 (OpenUI5)
 * (c) Copyright 2009-${year} SAP SE or an SAP affiliate company.
 * Licensed under the Apache License, Version 2.0 - see LICENSE.txt.
 -->
<xml></xml>`;

	const resource = resourceFactory.createResource({
		path: "/test.xml",
		string: content
	});

	await reader.write(resource);
	await replaceCopyright({
		workspace,
		options: {
			pattern: "/**/*.xml",
			copyright: copyright
		}
	});
	const transformedResource = await writer.byPath("/test.xml");

	if (!transformedResource) {
		t.fail("Could not find /test.xml in target");
	} else {
		t.deepEqual(await transformedResource.getString(), expected);
	}
});
