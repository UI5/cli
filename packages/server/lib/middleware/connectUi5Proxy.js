const ui5connect = require("connect-openui5");

function createMiddleware() {
	return ui5connect.proxy({
		secure: false
	});
}

module.exports = createMiddleware;
