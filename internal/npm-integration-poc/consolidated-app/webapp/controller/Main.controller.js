sap.ui.define([
	"sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageToast",
	"thirdparty/validator", // NPM package (auto-bundled by ui5-tooling-modules)
	"thirdparty/chart.js"
], function(Controller, JSONModel, MessageToast, validator, chartjs) {
	"use strict";

	return Controller.extend("com.example.app.controller.Main", {

		onInit: function() {
			// Initialize model
			const oModel = new JSONModel({
				email: "",
				url: "",
				comment: "",
				emailState: "None",
				emailStateText: "",
				urlState: "None",
				urlStateText: ""
			});
			this.getView().setModel(oModel);

			// Log that validator is loaded
			console.log("✅ Validator.js loaded:", typeof validator);
			console.log("   Available methods:", Object.keys(validator).slice(0, 10).join(", "), "...");
			
			console.log("✅ Chart.js loaded:", chartjs);
		},

		onValidate: function() {
			const oModel = this.getView().getModel();
			const email = oModel.getProperty("/email");
			const url = oModel.getProperty("/url");
			const comment = oModel.getProperty("/comment");

			// Validate email using validator.js
			const isEmailValid = validator.isEmail(email);
			oModel.setProperty("/emailState", isEmailValid ? "Success" : "Error");
			oModel.setProperty("/emailStateText", isEmailValid ? "Valid email" : "Invalid email format");

			// Validate URL using validator.js
			const isUrlValid = url ? validator.isURL(url) : false;
			oModel.setProperty("/urlState", isUrlValid ? "Success" : (url ? "Error" : "None"));
			oModel.setProperty("/urlStateText", isUrlValid ? "Valid URL" : (url ? "Invalid URL format" : ""));

			// Sanitize comment using validator.js
			const sanitizedComment = validator.escape(comment);

			// Show results
			this.byId("resultPanel").setVisible(true);
			this.byId("emailResult").setText(
				isEmailValid ?
					"✅ Email is valid: " + email :
					"❌ Email is invalid"
			);
			this.byId("urlResult").setText(
				isUrlValid ?
					"✅ URL is valid: " + url :
					url ? "❌ URL is invalid" : "ℹ️ No URL provided"
			);
			this.byId("sanitizedResult").setText(
				sanitizedComment || "ℹ️ No comment provided"
			);

			// Show toast
			if (isEmailValid && (isUrlValid || !url)) {
				MessageToast.show("✅ Validation successful!");
			} else {
				MessageToast.show("❌ Validation failed - please check the fields");
			}

			// Log validation results
			console.log("Validation results:", {
				email: {value: email, valid: isEmailValid},
				url: {value: url, valid: isUrlValid},
				comment: {original: comment, sanitized: sanitizedComment}
			});
		},

		onReset: function() {
			const oModel = this.getView().getModel();
			oModel.setData({
				email: "",
				url: "",
				comment: "",
				emailState: "None",
				emailStateText: "",
				urlState: "None",
				urlStateText: ""
			});
			this.byId("resultPanel").setVisible(false);
			MessageToast.show("Form reset");
		},

		onWebComponentClick: function() {
			// Toggle the bundled MessageStrip visibility
			const oMessageStrip = this.byId("bundledMessageStrip");

			if (!oMessageStrip) {
				MessageToast.show("❌ MessageStrip control not found");
				console.error("MessageStrip not found - check if webc.hardcoded.namespace loaded");
				return;
			}

			const bVisible = oMessageStrip.getVisible();
			oMessageStrip.setVisible(!bVisible);

			if (!bVisible) {
				MessageToast.show("✅ MessageStrip shown (bundled from @ui5/webcomponents)");
				console.log("✅ MessageStrip: webc/hardcoded/namespace/MessageStrip");
			} else {
				MessageToast.show("MessageStrip hidden");
			}
		}

	});
});
