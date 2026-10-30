/**
 * Parses a Maven snapshot endpoint or redirect target and enforces the HTTPS transport.
 *
 * @param {string} value URL to validate. May be a relative redirect target when base is provided.
 * @param {string} [base] Absolute URL that a relative value is resolved against.
 * @returns {string} The normalized absolute HTTPS URL.
 * @throws If the value does not parse or does not use the https: scheme.
 */
export default function validateUrl(value, base) {
	let url;
	try {
		url = new URL(value, base);
	} catch {
		// A parse failure falls through to the shared error below. That error names the
		// configuration options without echoing the rejected value or any embedded credentials.
	}
	if (url?.protocol !== "https:") {
		throw new Error("Maven snapshot requests require a valid HTTPS URL, including redirect targets. " +
			"Check mavenSnapshotEndpointUrl, UI5_MAVEN_SNAPSHOT_ENDPOINT_URL, " +
			"the resolver snapshotEndpointUrl option, or Maven settings.xml.");
	}
	return url.href;
}

/**
 * Removes any credentials from a URL so it can be logged or shown to the user. UI5 snapshot
 * endpoints usually carry no credentials, but a settings.xml URL can, so strip them defensively.
 *
 * @param {string} url Absolute URL, typically the output of {@link validateUrl}.
 * @returns {string} The URL with username and password removed.
 */
export function redactUrl(url) {
	const redacted = new URL(url);
	redacted.username = "";
	redacted.password = "";
	return redacted.href;
}
