const url = require("url");
const querystring = require("querystring");

const HEADER_CONTENT_SECURITY_POLICY = "Content-Security-Policy";
const HEADER_CONTENT_SECURITY_POLICY_REPORT_ONLY = "Content-Security-Policy-Report-Only";
const rPolicy = /([-_a-zA-Z0-9]+)(:report-only)?/i;

function createMiddleware(sCspUrlParameterName, oConfig) {
	const {
		allowDynamicPolicySelection = false,
		allowDynamicPolicyDefinition = false,
		defaultPolicyIsReportOnly = false
	} = oConfig;

	return function csp(req, res, next) {
		let oPolicy;
		let bReportOnly = defaultPolicyIsReportOnly;

		if (req.method === "POST" &&
			req.headers["content-type"] === "application/csp-report" &&
			req.url.endsWith("/dummy.csplog")
		) {
			// In report-only mode there must be a report-uri defined
			// For now just ignore the violation. It will be logged in the browser anyway.
			return;
		}

		// If a policy with name 'default' is defined, it will even be send without a present URL parameter.
		if (oConfig.definedPolicies["default"]) {
			oPolicy = {
				name: "default",
				policy: oConfig.definedPolicies["default"]
			};
		}

		const oParsedUrl = url.parse(req.url);
		const oQuery = querystring.parse(oParsedUrl.query);
		let sCspUrlParameterValue = oQuery[sCspUrlParameterName];

		if (sCspUrlParameterValue) {
			const mPolicyMatch = rPolicy.exec(sCspUrlParameterValue);

			if (mPolicyMatch && mPolicyMatch[1]
				&& oConfig.definedPolicies[mPolicyMatch[1]] && allowDynamicPolicySelection) {
				oPolicy = {
					name: mPolicyMatch[1],
					policy: oConfig.definedPolicies[mPolicyMatch[1]]
				};
				bReportOnly = mPolicyMatch[2] !== undefined;
			} else if (allowDynamicPolicyDefinition) {
				// Custom CSP policy directives get passed as part of the CSP URL-Parameter value
				bReportOnly = sCspUrlParameterValue.endsWith(":report-only");
				if (bReportOnly) {
					sCspUrlParameterValue = sCspUrlParameterValue.slice(0, - ":report-only".length);
				}
				oPolicy = {
					name: "dynamic-custom-policy",
					policy: sCspUrlParameterValue
				};
			}
		}

		if (oPolicy) {
			const sHeader = bReportOnly ? HEADER_CONTENT_SECURITY_POLICY_REPORT_ONLY : HEADER_CONTENT_SECURITY_POLICY;
			let sHeaderValue;

			if (bReportOnly) {
				// Add dummy report-uri. This is mandatory for the report-only mode.
				sHeaderValue = oPolicy.policy + " report-uri dummy.csplog;";
			} else {
				sHeaderValue = oPolicy.policy;
			}

			// Send response with CSP header
			res.removeHeader(HEADER_CONTENT_SECURITY_POLICY);
			res.removeHeader(HEADER_CONTENT_SECURITY_POLICY_REPORT_ONLY);
			res.setHeader(sHeader, sHeaderValue);
		}

		next();
	};
}

module.exports = createMiddleware;
