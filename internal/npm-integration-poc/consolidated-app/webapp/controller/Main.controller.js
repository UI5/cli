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

			// Initialize chart after view is rendered
			this.getView().addEventDelegate({
				onAfterRendering: this._initChart.bind(this)
			});
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

		_initChart: function() {
			// Only init once
			if (this._chartInitialized) return;
			this._chartInitialized = true;

			const canvas = document.getElementById("myChart");
			if (!canvas) {
				console.error("Chart canvas not found");
				return;
			}

			// Chart.js v4+ requires explicit registration of components
			const {Chart, BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend} = chartjs;
			Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

			// Generate random data
			const labels = ["January", "February", "March", "April", "May", "June"];
			const randomData = labels.map(() => Math.floor(Math.random() * 100));
			const randomData2 = labels.map(() => Math.floor(Math.random() * 100));

			// Create chart using Chart.js
			this._chart = new Chart(canvas, {
				type: "bar",
				data: {
					labels: labels,
					datasets: [
						{
							label: "Sales 2025",
							data: randomData,
							backgroundColor: "rgba(54, 162, 235, 0.6)",
							borderColor: "rgba(54, 162, 235, 1)",
							borderWidth: 1
						},
						{
							label: "Sales 2026",
							data: randomData2,
							backgroundColor: "rgba(255, 99, 132, 0.6)",
							borderColor: "rgba(255, 99, 132, 1)",
							borderWidth: 1
						}
					]
				},
				options: {
					responsive: true,
					plugins: {
						title: {
							display: true,
							text: "Random Sales Data (Chart.js via NPM)"
						}
					},
					scales: {
						y: {
							beginAtZero: true
						}
					}
				}
			});

			console.log("✅ Chart.js chart rendered successfully");
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
