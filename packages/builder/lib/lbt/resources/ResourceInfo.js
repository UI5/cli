/**
 * Information about a single resource as stored in the resources.json file.
 *
 * @author Frank Weigel
 * @since 1.33.0
 */
class ResourceInfo {
	/**
	 * @param {string} name name of the resource
	 */
	constructor(name) {
		this.name = name;
		this.i18nName = null;
		this.i18nLocale = null;
		this.isDebug = false;
		this.theme = null;
		this.merged = false;
		this.designtime = false;
		this.support = false;
		this._module = null;
		this.required = null;
		this.condRequired = null;
		this.included = null;
		this.dynRequired = false;
		this.requiresTopLevelScope = false;
		this.exposedGlobalNames = null;
		this._format = null;
		this._size = -1;
	}


	get module() {
		return this._module;
	}

	set module(value) {
		this._module = value;
	}

	get format() {
		return this._format;
	}

	set format(value) {
		this._format = value;
	}

	get size() {
		return this._size;
	}

	set size(value) {
		this._size = value;
	}

	/**
	 * Copies the properties of the given ResourceInfo into this
	 *
	 * @param {string} prefix
	 * @param {ResourceInfo} orig
	 */
	copyFrom(prefix, orig) {
		this.i18nName = orig.i18nName;
		this.i18nLocale = orig.i18nLocale;
		this.isDebug = orig.isDebug;
		this.theme = orig.theme;
		this.merged = orig.merged;
		this.designtime = orig.designtime;
		this.support = orig.support;
		if ( this.module == null ) {
			this.module = orig.module;
		}
		if ( orig.required != null ) {
			if ( this.required == null ) {
				this.required = new Set();
			}
			orig.required.forEach(this.required.add, this.required);
		}
		if ( orig.condRequired != null ) {
			if ( this.condRequired == null ) {
				this.condRequired = new Set();
			}
			orig.condRequired.forEach(this.condRequired.add, this.condRequired);
		}
		if ( orig.dynRequired ) {
			this.dynRequired = orig.dynRequired;
		}
		if ( orig.included != null ) {
			if ( this.included == null ) {
				this.included = new Set();
			}
			orig.included.forEach(this.included.add, this.included);
		}
		if ( this.included != null && this.included.size > 0 ) {
			this.merged = true;
		}
		if (orig.size >= 0) {
			this.size = orig.size;
		}
		if ( orig.requiresTopLevelScope ) {
			this.requiresTopLevelScope = orig.requiresTopLevelScope;
		}
		if ( orig.exposedGlobalNames != null ) {
			if ( this.exposedGlobalNames == null ) {
				this.exposedGlobalNames = new Set();
			}
			orig.exposedGlobalNames.forEach(this.exposedGlobalNames.add, this.exposedGlobalNames);
		}
		if ( orig.format != null ) {
			this.format = orig.format;
		}
	}

	/**
	 * called from JSON.stringify()
	 *
	 * @returns {{name: *}}
	 */
	toJSON() {
		const result = {
			name: this.name
		};
		if ( this._module != null ) {
			result.module = this.module;
		}
		if ( this.size >= 0 ) {
			result.size = this.size;
		}
		if ( this.requiresTopLevelScope ) {
			result.requiresTopLevelScope = this.requiresTopLevelScope;
		}
		if ( this.exposedGlobalNames != null && this.exposedGlobalNames.size > 0 ) {
			result.exposedGlobalNames = [...this.exposedGlobalNames];
		}
		if ( this.format ) {
			result.format = this.format;
		}

		//

		if ( this.isDebug ) {
			result.isDebug = this.isDebug;
		}
		if ( this.merged ) {
			result.merged = this.merged;
		}
		if ( this.designtime ) {
			result.designtime = this.designtime;
		}
		if ( this.support ) {
			result.support = this.support;
		}
		if ( this.i18nLocale != null ) {
			result.locale = this.i18nLocale;
			result.raw = this.i18nName;
		}
		if ( this.theme != null ) {
			result.theme = this.theme;
		}

		//

		if ( this.required != null && this.required.size > 0 ) {
			result.required = [...this.required].sort();
		}
		if ( this.condRequired != null && this.condRequired.size > 0 ) {
			result.condRequired = [...this.condRequired].sort();
		}
		if ( this.dynRequired ) {
			result.dynRequired = this.dynRequired;
		}
		if ( this.included != null && this.included.size > 0 ) {
			result.included = [...this.included];
		}

		return result;
	}
}

module.exports = ResourceInfo;
