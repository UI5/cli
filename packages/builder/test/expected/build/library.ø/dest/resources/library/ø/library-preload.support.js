//@ui5-bundle library/ø/library-preload.support.js
/*!
 * Some fancy copyright
 */
/**
 * Defines support rules
 */
 sap.ui.predefine("library/ø/rules/MyControl.support", ['sap/ui/support/library', 'sap/base/Log'],
 function(SupportLib, Log) {
	 'use strict';

	 //**********************************************************
	 // Rule Definitions
	 //**********************************************************

	 var oRule = {
		id: "oRule",
		audiences: [Audiences.Application],
		categories: [Categories.Usage],
		enabled: true,
		minversion: '1.71',
		title: 'Title',
		description: 'description',
		resolution: 'resolution',
		check: function(oIssueManager, oCoreFacade, oScope) {
			oIssueManager.addIssue({
				severity: Severity.High,
				details: 'Looking good today!'
			});
		}
	};

	 return [
		oRule
	 ];

 }, true);
