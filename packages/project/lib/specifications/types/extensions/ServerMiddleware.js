const path = require("path");
const Extension = require("../../Extension");

class ServerMiddleware extends Extension {
	constructor(parameters) {
		super(parameters);
	}

	/* === Attributes === */
	/**
	* @public
	*/
	getMiddleware() {
		const middlewarePath = path.join(this.getPath(), this._config.middleware.path);
		return require(middlewarePath);
	}
}

module.exports = ServerMiddleware;
