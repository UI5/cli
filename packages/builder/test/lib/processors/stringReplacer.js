import test from "ava";
import _sinon from "sinon";
import stringReplacer from "../../../lib/processors/stringReplacer.js";

test.beforeEach((t) => {
	t.context.sinon = _sinon.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Replace using string pattern", async (t) => {
	const {sinon} = t.context;
	const input = `foo bar foo`;
	const expected = `foo foo foo`;

	const resource = {
		getString: sinon.stub().resolves(input),
		setString: sinon.stub()
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: "bar",
			replacement: "foo"
		}
	});

	t.is(processedResources.length, 1, "Returned one resource");
	t.is(processedResources[0], resource, "Input resource is returned");
	t.is(resource.setString.callCount, 1, "Resource#setString got called once");
	t.is(resource.setString.firstCall.firstArg, expected, "Resource#setString got called with expected argument");
});

test.serial("No replacement", async (t) => {
	const {sinon} = t.context;
	const input = `foo foo foo`;

	const resource = {
		getString: sinon.stub().resolves(input),
		setString: sinon.stub()
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: "bar",
			replacement: "foo"
		}
	});

	t.is(processedResources.length, 1, "Returned one resource");
	t.is(processedResources[0], undefined, "Input resource is not returned when unchanged");
	t.is(resource.setString.callCount, 0, "Resource#setString did not get called");
});

test.serial("Replace using regular expression", async (t) => {
	const {sinon} = t.context;
	const input = `foo BAR foo`;
	const expected = `foo foo foo`;

	const resource = {
		getString: sinon.stub().resolves(input),
		setString: sinon.stub()
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: /bar/ig,
			replacement: "foo"
		}
	});

	t.is(processedResources.length, 1, "Returned one resource");
	t.is(processedResources[0], resource, "Input resource is returned");
	t.is(resource.setString.callCount, 1, "Resource#setString got called once");
	t.is(resource.setString.firstCall.firstArg, expected, "Resource#setString got called with expected argument");
});

test.serial("Regular expression requires global flag", async (t) => {
	const {sinon} = t.context;
	const input = `foo bar foo`;

	const resource = {
		getString: sinon.stub().resolves(input),
		setString: sinon.stub()
	};

	await t.throwsAsync(stringReplacer({
		resources: [resource],
		options: {
			pattern: /bar/i,
			replacement: "foo"
		}
	}), {
		message: "String.prototype.replaceAll called with a non-global RegExp argument"
	}, "Threw with expected error message");
});

test.serial("Replaces string pattern with UTF8 characters", async (t) => {
	const {sinon} = t.context;
	const input = `早安`;
	const expected = `午安`;

	const resource = {
		getString: sinon.stub().resolves(input),
		setString: sinon.stub()
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: /早/g,
			replacement: "午"
		}
	});

	t.is(processedResources.length, 1, "Returned one resource");
	t.is(processedResources[0], resource, "Input resource is returned");
	t.is(resource.setString.callCount, 1, "Resource#setString got called once");
	t.is(resource.setString.firstCall.firstArg, expected, "Resource#setString got called with expected argument");
});

test.serial("Process multiple resources", async (t) => {
	const {sinon} = t.context;

	const resourceA = {
		getString: sinon.stub().resolves("Resource A"),
		setString: sinon.stub()
	};
	const resourceB = {
		getString: sinon.stub().resolves("Resource B"),
		setString: sinon.stub()
	};
	const resourceC = {
		getString: sinon.stub().resolves("Resource 三"),
		setString: sinon.stub()
	};
	const resourceD = {
		getString: sinon.stub().resolves("Resource D"),
		setString: sinon.stub()
	};

	const processedResources = await stringReplacer({
		resources: [resourceA, resourceB, resourceC, resourceD],
		options: {
			pattern: /[B-D]/g,
			replacement: "💎"
		}
	});

	t.is(processedResources.length, 4, "Returned all four resources");
	t.is(processedResources[0], undefined, "Unchanged resourceA is not returned");
	t.is(processedResources[1], resourceB, "Input resourceB is returned");
	t.is(processedResources[2], undefined, "Unchanged resourceC is not returned");
	t.is(processedResources[3], resourceD, "Input resourceD is returned");
	t.is(resourceA.setString.callCount, 0, "resourceA#setString did not get called");
	t.is(resourceB.setString.callCount, 1, "resourceB#setString got called once");
	t.is(resourceB.setString.firstCall.firstArg, "Resource 💎", "resourceB#setString got called with expected argument");
	t.is(resourceC.setString.callCount, 0, "resourceC#setString did not get called");
	t.is(resourceD.setString.callCount, 1, "resourceD#setString got called once");
	t.is(resourceD.setString.firstCall.firstArg, "Resource 💎", "resourceD#setString got called with expected argument");
});
