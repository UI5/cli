import test from "ava";
import sinonGlobal from "sinon";
import SpecificationVersion from "../../../../lib/specifications/SpecificationVersion.js";
import {__localFunctions__} from "../../../../lib/specifications/SpecificationVersion.js";

const unsupportedSpecVersionText = (specVersion) =>
	`Unsupported Specification Version ${specVersion} defined. Your UI5 CLI installation might be outdated. ` +
	`For details, see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions`;

test.beforeEach((t) => {
	t.context.sinon = sinonGlobal.createSandbox();
});

test.afterEach.always((t) => {
	t.context.sinon.restore();
});

test.serial("Invalid specVersion", (t) => {
	const {sinon} = t.context;
	const isSupportedSpecVersionStub =
		sinon.stub(SpecificationVersion, "isSupportedSpecVersion").returns(false);

	t.throws(() => {
		new SpecificationVersion("2.5");
	}, {
		message: unsupportedSpecVersionText("2.5")
	}, "Threw with expected error message");

	t.is(isSupportedSpecVersionStub.callCount, 1, "Static isSupportedSpecVersionStub has been called once");
	t.deepEqual(isSupportedSpecVersionStub.getCall(0).args, ["2.5"],
		"Static isSupportedSpecVersionStub has been called with expected arguments");
});

test("(instance) toString", (t) => {
	t.is(new SpecificationVersion("0.1").toString(), "0.1");
	t.is(new SpecificationVersion("1.1").toString(), "1.1");
});

test("(instance) major", (t) => {
	t.is(new SpecificationVersion("0.1").major(), 0);
	t.is(new SpecificationVersion("1.1").major(), 1);
	t.is(new SpecificationVersion("2.1").major(), 2);

	t.is(t.throws(() => {
		new SpecificationVersion("0.2").major();
	}).message, unsupportedSpecVersionText("0.2"));
});

test("(instance) minor", (t) => {
	t.is(new SpecificationVersion("2.1").minor(), 1);
	t.is(new SpecificationVersion("2.2").minor(), 2);
	t.is(new SpecificationVersion("2.3").minor(), 3);

	t.is(t.throws(() => {
		new SpecificationVersion("1.2").minor();
	}).message, unsupportedSpecVersionText("1.2"));
});

test("(instance) satisfies", (t) => {
	// range: 1.x
	t.is(new SpecificationVersion("1.0").satisfies("1.x"), true);
	t.is(new SpecificationVersion("1.1").satisfies("1.x"), true);
	t.is(new SpecificationVersion("2.0").satisfies("1.x"), false);

	// range: ^2.2
	t.is(new SpecificationVersion("2.1").satisfies("^2.2"), false);
	t.is(new SpecificationVersion("2.2").satisfies("^2.2"), true);
	t.is(new SpecificationVersion("2.3").satisfies("^2.2"), true);

	// range: > 1.0
	t.is(new SpecificationVersion("1.0").satisfies("> 1.0"), false);
	t.is(new SpecificationVersion("1.1").satisfies("> 1.0"), true);
	t.is(new SpecificationVersion("2.2").satisfies("> 1.0"), true);

	// range: 2.2 - 2.4
	t.is(new SpecificationVersion("2.1").satisfies("2.2 - 2.4"), false);
	t.is(new SpecificationVersion("2.2").satisfies("2.2 - 2.4"), true);
	t.is(new SpecificationVersion("2.3").satisfies("2.2 - 2.4"), true);
	t.is(new SpecificationVersion("2.4").satisfies("2.2 - 2.4"), true);
	t.is(new SpecificationVersion("2.5").satisfies("2.2 - 2.4"), false);

	// range: 0.1 || 1.0 - 1.1 || ^2.5
	t.is(new SpecificationVersion("0.1").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(new SpecificationVersion("1.0").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(new SpecificationVersion("1.1").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(new SpecificationVersion("2.4").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), false);
	t.is(new SpecificationVersion("2.5").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(new SpecificationVersion("2.6").satisfies("0.1 || 1.0 - 1.1 || ^2.5"), true);

	// unsupported spec version
	t.is(t.throws(() => {
		new SpecificationVersion("0.2").satisfies("1.x");
	}).message, unsupportedSpecVersionText("0.2"));
});

test("(instance) low level comparator", (t) => {
	t.is(new SpecificationVersion("2.1").gt("2.2"), false);
	t.is(new SpecificationVersion("2.2").gt("2.2"), false);
	t.is(new SpecificationVersion("2.3").gt("2.2"), true);

	t.is(new SpecificationVersion("2.1").gte("2.2"), false);
	t.is(new SpecificationVersion("2.2").gte("2.2"), true);
	t.is(new SpecificationVersion("2.3").gte("2.2"), true);

	t.is(new SpecificationVersion("2.1").lt("2.2"), true);
	t.is(new SpecificationVersion("2.2").lt("2.2"), false);
	t.is(new SpecificationVersion("2.3").lt("2.2"), false);

	t.is(new SpecificationVersion("2.1").lte("2.2"), true);
	t.is(new SpecificationVersion("2.2").lte("2.2"), true);
	t.is(new SpecificationVersion("2.3").lte("2.2"), false);

	t.is(new SpecificationVersion("2.0").eq("2.2"), false);
	t.is(new SpecificationVersion("2.2").eq("2.2"), true);

	t.is(new SpecificationVersion("2.0").neq("2.2"), true);
	t.is(new SpecificationVersion("2.2").neq("2.2"), false);
});

test("(static) isSupportedSpecVersion", (t) => {
	t.is(SpecificationVersion.isSupportedSpecVersion("0.1"), true);
	t.is(SpecificationVersion.isSupportedSpecVersion("1.0"), true);
	t.is(SpecificationVersion.isSupportedSpecVersion("1.1"), true);
	t.is(SpecificationVersion.isSupportedSpecVersion("2.0"), true);
	t.is(SpecificationVersion.isSupportedSpecVersion("2.4"), true);
	t.is(SpecificationVersion.isSupportedSpecVersion("0.2"), false);
	t.is(SpecificationVersion.isSupportedSpecVersion("1.2"), false);
	t.is(SpecificationVersion.isSupportedSpecVersion(1.1), false);
	t.is(SpecificationVersion.isSupportedSpecVersion("foo"), false);
	t.is(SpecificationVersion.isSupportedSpecVersion(""), false);
	t.is(SpecificationVersion.isSupportedSpecVersion(), false);
});

test("(static) major", (t) => {
	t.is(SpecificationVersion.major("0.1"), 0);
	t.is(SpecificationVersion.major("1.1"), 1);
	t.is(SpecificationVersion.major("2.1"), 2);

	t.is(t.throws(() => {
		SpecificationVersion.major("0.2");
	}).message, unsupportedSpecVersionText("0.2"));
});

test("(static) minor", (t) => {
	t.is(SpecificationVersion.minor("2.1"), 1);
	t.is(SpecificationVersion.minor("2.2"), 2);
	t.is(SpecificationVersion.minor("2.3"), 3);

	t.is(t.throws(() => {
		SpecificationVersion.minor("1.2");
	}).message, unsupportedSpecVersionText("1.2"));
});

test("(static) satisfies", (t) => {
	// range: 1.x
	t.is(SpecificationVersion.satisfies("1.0", "1.x"), true);
	t.is(SpecificationVersion.satisfies("1.1", "1.x"), true);
	t.is(SpecificationVersion.satisfies("2.0", "1.x"), false);

	// range: ^2.2
	t.is(SpecificationVersion.satisfies("2.1", "^2.2"), false);
	t.is(SpecificationVersion.satisfies("2.2", "^2.2"), true);
	t.is(SpecificationVersion.satisfies("2.3", "^2.2"), true);

	// range: > 1.0
	t.is(SpecificationVersion.satisfies("1.0", "> 1.0"), false);
	t.is(SpecificationVersion.satisfies("1.1", "> 1.0"), true);
	t.is(SpecificationVersion.satisfies("2.2", "> 1.0"), true);

	// range: 2.2 - 2.4
	t.is(SpecificationVersion.satisfies("2.1", "2.2 - 2.4"), false);
	t.is(SpecificationVersion.satisfies("2.2", "2.2 - 2.4"), true);
	t.is(SpecificationVersion.satisfies("2.3", "2.2 - 2.4"), true);
	t.is(SpecificationVersion.satisfies("2.4", "2.2 - 2.4"), true);
	t.is(SpecificationVersion.satisfies("2.5", "2.2 - 2.4"), false);

	// range: 0.1 || 1.0 - 1.1 || ^2.5
	t.is(SpecificationVersion.satisfies("0.1", "0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(SpecificationVersion.satisfies("1.0", "0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(SpecificationVersion.satisfies("1.1", "0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(SpecificationVersion.satisfies("2.4", "0.1 || 1.0 - 1.1 || ^2.5"), false);
	t.is(SpecificationVersion.satisfies("2.5", "0.1 || 1.0 - 1.1 || ^2.5"), true);
	t.is(SpecificationVersion.satisfies("2.6", "0.1 || 1.0 - 1.1 || ^2.5"), true);

	// unsupported spec version
	t.is(t.throws(() => {
		SpecificationVersion.satisfies("0.2", "1.x");
	}).message, unsupportedSpecVersionText("0.2"));
});

test("(static) low level comparator", (t) => {
	t.is(SpecificationVersion.gt("2.1", "2.2"), false);
	t.is(SpecificationVersion.gt("2.2", "2.2"), false);
	t.is(SpecificationVersion.gt("2.3", "2.2"), true);

	t.is(SpecificationVersion.gte("2.1", "2.2"), false);
	t.is(SpecificationVersion.gte("2.2", "2.2"), true);
	t.is(SpecificationVersion.gte("2.3", "2.2"), true);

	t.is(SpecificationVersion.lt("2.1", "2.2"), true);
	t.is(SpecificationVersion.lt("2.2", "2.2"), false);
	t.is(SpecificationVersion.lt("2.3", "2.2"), false);

	t.is(SpecificationVersion.lte("2.1", "2.2"), true);
	t.is(SpecificationVersion.lte("2.2", "2.2"), true);
	t.is(SpecificationVersion.lte("2.3", "2.2"), false);

	t.is(SpecificationVersion.eq("2.0", "2.2"), false);
	t.is(SpecificationVersion.eq("2.2", "2.2"), true);

	t.is(SpecificationVersion.neq("2.0", "2.2"), true);
	t.is(SpecificationVersion.neq("2.2", "2.2"), false);
});

test("getSemverCompatibleVersion", (t) => {
	t.is(__localFunctions__.getSemverCompatibleVersion("0.1"), "0.1.0");
	t.is(__localFunctions__.getSemverCompatibleVersion("1.1"), "1.1.0");
	t.is(__localFunctions__.getSemverCompatibleVersion("2.0"), "2.0.0");

	t.is(t.throws(() => {
		__localFunctions__.getSemverCompatibleVersion("1.2.3");
	}).message, unsupportedSpecVersionText("1.2.3"));
	t.is(t.throws(() => {
		__localFunctions__.getSemverCompatibleVersion("0.99");
	}).message, unsupportedSpecVersionText("0.99"));
	t.is(t.throws(() => {
		__localFunctions__.getSemverCompatibleVersion("foo");
	}).message, unsupportedSpecVersionText("foo"));
	t.is(t.throws(() => {
		__localFunctions__.getSemverCompatibleVersion();
	}).message, unsupportedSpecVersionText("undefined"));
});

test("handleSemverComparator", (t) => {
	const comparatorStub = t.context.sinon.stub().returns("foobar");
	t.is(__localFunctions__.handleSemverComparator(comparatorStub, "1.1.0", "2.2"), "foobar");
	t.deepEqual(comparatorStub.getCall(0).args, ["1.1.0", "2.2.0"]);

	t.is(t.throws(() => {
		__localFunctions__.handleSemverComparator(undefined, undefined, "a.b");
	}).message, "Invalid spec version expectation given in comparator: a.b");
});
