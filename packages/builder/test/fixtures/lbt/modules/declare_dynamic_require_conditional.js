jQuery.sap.declare("sap.ui.testmodule");
const Foo = "conditional/module2";
jQuery.sap.require(true ? "conditional/module1" : Foo);
