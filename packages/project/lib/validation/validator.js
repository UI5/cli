const path = require("path");
const {promisify} = require("util");
const readFile = promisify(require("fs").readFile);

async function loadSchema(schemaPath) {
	const filePath = schemaPath.replace("http://ui5.sap/schema/", "");
	const schemaFile = await readFile(path.join(__dirname, "schema", filePath), {encoding: "utf8"});
	return JSON.parse(schemaFile);
}

/**
 * @private
 * @memberof module:@ui5/project.validation
 */
class Validator {
	constructor() {
		const Ajv = require("ajv");
		this.ajv = new Ajv({
			allErrors: true,
			jsonPointers: true,
			loadSchema
		});
		const ajvErrors = require("ajv-errors");
		ajvErrors(this.ajv);
	}

	_compileSchema() {
		if (!this._compiling) {
			this._compiling = Promise.resolve().then(async () => {
				const schema = await loadSchema("ui5.json");
				const validate = await this.ajv.compileAsync(schema);
				return validate;
			});
		}
		return this._compiling;
	}

	async validate({config, project, yaml}) {
		const fnValidate = await this._compileSchema();
		const valid = fnValidate(config);
		if (!valid) {
			const ValidationError = require("./ValidationError");
			throw new ValidationError({
				errors: fnValidate.errors,
				schema: fnValidate.schema,
				project,
				yaml
			});
		}
	}
}

let validator;

/**
 * @public
 * @namespace
 * @alias module:@ui5/project.validation.validator
 */
module.exports = {
	/**
	 * Validates the given configuration.
	 *
	 * @param {object} options
	 * @param {object} options.config UI5 Configuration to validate
	 * @param {object} options.project Project information
	 * @param {string} options.project.id ID of the project
	 * @param {object} [options.yaml] YAML information
	 * @param {string} options.yaml.path Path of the YAML file
	 * @param {string} options.yaml.source Content of the YAML file
	 * @param {number} [options.yaml.documentIndex=0] Document index in case the YAML file contains multiple documents
	 * @throws {module:@ui5/project.validation.ValidationError}
	 *   Rejects with a {@link module:@ui5/project.validation.ValidationError ValidationError}
	 *   when the validation fails.
	 * @returns {Promise<undefined>} Returns a Promise that resolves when the validation succeeds
	 * @public
	 */
	validate: async (options) => {
		if (!validator) {
			validator = new Validator();
		}
		await validator.validate(options);
	},
	_Validator: Validator // For testing only
};
