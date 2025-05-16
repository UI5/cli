//@ui5-bundle application/o/Component-preload.js
sap.ui.predefine("application/o/test", [],()=>{test(e=>{const s=e;console.log(s)});test()});
sap.ui.require.preload({
	"application/o/i18n/i18n.properties":'welcome=Hello world',
	"application/o/i18n/i18n_en.properties":'welcome=Hello EN world',
	"application/o/i18n/i18n_en_US.properties":'welcome=Hello EN US world',
	"application/o/i18n/i18n_en_US_saptrc.properties":'welcome=Hello EN US saptrc world',
	"application/o/manifest.json":'{"_version":"1.22.0","sap.app":{"id":"application.o","type":"application","applicationVersion":{"version":"1.0.0"},"title":"{{title}}","i18n":{"bundleUrl":"i18n/i18n.properties","supportedLocales":["","en","en-US","en-US-x-saptrc"]}},"sap.ui5":{"models":{"i18n":{"type":"sap.ui.model.resource.ResourceModel","settings":{"bundleName":"application.o.i18n.i18n","supportedLocales":["","en","en-US","en-US-x-saptrc"]}},"i18n-ui5":{"type":"sap.ui.model.resource.ResourceModel","settings":{"bundleUrl":"ui5://application/o/i18n/i18n.properties","supportedLocales":["","en","en-US","en-US-x-saptrc"]}}}}}'
});
//# sourceMappingURL=Component-preload.js.map
