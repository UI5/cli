import test from "ava";
import sinonGlobal from "sinon";
import createModuleNameMapping from "../../../../../lib/tasks/bundlers/utils/createModuleNameMapping.js";

test.beforeEach((t) => {
	const sinon = t.context.sinon = sinonGlobal.createSandbox();
	t.context.taskUtil = {
		getTag: sinon.stub(),
		STANDARD_TAGS: {
			IsDebugVariant: "🦄",
		},
	};
});
test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test("createModuleNameMapping", (t) => {
	const {taskUtil} = t.context;
	taskUtil.getTag.callsFake((resource) => {
		if (resource.getPath() === "/resources/Module.js") {
			return false;
		}
		// All but the first shall be assumed debug variants
		return true;
	});
	const resources = [{
		getPath: () => "/resources/Module.js"
	}, {
		getPath: () => "/resources/Module-dbg.js"
	}, {
		getPath: () => "/resources/Module-dbg.js.map"
	}, {
		getPath: () => "/resources/Module-dbg-dbg.js"
	}, {
		getPath: () => "/resources/Module-dbg-dbg.js.map"
	}, {
		getPath: () => "/resources/Module.xml"
	}, {
		getPath: () => "/resources/Module.css"
	}];
	const res = createModuleNameMapping({
		resources,
		taskUtil
	});

	t.deepEqual(res, {
		"/resources/Module-dbg-dbg.js": "Module-dbg.js",
		"/resources/Module-dbg.js": "Module.js"
	}, "Expected module name mapping");
});
