import ui5connect from "connect-openui5";

function createMiddleware() {
	return ui5connect.proxy({
		secure: false
	});
}

export default createMiddleware;
