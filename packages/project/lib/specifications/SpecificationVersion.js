import semver from "semver";

const SPEC_VERSION_PATTERN = /^\d+\.\d+$/;
const SUPPORTED_VERSIONS = [
	"0.1", "1.0", "1.1",
	"2.0", "2.1", "2.2", "2.3", "2.4", "2.5", "2.6",
	"3.0"
];

/**
 * Helper class representing a Specification Version. Featuring helper functions for easy comparison
 * of versions.
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/utils/SpecificationVersion
 */
class SpecificationVersion {
	#specVersion;
	#semverVersion;

	/**
	 * @public
	 * @param {string} specVersion Specification Version to use for all comparison operations
	 * @throws {Error} Throws if provided Specification Version is not supported by this version of @ui5/project
	 */
	constructor(specVersion) {
		this.#specVersion = specVersion;
		this.#semverVersion = getSemverCompatibleVersion(specVersion); // Throws for unsupported versions
	}

	/**
	 * Returns the Specification Version
	 *
	 * @public
	 * @returns {string} Specification Version
	 */
	toString() {
		return this.#specVersion;
	}

	/**
	 * Returns the major-version of the instance's Specification Version
	 *
	 * @public
	 * @returns {integer} Major version
	 */
	major() {
		return semver.major(this.#semverVersion);
	}

	/**
	 * Returns the minor-version of the instance's Specification Version
	 *
	 * @public
	 * @returns {integer} Minor version
	 */
	minor() {
		return semver.minor(this.#semverVersion);
	}

	/**
	 * Test whether the instance's Specification Version falls into the provided range
	 *
	 * @public
@param {string} range [Semver]{@link https://www.npmjs.com/package/semver}-style version range,
for example <code>2.2 - 2.4</code>
	 * @returns {boolean} True if the instance's Specification Version falls into the provided range
	 */
	satisfies(range) {
		return semver.satisfies(this.#semverVersion, range);
	}

	/**
	 * Test whether the instance's Specification Version is greater than the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is greater than the provided version
	 */
	gt(testVersion) {
		return handleSemverComparator(semver.gt, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the instance's Specification Version is greater than or equal to the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is greater than or equal to the provided version
	 */
	gte(testVersion) {
		return handleSemverComparator(semver.gte, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the instance's Specification Version is smaller than the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is smaller than the provided version
	 */
	lt(testVersion) {
		return handleSemverComparator(semver.lt, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the instance's Specification Version is smaller than or equal to the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is smaller than or equal to the provided version
	 */
	lte(testVersion) {
		return handleSemverComparator(semver.lte, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the instance's Specification Version is equal to the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is equal to the provided version
	 */
	eq(testVersion) {
		return handleSemverComparator(semver.eq, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the instance's Specification Version is not equal to the provided test version
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the instance's Specification Version is not equal to the provided version
	 */
	neq(testVersion) {
		return handleSemverComparator(semver.neq, this.#semverVersion, testVersion);
	}

	/**
	 * Test whether the provided Specification Version is supported by this version of @ui5/project
	 *
	 * @public
	 * @param {string} testVersion A Specification Version to compare the instance's Specification Version to
	 * @returns {boolean} True if the provided Specification Version is supported
	 */
	static isSupportedSpecVersion(testVersion) {
		return SUPPORTED_VERSIONS.includes(testVersion);
	}

	/**
	 * Returns the major-version of the provided Specification Version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @returns {integer} Major version
	 */
	static major(specVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.major();
	}

	/**
	 * Returns the minor-version of the provided Specification Version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @returns {integer} Minor version
	 */
	static minor(specVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.minor();
	}

	/**
	 * Test whether the provided Specification Version falls into the provided range
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} range [Semver]{@link https://www.npmjs.com/package/semver}-style version range,
	 * for example <code>2.2 - 2.4</code>
	 * @returns {boolean} True if the provided Specification Version falls into the provided range
	 */
	static satisfies(specVersion, range) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.satisfies(range);
	}

	/**
	 * Test whether the provided Specification Version is greater than the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is greater than the provided version
	 */
	static gt(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.gt(testVersion);
	}

	/**
	 * Test whether the provided Specification Version is greater than or equal to the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is greater than or equal to the provided version
	 */
	static gte(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.gte(testVersion);
	}

	/**
	 * Test whether the provided Specification Version is smaller than the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is smaller than the provided version
	 */
	static lt(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.lt(testVersion);
	}

	/**
	 * Test whether the provided Specification Version is smaller than or equal to the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is smaller than or equal to the provided version
	 */
	static lte(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.lte(testVersion);
	}

	/**
	 * Test whether the provided Specification Version is equal to the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is equal to the provided version
	 */
	static eq(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.eq(testVersion);
	}

	/**
	 * Test whether the provided Specification Version is not equal to the provided test version
	 *
	 * @public
	 * @param {string} specVersion Specification Version
	 * @param {string} testVersion A Specification Version to compare the provided Specification Version to
	 * @returns {boolean} True if the provided Specification Version is not equal to the provided version
	 */
	static neq(specVersion, testVersion) {
		const comparator = new SpecificationVersion(specVersion);
		return comparator.neq(testVersion);
	}
}

function getUnsupportedSpecVersionMessage(specVersion) {
	return `Unsupported Specification Version ${specVersion} defined. Your UI5 CLI installation might be outdated. ` +
		`For details, see https://sap.github.io/ui5-tooling/pages/Configuration/#specification-versions`;
}

function getSemverCompatibleVersion(specVersion) {
	if (SpecificationVersion.isSupportedSpecVersion(specVersion)) {
		return specVersion + ".0";
	}
	throw new Error(getUnsupportedSpecVersionMessage(specVersion));
}

function handleSemverComparator(comparator, baseVersion, testVersion) {
	if (SPEC_VERSION_PATTERN.test(testVersion)) {
		const a = baseVersion;
		const b = testVersion + ".0";
		return comparator(a, b);
	}
	throw new Error("Invalid spec version expectation given in comparator: " + testVersion);
}

export default SpecificationVersion;

// Export local function for testing only
export const __localFunctions__ = (process.env.NODE_ENV === "test") ?
	{getSemverCompatibleVersion, handleSemverComparator} : /* istanbul ignore next */ undefined;
