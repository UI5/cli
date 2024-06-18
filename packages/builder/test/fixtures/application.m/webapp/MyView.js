#!/usr/bin/env node
sap.ui.define([
	"sap/ui/core/mvc/View",
	"sap/m/Button"
  ], (View, Button) => {
	"use strict";
	return View.extend("application.m.MyView", {
	  async createContent() {
		return new Button({
		  id: this.createId("myButton"),
		  text: "My Button"
		});
	  }
	});
  });
