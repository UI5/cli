const log = require("@ui5/logger").getLogger("types:AbstractUi5Formatter");
const path = require("path");
const fs = require("graceful-fs");
const AbstractFormatter = require("./AbstractFormatter");
const {promisify} = require("util");
const readFile = promisify(fs.readFile);

/**
 * Base class for formatters that require access to some UI5 specific resources
 * like pom.xml
 *
 * @abstract
 */
class AbstractUi5Formatter extends AbstractFormatter {
	/**
	 * Constructor
	 *
	 * @param {object} parameters
	 * @param {object} parameters.project Project
	 */
	constructor(parameters) {
		super(parameters);
		if (new.target === AbstractUi5Formatter) {
			throw new TypeError("Class 'AbstractUi5Formatter' is abstract");
		}
	}

	/**
	 * Checks whether a given string contains a maven placeholder.
	 * E.g. <code>${appId}</code>.
	 *
	 * @param {string} value String to check
	 * @returns {boolean} True if given string contains a maven placeholder
	 */
	hasMavenPlaceholder(value) {
		return !!value.match(/^\$\{(.*)\}$/);
	}

	/**
	 * Resolves a maven placeholder in a given string using the projects pom.xml
	 *
	 * @param {string} value String containing a maven placeholder
	 * @returns {Promise<string>} Resolved string
	 */
	async resolveMavenPlaceholder(value) {
		const parts = value && value.match(/^\$\{(.*)\}$/);
		if (parts) {
			log.verbose(`"${value} contains a maven placeholder "${parts[1]}". Resolving from projects pom.xml...`);
			const pom = await this.getPom();
			let mvnValue;
			if (pom.project && pom.project.properties && pom.project.properties[parts[1]]) {
				mvnValue = pom.project.properties[parts[1]];
			} else {
				let obj = pom;
				parts[1].split(".").forEach((part) => {
					obj = obj && obj[part];
				});
				mvnValue = obj;
			}
			if (!mvnValue) {
				throw new Error(`"${value}" couldn't be resolved from maven property ` +
					`"${parts[1]}" of pom.xml of project ${this._project.metadata.name}`);
			}
			return mvnValue;
		} else {
			throw new Error(`"${value}" is not a maven placeholder`);
		}
	}

	/**
	 * Reads the projects pom.xml file
	 *
	 * @returns {Promise<object>} Resolves with a JSON representation of the content
	 */
	async getPom() {
		if (this._pPom) {
			return this._pPom;
		}
		const fsPath = path.join(this._project.path, "pom.xml");
		return this._pPom = readFile(fsPath).then(async (content) => {
			const xml2js = require("xml2js");
			const parser = new xml2js.Parser({
				explicitArray: false,
				ignoreAttrs: true
			});
			const readXML = promisify(parser.parseString);
			return readXML(content);
		}).catch((err) => {
			throw new Error(
				`Failed to read pom.xml for project ${this._project.metadata.name}: ${err.message}`);
		});
	}
}

module.exports = AbstractUi5Formatter;
