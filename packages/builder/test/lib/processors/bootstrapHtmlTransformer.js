import test from "ava";
import sinon from "sinon";
import esmock from "esmock";

test.beforeEach(async (t) => {
	t.context.logWarnSpy = sinon.spy();
	const loggerStub = {
		warn: t.context.logWarnSpy
	};
	t.context.bootstrapHtmlTransformer = await esmock("../../../lib/processors/bootstrapHtmlTransformer.js", {
		"@ui5/logger": {
			getLogger: sinon.stub().withArgs("builder:processors:bootstrapHtmlTransformer").returns(loggerStub)
		}
	});
});

test.afterEach.always((t) => {
	sinon.restore();
});

test.serial("Replaces relative bootstrap src with bar.js", async (t) => {
	t.plan(3);
	const {bootstrapHtmlTransformer} = t.context;
	const input = `
<!DOCTYPE html>
<html>
<head>
	<script id="sap-ui-bootstrap" src="foo.js">
	</script>
</head>
<body>
</body>
</html>`;
	const expected = `<!DOCTYPE html><html><head>
	<script id="sap-ui-bootstrap" src="bar.js">
	</script>
</head>
<body>

</body></html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.deepEqual(actual, expected, "Correct file content should be set");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
});

test.serial("Replaces absolute bootstrap src with bar.js", async (t) => {
	t.plan(3);
	const {bootstrapHtmlTransformer} = t.context;
	const input = `
<!DOCTYPE html>
<html>
<head>
	<script id="sap-ui-bootstrap" src="https://example.com/foo.js">
	</script>
</head>
<body>
</body>
</html>`;
	const expected = `<!DOCTYPE html><html><head>
	<script id="sap-ui-bootstrap" src="bar.js">
	</script>
</head>
<body>

</body></html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.deepEqual(actual, expected, "Correct file content should be set");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
});

test.serial("Replaces bootstrap src of multiple resources", async (t) => {
	t.plan(4);
	const {bootstrapHtmlTransformer} = t.context;
	const input = `
<!DOCTYPE html>
<html>
<head>
	<script id="sap-ui-bootstrap" src="https://example.com/foo.js">
	</script>
</head>
<body>
</body>
</html>`;
	const expected = `<!DOCTYPE html><html><head>
	<script id="sap-ui-bootstrap" src="bar.js">
	</script>
</head>
<body>

</body></html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.deepEqual(actual, expected, "Correct file content should be set");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource, resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource, resource], "Input resources are returned");

	t.true(t.context.logWarnSpy.notCalled, "No warnings should be logged");
});

test.serial("Logs warning when bootstrap script can't be found due to missing ID", async (t) => {
	const {bootstrapHtmlTransformer} = t.context;
	// Processor should only detect script tags with id=sap-ui-bootstrap
	// even when a script with sap-ui-core.js could be found.
	const input = `
<!DOCTYPE html>
<html>
<head>
	<script src="resources/sap-ui-core.js">
	</script>
</head>
<body>
</body>
</html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.fail("Resource should not be modified!");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(
		t.context.logWarnSpy.calledWith(
			"Skipping bootstrap transformation. Could not find bootstrap script tag with id=sap-ui-bootstrap."),
		"Warning about missing bootstrap script tag should be logged");
});

test.serial("Logs warning when bootstrap script can't be found due to wrong tag", async (t) => {
	const {bootstrapHtmlTransformer} = t.context;
	// Processor should only detect script tags with id=sap-ui-bootstrap
	// even when a script with sap-ui-core.js could be found.
	const input = `
<!DOCTYPE html>
<html>
<head>
	<div id="sap-ui-bootstrap" src="bar.js">
	</div>
</head>
<body>
</body>
</html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.fail("Resource should not be modified!");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(
		t.context.logWarnSpy.calledWith(
			"Skipping bootstrap transformation. Could not find bootstrap script tag with id=sap-ui-bootstrap."),
		"Warning about missing bootstrap script tag should be logged");
});

test.serial("Logs warning when input is not valid HTML", async (t) => {
	const {bootstrapHtmlTransformer} = t.context;
	const input = `
console.log("This is not HTML!")`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.fail("Resource should not be modified!");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(
		t.context.logWarnSpy.calledWith(
			"Skipping bootstrap transformation. Could not find bootstrap script tag with id=sap-ui-bootstrap."),
		"Warning about missing bootstrap script tag should be logged");
});

test.serial("Logs warning when multiple bootstrap scripts are found", async (t) => {
	const {bootstrapHtmlTransformer} = t.context;
	const input = `
<!DOCTYPE html>
<html>
<head>
	<script id="sap-ui-bootstrap" src="foo-1.js">
	</script>
	<script id="sap-ui-bootstrap" src="foo-2.js">
	</script>
</head>
<body>
</body>
</html>`;

	const resource = {
		getString: () => Promise.resolve(input),
		setString: (actual) => {
			t.fail("Resource should not be modified!");
		}
	};

	const processedResources = await bootstrapHtmlTransformer({
		resources: [resource],
		options: {
			src: "bar.js"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");

	t.is(t.context.logWarnSpy.callCount, 1, "One warning should be logged");
	t.true(
		t.context.logWarnSpy.calledWith(
			"Skipping bootstrap transformation. Found multiple bootstrap script tags with id=sap-ui-bootstrap."),
		"Warning about multiple bootstrap script tags should be logged");
});
