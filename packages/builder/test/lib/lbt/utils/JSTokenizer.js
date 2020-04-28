const test = require("ava");
const JSTokenizer = require("../../../../lib/lbt/utils/JSTokenizer");

test("valid expressions", function(t) {
	const list = [
		"{}",
		"{test:'123'}",
		"{test:456.00}",
		"{test:-456}",
		"{test:-456e9}",
		"{test:77E-4}",
		"{test:\"123\"}",
		"{23:'test'}",
		"{'23':'test'}",
		"{aa:'123', bb:'456'}",
		"{a1:123, b2:'456', c3:false, c4:true, d5:null}",
		"{a:{}, b:[], c:'test'}",
		"{a:{a:{a:{a:{a:{}}}}}}",
		"{$a:{$a:{$a:{$a:{$a:{}}}}}}",
		"{arr:[1,2,3,4]}",
		"{arr:[1,'2',3,false]}",
		"{test:'{test}'}",
		"{test:'\\'\"\\\\'}"
	];
	for (let i = 0; i < list.length; i++) {
		let evalResult;
		eval("evalResult=" + list[i]); // eslint-disable-line no-eval
		t.deepEqual(JSTokenizer.parseJS(list[i]), evalResult, "Parse " + list[i]);
	}
});

test("invalid expressions", function(t) {
	[
		"{[}",
		"{test:'123\"}",
		"{test:\"123}",
		"{23a:'test'}",
		"{aa:'123' bb:'456'}",
		"{a1:123a, b2:'456', c3:false}",
		"{a:{}, b:[}, c:'test'}",
		"{a:{a:{a:{a:{a:{}}}}}}}",
		"{arr:[1,2,3,4,,]}",
		"{arr:[1,'2,3,false]}",
		"{test:'{test}',test}",
		"{test:''\"\\'}"
	].forEach(function(input) {
		t.throws(function() {
			try {
				JSTokenizer.parseJS(input);
			} catch (e) {
				// Wrap as Error as JSTokenizer might just throw an object
				// which is not accepted as error by ava
				throw new Error(e);
			}
		});
	});
});

test("tokenizer with enhancements getCh, getIndex, init, setIndex", function(t) {
	const oTokenizer = new JSTokenizer();
	const oTokenizer2 = new JSTokenizer();

	oTokenizer.init("{='foo'}");
	t.is(oTokenizer.getIndex(), -1, "index after init without start index");
	t.is(oTokenizer.getCh(), " ");

	oTokenizer.init("{='foo'}", 2);
	t.is(oTokenizer.getIndex(), 1, "index after init with start index");
	t.is(oTokenizer.getCh(), " ");

	oTokenizer.next();
	t.is(oTokenizer.getIndex(), 2, "index after next");
	t.is(oTokenizer.getCh(), "'");

	oTokenizer.setIndex(7);
	t.is(oTokenizer.getIndex(), 7, "index after setIndex");
	t.is(oTokenizer.getCh(), "}");

	t.throws(function() {
		oTokenizer.setIndex(0);
	}, {message: /Must not set index 0 before previous index 7/}, "setIndex must not go back in text");
	oTokenizer.setIndex(42);
	t.is(oTokenizer.getCh(), "", "move index beyond text end");

	oTokenizer2.init("{='other foo'}");
	t.true(oTokenizer2.getIndex() !== oTokenizer.getIndex(), "different instances");
});
