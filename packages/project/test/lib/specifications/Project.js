const test = require("ava");
const path = require("path");
const Specification = require("../../../lib/specifications/Specification");

function clone(obj) {
	return JSON.parse(JSON.stringify(obj));
}

const applicationAPath = path.join(__dirname, "..", "..", "fixtures", "application.a");
const basicProjectInput = {
	id: "application.a.id",
	version: "1.0.0",
	modulePath: applicationAPath,
	configuration: {
		specVersion: "2.3",
		kind: "project",
		type: "application",
		metadata: {name: "application.a"}
	}
};

test("Invalid configuration", async (t) => {
	const customProjectInput = clone(basicProjectInput);
	customProjectInput.configuration.resources = {
		configuration: {
			propertiesFileSourceEncoding: "Ponycode"
		}
	};
	const error = await t.throwsAsync(Specification.create(customProjectInput));
	t.is(error.message, `Invalid ui5.yaml configuration for project application.a.id

Configuration resources/configuration/propertiesFileSourceEncoding must be equal to one of the allowed values
Allowed values: UTF-8, ISO-8859-1`, "Threw with validation error");
});
