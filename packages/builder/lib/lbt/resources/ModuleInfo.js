"use strict";

/**
 * A strict dependency always has to be fulfilled and is declared as part of the module's definition.
 *
 * @private
 */
const STRICT = 0;

/**
 * An implicit dependency is also strict, but has not been declared. E.g. each UI5 module depends on
 * jquery.sap.global.
 *
 * @private
 */
const IMPLICIT = 1;

/**
 * A conditional dependency has to be resolved only under certain conditions that typically are
 * checked at runtime.
 *
 * @private
 */
const CONDITIONAL = 2;

const Format = {
	UI5_LEGACY: "ui5-declare",
	UI5_DEFINE: "ui5-define",
	AMD: "amd"
};

/**
 * Information about an existing Module and its dependencies.
 *
 * @author Frank Weigel
 * @since 1.1.2
 * @private
 */
class ModuleInfo {
	constructor(name) {
		this._name = name;
		this.subModules = [];
		this._dependencies = {};
		this.dynamicDependencies = false;

		/**
		 * Description of the module
		 */
		this.description = undefined;

		/**
		 * Module format used by this module.
		 *
		 * @type {Format}
		 */
		this.format = undefined;

		/**
		 * 'raw' modules are modules that don't use UI5's module system (require/declare)
		 * TODO align with module format (ui5, amd, es6, raw)
		 *
		 * A raw module is a module which does not have in its non-conditional execution:
		 * <ul>
		 * <li>sap.ui.define call</li>
		 * <li>jQuery.sap.declare call</li>
		 * </ul>
		 */
		this.rawModule = false;

		/**
		 * Whether the module requires top level scope (true) or whether it can be embedded
		 * in another function scope (e.g. for preload).
		 *
		 * Even when a module declares top level variables, it might be possible to embed it
		 * when all of the following criteria are met:
		 * <ul>
		 * <li>all relevant global variables are set during the execution of the module
		 * <li>all relevant global variables are treated like "const", e.g. they are only
		 *		 set once and not modified afterwards
		 * </ul>
		 *
		 * The module analyzer doesn't recognize whether these criteria are met.
		 * Instead, developers can provide this information in the raw-modules section of
		 * the corresponding .library file. By default, any modules is assumed NOT to require
		 * global scope. If a module declares global variables, all of them will be exported
		 * with additional code of the form:
		 *
		 * <pre>
		 *	 this["name"] = name;
		 * </pre>
		 *
		 * To avoid this, developers can either add "name" to the <code>ignoreGlobals</code>
		 * attribute of a raw-module or they can completely suppress embedding of the module
		 * by setting the <code>requiresTopLevelScope</code> attribute to <code>true</code>.
		 *
		 * @returns	Whether the module requires top level scope.
		 */
		this.requiresTopLevelScope = false;

		/**
		 * Global names that the module exposes intentionally and that should be exported
		 * when the module is wrapped in another scope (e.g. for function preload).
		 *
		 * Implementation Note: during module analysis, this collections contains all global names.
		 * Based on external metadata (shims), ignorable names are removed from the collection.
		 */
		this.exposedGlobals = undefined;
	}

	_addDependency(dependency, kind) {
		// add the dependency only when it is defined, not empty,
		// not equal to the current module itself and if the same module is not
		// included already as a submodule.
		// If the dependency was known already, update the kind
		// only when the new kind is stronger than the current one.
		// STRICT is stronger than IMPLICIT, IMPLICIT is stronger than CONDITIONAL
		if ( dependency &&
				dependency !== this.name &&
				this.subModules.indexOf(dependency) < 0 &&
				( !(dependency in this._dependencies) || kind < this._dependencies[dependency]) ) {
			this._dependencies[dependency] = kind;
		}
	}

	addImplicitDependency(dependency) {
		this._addDependency(dependency, IMPLICIT);
	}

	addDependency(dependency, conditional) {
		this._addDependency(dependency, conditional ? CONDITIONAL : STRICT);
	}

	setFormat(detectedFormat) {
		if ( this.format == null ||
				detectedFormat === Format.UI5_LEGACY ||
				(detectedFormat === Format.UI5_DEFINE && this.format !== Format.UI5_LEGACY) ) {
			this.format = detectedFormat;
		}
	}

	/**
	 * Adds the given module as a sub module to this module.
	 *
	 * If the module is an instanceof ModuleInfo, its name is added to submodules,
	 * its dependencies become dependencies of this module (if they are not already
	 * included as submodules). If the included module has calculated (dynamic)
	 * dependencies, then this module inherits this 'quality'.
	 *
	 * Other data (like size, top level vars etc.) is not aggregated here as
	 * the correct aggregation highly depends on the way how the module is merged
	 * (preload, legacy embedding, raw module, ...)
	 *
	 * If other is a string, it is simply added to subModules.
	 *
	 * @param {string | ModuleInfo} other Module to include into this module
	 */
	addSubModule( other ) {
		if ( other instanceof ModuleInfo ) {
			this.addSubModule( other.name );
			// accumulate dependencies
			for ( const dep of Object.keys(other._dependencies ) ) {
				this._addDependency(dep, other._dependencies[dep]);
			}
			// inherit dynamic dependencies
			if ( other.dynamicDependencies ) {
				this.dynamicDependencies = true;
			}
		} else {
			this.subModules.push( other );
			// when a module is added as submodule, it no longer is a dependency
			delete this._dependencies[other];
		}
	}

	isConditionalDependency(dependency) {
		return this._dependencies[dependency] === CONDITIONAL;
	}

	isImplicitDependency(dependency) {
		return this._dependencies[dependency] === IMPLICIT;
	}

	get name() {
		return this._name;
	}

	set name(n) {
		this._name = n;
		if ( n != null ) {
			if ( Object.prototype.hasOwnProperty.call(this._dependencies, n) ) {
				delete this._dependencies[n];
			}

			const idx = this.subModules.indexOf(n);
			if ( idx >= 0 ) {
				this.subModules.splice(idx, 1);
			}
		}
	}

	get dependencies() {
		return Object.keys(this._dependencies);
	}

	/**
	 * Removes the given set of `ignoredGlobals` from the set of exposed global names.
	 *
	 * @param {string[]} ignoredGlobals Names to ignore (determined from shims in .library)
	 */
	removeIgnoredGlobalNames(ignoredGlobals) {
		if ( this.exposedGlobals ) {
			const remaining = this.exposedGlobals.filter((global) => !ignoredGlobals.includes(global));
			this.exposedGlobals = remaining.length > 0 ? remaining : null;
		}
	}

	toString() {
		return "ModuleInfo(" +
			this.name +
			", dependencies=" + this.dependencies +
			", includes=" + this.subModules +
			")";
	}
}

// expose format enum
ModuleInfo.Format = Format;

/* NODE-TODO
public class ModuleInfo {

	private String resourcePath;

	private String description;

	private File file;

	private long size;

	private long compressedSize = -1;

	private boolean rawModule;

	/**
	 * Whether the module must not run automatically (e.g. because it is to be used only in certain contexts)
	 *
	 * This is relevant during the generation of the all-in-one files.
	 *
	private boolean excludeFromAllInOne;

} */

module.exports = ModuleInfo;
