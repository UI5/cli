import test from "ava";
import sinon from "sinon";
import replaceCopyright from "../../../lib/tasks/replaceCopyright.js";
import {createAdapter, createResource} from "@ui5/fs/resourceFactory";
import DuplexCollection from "@ui5/fs/DuplexCollection";

test("integration: replace copyright", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
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

	const resource = createResource({
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


test("integration: replace copyright reads the current year through taskUtil.getTime", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
		virBasePath: "/"
	});
	const workspace = new DuplexCollection({reader, writer});

	/* eslint-disable no-useless-escape */
	const content = `/*!
 * $\{copyright\}
 */
console.log('HelloWorld');`;
	/* eslint-enable no-useless-escape */

	const copyright = `(c) Copyright 2009-\${currentYear} SAP SE or an SAP affiliate company.`;

	// A stubbed taskUtil.getTime lets the test assert both that the task reads the year through the
	// tracked accessor (not new Date()) and that it requests the "year" granularity.
	const getTime = sinon.stub().returns("1999");
	const expected = `/*!
 * (c) Copyright 2009-1999 SAP SE or an SAP affiliate company.
 */
console.log('HelloWorld');`;

	const resource = createResource({
		path: "/test.js",
		string: content
	});

	await workspace.write(resource);

	await replaceCopyright({
		workspace,
		taskUtil: {getTime},
		options: {
			copyright: copyright,
			pattern: "/**/*.js"
		}
	});

	t.true(getTime.calledOnceWithExactly("year"), "taskUtil.getTime was called with the year granularity");

	const transformedResource = await writer.byPath("/test.js");
	t.truthy(transformedResource, "Could find /test.js in target");
	t.is(await transformedResource.getString(), expected);
});


test("test.xml: replace @copyright@", async (t) => {
	const reader = createAdapter({
		virBasePath: "/"
	});
	const writer = createAdapter({
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

	const resource = createResource({
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
