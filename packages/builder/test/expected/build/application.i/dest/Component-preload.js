//@ui5-bundle application/i/Component-preload.js
jQuery.sap.registerPreloadedModules({
"version":"2.0",
"modules":{
	"application/i/Component.js":function(){sap.ui.define(["sap/ui/core/UIComponent"],function(n){"use strict";return n.extend("application.i.Component",{metadata:{manifest:"json"}})});
},
	"application/i/changes/changes-bundle.json":'[{"fileName":"id_456_addField","fileType":"change","changeType":"hideControl","component":"application.i.Component","content":{},"selector":{"id":"control1"},"layer":"VENDOR","texts":{},"namespace":"apps/application.i.Component/changes","creation":"2023-10-30T13:52:40.4754350Z","originalLanguage":"","conditions":{},"support":{"generator":"did it","user":"Max Mustermann"}},{"fileName":"id_123_addField","fileType":"change","changeType":"hideControl","component":"application.i.Component","content":{},"selector":{"id":"control1"},"layer":"VENDOR","texts":{},"namespace":"apps/application.i.Component/changes","creation":"2025-10-30T13:52:40.4754350Z","originalLanguage":"","conditions":{},"support":{"generator":"did it","user":"Max Mustermann"}}]',
	"application/i/changes/coding/MyExtension.js":function(){sap.ui.define([],function(){return{}});
},
	"application/i/changes/fragments/MyFragment.fragment.xml":'<xml/>',
	"application/i/manifest.json":'{"_version":"1.1.0","sap.app":{"_version":"1.1.0","id":"application.i","type":"application","applicationVersion":{"version":"1.2.2"},"embeds":["embedded"],"title":"{{title}}"},"sap.ui5":{"dependencies":{"libs":{"sap.ui.layout":{},"sap.ui.core":{},"sap.m":{},"sap.ui.fl":{}}}}}'
}});
