window["sap-ui-optimized"] = true;
try {
// sap/ui/Device
if(window.jQuery&&window.jQuery.sap&&window.jQuery.sap.declare){window.jQuery.sap.declare("sap.ui.Device",false);}
(function(){"use strict";var d={};if(sap.ui.define){sap.ui.define("sap/ui/Device",[],function(){return d;});}}());
// sap/ui/thirdparty/URI.js
(function(r,f){
if(typeof exports==='object'){module.exports=f(require('./punycode'),require('./IPv6'),require('./SecondLevelDomains'));}
else if(typeof define==='function'&&define.amd){r.URI=f(r.punycode,r.IPv6,r.SecondLevelDomains,r);define('sap/ui/thirdparty/URI',[],function(){return r.URI;});}
else{r.URI=f(r.punycode,r.IPv6,r.SecondLevelDomains,r);}
}(this,function(a,I,S,r){}));
// sap/ui/thirdparty/es6-promise.js
(function(){
if(typeof define==='function'&&define['amd']){define('sap/ui/thirdparty/es6-promise',function(){return {};});}
else if(typeof module!=='undefined'&&module['exports']){module['exports']={};}
if(typeof this!=='undefined'){this['ES6Promise']={};}}).call(this);
// sap/ui/thirdparty/jquery.js
(function(g,f){}());
// sap/ui/thirdparty/jqueryui/jquery-ui-position.js
(function($){$.ui=$.ui||{};}(jQuery));
// jquery.sap.global.js
(function(){}());
jQuery.sap.globalEval=function(){"use strict";eval(arguments[0]);};
jQuery.sap.declare('sap-ui-core');
jQuery.sap.declare('sap.ui.Device', false);
jQuery.sap.declare('sap.ui.thirdparty.URI', false);
jQuery.sap.declare('sap.ui.thirdparty.es6-promise', false);
jQuery.sap.declare('sap.ui.thirdparty.jquery', false);
jQuery.sap.declare('sap.ui.thirdparty.jqueryui.jquery-ui-position', false);
jQuery.sap.declare('jquery.sap.global', false);
sap.ui.predefine('jquery.sap.act',['jquery.sap.global'],function(q){});
sap.ui.predefine('jquery.sap.encoder',['jquery.sap.global'],function(q){});
sap.ui.predefine('jquery.sap.events',['jquery.sap.global','sap/ui/Device','jquery.sap.keycodes','jquery.sap.dom','jquery.sap.script',"sap/ui/thirdparty/jquery-mobile-custom"],function(){});
sap.ui.predefine('jquery.sap.keycodes',['jquery.sap.global'],function(){});
sap.ui.predefine('sap/ui/base/DataType',['jquery.sap.global'],function(){}, true);
sap.ui.predefine('sap/ui/base/Event',['jquery.sap.global','./Object'],function(){});
sap.ui.predefine('sap/ui/base/ManagedObject',['jquery.sap.global','./BindingParser','./DataType','./EventProvider','./ManagedObjectMetadata','../model/BindingMode','../model/CompositeBinding','../model/Context','../model/FormatException','../model/ListBinding','../model/Model','../model/ParseException','../model/TreeBinding','../model/Type','../model/ValidateException','jquery.sap.act','jquery.sap.script','jquery.sap.strings'],function(){});
sap.ui.predefine('sap/ui/core/Core',['jquery.sap.global','sap/ui/Device','sap/ui/Global','sap/ui/base/BindingParser','sap/ui/base/DataType','sap/ui/base/EventProvider','sap/ui/base/Interface','sap/ui/base/Object','sap/ui/base/ManagedObject','./Component','./Configuration','./Control','./Element','./ElementMetadata','./FocusHandler','./RenderManager','./ResizeHandler','./ThemeCheck','./UIArea','./message/MessageManager','jquery.sap.act','jquery.sap.dom','jquery.sap.events','jquery.sap.mobile','jquery.sap.properties','jquery.sap.resources','jquery.sap.script','jquery.sap.sjax'],function(){});
jQuery.sap.registerPreloadedModules({
"name":"sap-ui-core-preload",
"version":"2.0",
"modules":{
	"sap/ui/thirdparty/jquery-mobile-custom.js":function(){
		(function(r,d,f){
			if(typeof define==="function"&&define.amd){define(["jquery"],function($){f($,r,d);return $.mobile;});}
			else{f(r.jQuery,r,d);}}());
	}
}});
sap.ui.requireSync("sap/ui/core/Core");
// as this module contains the Core, we ensure that the Core has been booted
sap.ui.getCore().boot && sap.ui.getCore().boot();
} catch(oError) {
if (oError.name != "Restart") { throw oError; }
}
