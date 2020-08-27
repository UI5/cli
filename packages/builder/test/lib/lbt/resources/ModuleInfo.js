const test = require("ava");

const ModuleInfo = require("../../../../lib/lbt/resources/ModuleInfo");

test("ModuleInfo: constructor", async (t) => {
	const moduleInfo = new ModuleInfo("myName");
	t.falsy(moduleInfo.exposedGlobals, "exposedGlobals is not set");
	t.falsy(moduleInfo.format, "format is not set");
	t.falsy(moduleInfo.description, "description is not set");
	t.false(moduleInfo.requiresTopLevelScope, "requiresTopLevelScope is false");
	t.false(moduleInfo.rawModule, "rawModule is false");
	t.false(moduleInfo.dynamicDependencies, "dynamicDependencies is false");
	t.deepEqual(moduleInfo.subModules, [], "submodules are empty");
});

test("ModuleInfo: addSubModule", async (t) => {
	// setup
	const moduleInfo = new ModuleInfo("myName");
	moduleInfo.addDependency("otherModule", false);
	const otherModuleInfo = new ModuleInfo("otherModule");
	otherModuleInfo.addDependency("unknownModule", false);
	otherModuleInfo.dynamicDependencies = true;

	// action
	moduleInfo.addSubModule(otherModuleInfo);

	// expectation
	t.true(moduleInfo.dynamicDependencies, "dynamicDependencies is set");
	t.deepEqual(moduleInfo.subModules, ["otherModule"], "submodule is set");
	t.deepEqual(moduleInfo.dependencies, ["unknownModule"], "unknownModule dependency is copied over");
});

test("ModuleInfo: name", async (t) => {
	// setup
	const moduleInfo = new ModuleInfo("myName");

	// action
	moduleInfo.addDependency("newName", false);
	moduleInfo.name = "newName";

	moduleInfo.addSubModule("newName2");
	moduleInfo.name = "newName2";

	// expectation
	t.deepEqual(moduleInfo.subModules, [], "submodule is empty");
	t.deepEqual(moduleInfo.dependencies, [], "dependencies is empty");
	t.is(moduleInfo.name, "newName2", "name was set");
});

test("ModuleInfo: toString", async (t) => {
	// setup
	const moduleInfo = new ModuleInfo("myName");

	// action
	moduleInfo.addDependency("dep1", false);
	moduleInfo.addDependency("dep2", false);
	moduleInfo.addSubModule("sub1");
	moduleInfo.addSubModule("sub2");
	const stringContent = moduleInfo.toString();

	// expectation
	t.is(stringContent, "ModuleInfo(myName, dependencies=dep1,dep2, includes=sub1,sub2)", "string value is correct");
});
