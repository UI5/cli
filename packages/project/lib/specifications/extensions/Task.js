import path from "node:path";
import Extension from "../Extension.js";
import {pathToFileURL} from "node:url";
import {validateDescriptor} from "../../build/helpers/StepRunner.js";

/**
 * Task
 *
 * @public
 * @class
 * @alias @ui5/project/specifications/extensions/Task
 * @extends @ui5/project/specifications/Extension
 * @hideconstructor
 */
class Task extends Extension {
	#descriptorPromises = new Map();

	constructor(parameters) {
		super(parameters);
	}

	/* === Attributes === */
	/**
	 * The task module's default export.
	 *
	 * From Specification Version 5.0 this is the task factory <code>(options) =&gt; descriptor</code>; use
	 * {@link #getDescriptor} to obtain the validated descriptor. Below 5.0 it is the legacy task body that
	 * is invoked directly during the build (any value it returns is ignored).
	 *
	 * @public
	 */
	async getTask() {
		return (await this._getImplementation()).default;
	}

	/**
	 * Resolves and validates the task descriptor by calling the task factory (the default export) once with
	 * the given options. The result is memoized per runtime <code>taskName</code>, so a factory that branches
	 * on <code>options</code> (for example on <code>projectNamespace</code>) is called exactly once per build
	 * and the same descriptor is shared by the build-signature phase and task execution. Keyed by
	 * <code>taskName</code> rather than once per instance because one task extension can back more than one
	 * runtime task (a repeated configuration gets a <code>--&lt;number&gt;</code> suffix) with different options.
	 *
	 * Only valid from Specification Version 5.0. If the descriptor declares a <code>specVersion</code>, it must
	 * be equal to this task extension's configured Specification Version (the task extension's own
	 * <code>ui5.yaml</code> value, which is unrelated to the Specification Version of the project being built).
	 *
	 * @public
	 * @param {string} taskName Runtime task name (memoization key)
	 * @param {object} options Options passed to the factory
	 * @returns {Promise<object>} The validated descriptor
	 */
	async getDescriptor(taskName, options) {
		let descriptorPromise = this.#descriptorPromises.get(taskName);
		if (!descriptorPromise) {
			descriptorPromise = (async () => {
				const factory = (await this._getImplementation()).default;
				const descriptor = await factory(options);
				validateDescriptor(descriptor, {taskName});
				if (descriptor.specVersion !== undefined &&
					!this.getSpecVersion().eq(descriptor.specVersion)) {
					throw new Error(
						`Custom task ${this.getName()} declares Specification Version ` +
						`${descriptor.specVersion} in its default export, which does not match the task ` +
						`extension's configured Specification Version ${this.getSpecVersion().toString()}`);
				}
				return descriptor;
			})();
			this.#descriptorPromises.set(taskName, descriptorPromise);
		}
		return descriptorPromise;
	}

	/**
	 * The task's <code>determineRequiredDependencies</code> callback. From Specification Version 5.0 it is a
	 * property of the descriptor the factory returns; below 5.0 it is a top-level named export of the task
	 * module (legacy). Returns <code>undefined</code> if the task does not define it.
	 *
	 * @public
	 * @param {string} [taskName] Runtime task name (required at Specification Version 5.0)
	 * @param {object} [options] Options passed to the factory (required at Specification Version 5.0)
	 */
	async getRequiredDependenciesCallback(taskName, options) {
		if (this.getSpecVersion().gte("5.0")) {
			return (await this.getDescriptor(taskName, options)).determineRequiredDependencies;
		}
		return (await this._getImplementation()).determineRequiredDependencies;
	}

	/**
	 * The task's <code>determineBuildSignature</code> callback. From Specification Version 5.0 it is a
	 * property of the descriptor the factory returns; below 5.0 the callback is not supported and this
	 * returns <code>undefined</code>.
	 *
	 * @public
	 * @param {string} [taskName] Runtime task name (required at Specification Version 5.0)
	 * @param {object} [options] Options passed to the factory (required at Specification Version 5.0)
	 */
	async getDetermineBuildSignatureCallback(taskName, options) {
		if (this.getSpecVersion().gte("5.0")) {
			return (await this.getDescriptor(taskName, options)).determineBuildSignature;
		}
		return undefined;
	}

	/**
	 * Whether the task opts into the step-based build API, derived from the descriptor carrying a
	 * <code>steps</code> array (Specification Version 5.0 and later). Always <code>false</code> below 5.0,
	 * where the default export is the legacy task body.
	 *
	 * @public
	 * @param {string} [taskName] Runtime task name (required at Specification Version 5.0)
	 * @param {object} [options] Options passed to the factory (required at Specification Version 5.0)
	 * @returns {Promise<boolean>} <code>true</code> if the descriptor defines <code>steps</code>
	 */
	async getStepBased(taskName, options) {
		if (this.getSpecVersion().gte("5.0")) {
			return !!(await this.getDescriptor(taskName, options)).steps;
		}
		return false;
	}

	/**
	 * The task's <code>determineExpectedOutput</code> callback. From Specification Version 5.0 it is a
	 * property of the descriptor; below 5.0 it is a top-level named export. Currently parsed but not
	 * consumed anywhere.
	 *
	 * @public
	 * @param {string} [taskName] Runtime task name (required at Specification Version 5.0)
	 * @param {object} [options] Options passed to the factory (required at Specification Version 5.0)
	 */
	async getExpectedOutputCallback(taskName, options) {
		if (this.getSpecVersion().gte("5.0")) {
			return (await this.getDescriptor(taskName, options)).determineExpectedOutput;
		}
		return (await this._getImplementation()).determineExpectedOutput;
	}

	/* === Internals === */
	/**
	 * @private
	*/
	async _getImplementation() {
		if (!this._modulePromise) {
			const taskPath = path.join(this.getRootPath(), this._config.task.path);
			this._modulePromise = import(pathToFileURL(taskPath).href);
		}
		return this._modulePromise;
	}

	/**
	 * @private
	*/
	async _validateConfig() {
		// TODO: Move to validator
		if (/--\d+$/.test(this.getName())) {
			throw new Error(`Task name must not end with '--<number>'`);
		}
		// TODO: Check that paths exist
	}
}

export default Task;
