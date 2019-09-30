//@ui5-bundle sap-ui-core.js
window["sap-ui-optimized"] = true;
try {
//@ui5-bundle-raw-include sap/ui/thirdparty/baseuri.js
if(!('baseURI'in Node.prototype)){}
//@ui5-bundle-raw-include sap/ui/thirdparty/es6-promise.js
(function(g,f){
g.ES6Promise=f();}(this,(function(){})));
//@ui5-bundle-raw-include sap/ui/thirdparty/es6-shim-nopromise.js
(function(r,f){}());
//@ui5-bundle-raw-include ui5loader.js
(function(__global){}(window));
//@ui5-bundle-raw-include ui5loader-autoconfig.js
(function(){"use strict";
var h=u._.defineModuleSync;
h('ui5loader.js',null);
}());

sap.ui.predefine('jquery.sap.global',["sap/base/util/now","sap/base/util/Version","sap/base/assert","sap/base/Log","sap/ui/dom/getComputedStyleFix","sap/ui/dom/activeElementFix","sap/ui/dom/includeScript","sap/ui/dom/includeStylesheet","sap/ui/core/support/Hotkeys","sap/ui/security/FrameOptions","sap/ui/performance/Measurement","sap/ui/performance/trace/Interaction","sap/ui/base/syncXHRFix","sap/base/util/LoaderExtensions","sap/ui/Device","sap/ui/thirdparty/URI","sap/ui/thirdparty/jquery","sap/ui/thirdparty/jqueryui/jquery-ui-position","ui5loader-autoconfig","jquery.sap.stubs"],function(now,Version,assert,Log,getComputedStyleFix,activeElementFix,includeScript,includeStylesheet,SupportHotkeys,FrameOptions,Measurement,Interaction,syncXHRFix,LoaderExtensions,Device,URI,jQuery){
});
sap.ui.predefine('jquery.sap.stubs',["sap/base/Log","sap/base/util/defineLazyProperty","sap/ui/thirdparty/jquery"],function(){});
sap.ui.predefine('sap/base/Log',["sap/base/util/now"],function(){});
sap.ui.predefine('sap/base/assert',["./Log"],function(){});
sap.ui.predefine('sap/ui/base/DataType',['sap/base/util/ObjectPath',"sap/base/assert","sap/base/Log","sap/base/util/isPlainObject"],function(){},true);
sap.ui.predefine('sap/ui/base/Event',['./Object',"sap/base/assert"],function(){});
sap.ui.predefine('sap/ui/base/ManagedObject',['./BindingParser','./DataType','./EventProvider','./ManagedObjectMetadata','./Object','../model/BindingMode','../model/StaticBinding','../model/CompositeBinding','../model/Context','../model/FormatException','../model/ParseException','../model/Type','../model/ValidateException',"sap/ui/base/SyncPromise","sap/ui/util/ActivityDetection","sap/base/util/ObjectPath","sap/base/Log","sap/base/assert","sap/base/util/deepClone","sap/base/util/deepEqual","sap/base/util/uid","sap/ui/thirdparty/jquery"],function(){});
sap.ui.predefine('sap/ui/core/Core',['jquery.sap.global','sap/ui/Device','sap/ui/Global','sap/ui/base/BindingParser','sap/ui/base/DataType','sap/ui/base/EventProvider','sap/ui/base/Interface','sap/ui/base/Object','sap/ui/base/ManagedObject','./Component','./Configuration','./Control','./Element','./ElementMetadata','./FocusHandler','./RenderManager','./ResizeHandler','./ThemeCheck','./UIArea','./message/MessageManager',"sap/ui/util/ActivityDetection","sap/ui/dom/getScrollbarSize","sap/base/i18n/ResourceBundle","sap/base/Log","sap/ui/performance/Measurement","sap/ui/security/FrameOptions","sap/base/assert","sap/ui/dom/includeStylesheet","sap/base/util/ObjectPath","sap/base/util/Version","sap/base/util/array/uniqueSort","sap/base/util/uid",'sap/ui/performance/trace/initTraces','sap/base/util/LoaderExtensions','sap/base/util/isEmptyObject','sap/base/util/each','sap/ui/events/jquery/EventSimulation'],function(){}());
sap.ui.require.preload({
	"sap/ui/thirdparty/URI.js":function(){},
	"sap/ui/thirdparty/jqueryui/jquery-ui-position.js":function(){},
	"sap/ui/Device.js":function(){},
	"sap/ui/thirdparty/jquery.js":function(){},
	"sap/ui/thirdparty/jquery-mobile-custom.js":function(){}
},"sap-ui-core-preload");
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
