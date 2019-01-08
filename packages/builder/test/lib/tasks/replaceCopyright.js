const {test} = require("ava");

const ui5Builder = require("../../../");
const tasks = ui5Builder.builder.tasks;
const ui5Fs = require("@ui5/fs");
const resourceFactory = ui5Fs.resourceFactory;
const DuplexCollection = ui5Fs.DuplexCollection;

test("integration: replace copyright", (t) => {
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

	return workspace.write(resource).then(() => {
		return tasks.replaceCopyright({
			workspace,
			options: {
				copyright: copyright,
				pattern: "/**/*.js"
			}
		}).then(() => {
			return writer.byPath("/test.js").then((resource) => {
				if (!resource) {
					t.fail("Could not find /test.js in target");
				} else {
					return resource.getString();
				}
			});
		}).then((result) => {
			return t.deepEqual(result, expected);
		});
	});
});


test("test.xml: replace @copyright@", (t) => {
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

	return reader.write(resource).then(() => {
		return tasks.replaceCopyright({
			workspace,
			options: {
				pattern: "/**/*.xml",
				copyright: copyright
			}
		}).then(() => {
			return writer.byPath("/test.xml").then((resource) => {
				if (!resource) {
					t.fail("Could not find /test.xml in target");
				} else {
					return resource.getString();
				}
			});
		}).then((result) => {
			return t.deepEqual(result, expected);
		});
	});
});
