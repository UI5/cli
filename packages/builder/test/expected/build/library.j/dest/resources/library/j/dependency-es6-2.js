/*!
 * ${copyright}
 */

/**
 * Covers:
 * - ArrowFunctionExpression
 */
window.someRandomModule ||
	sap.ui.define(
		["./a"],
		/**
		 * Constructor for a new library.j.aaa.
		 *
		 * @param {string} [sId] ID for the new control, generated automatically if no ID is given
		 * @param {object} [mSettings] Initial settings for the new control
		 *
		 * @class
		 *
		 * @author SAP SE
		 * @version ${version}
		 *
		 * @constructor
		 * @extends library.j.a
		 * @public
		 * @since 1.22
		 * @alias library.j.aaa
		 * @ui5-metamodel This control will also be described in the UI5 (legacy) design time meta model.
		 */
		(a) =>
			a.extend(`library.j.aaa`, {
				metadata: {
					properties: {
						/**
						 * MyProp property
						 * @since 1.46
						 */
						MyProp: {
							type: "boolean",
							group: `Misc`,
							defaultValue: false,
						},
					},
				},
			})
	);
