sap.ui.define([], () => {
	return Controller.extend("application.a.controller.Test",{
		onInit() {
			const z = {
				first: {
					a: 1,
					b: 2,
					c: 3
				},
				second: "test"
			};
			console.log(z.first.a);
		}
	});
});

