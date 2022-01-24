sap.ui.define([
	'static/module1'
], (m1) => { // using an arrow function for the module factory

	sap.ui.require(['static/module2'], function() {
		sap.ui.require(['static/module3'], function() {});
		sap.ui.require('no-dependency/module1'); // probing API does not introduce a dependency
	});

	// using an arrow function for the require callback
	sap.ui.require([], () => {
		sap.ui.require(['static/module4'], function() {
		});
	});

	// default value in array destructuring
	let [exp1 = sap.ui.require(['conditional/module1'], function(){})] = [];

	// default value in object destructuring
	let {exp2 = sap.ui.require(['conditional/module2'], function(){})} = {};

	// dependency embedded in a template
	let exp3 = `Some text with an embedded dependency ${sap.ui.require(['static/module5'], function(){})} and further text`;

	// dependency embedded in a tagged template
	let exp4 = html`Some text with an embedded dependency ${sap.ui.require(['static/module6'], function(){})} and further text`;

	// IIAFE (an immediately invoked arrow function expression)
	((() => {
		sap.ui.require(['static/module7'], function(){});
	})());

	// a not immediately executed arrow function
	let helper = (() => {
		sap.ui.require(['conditional/module3'], function(){});
	});

	// async / await
	const myFunction = async function() {
		await Promise.resolve();
	};

	// chain expression
	if (m1?.foo?.bar) {
		sap.ui.require(["conditional/module4"]);
	}

});
