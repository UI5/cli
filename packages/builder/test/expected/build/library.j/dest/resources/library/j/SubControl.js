/*!
 * ${copyright}
 */

/**
 * Covers:
 * - ArrowFunctionExpression
 */
 window.someRandomModule ||
 sap.ui.define(
	 ["sap/ui/core/Control"],
	 /**
	  * Constructor for a new library.j.SubControl.
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
	  * @extends sap.ui.core.Control
	  * @public
	  * @since 1.22
	  * @alias library.j.SubControl
	  */
	 (Control) =>
		 Control.extend(`library.j.SubControl`, {
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
