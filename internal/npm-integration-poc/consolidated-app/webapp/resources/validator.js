sap.ui.define("validator", (function() {
	"use strict";

	function getDefaultExportFromCjs(x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
	}

	const validator = {exports: {}};

	const toDate = {exports: {}};

	const assertString = {exports: {}};

	let hasRequiredAssertString;

	function requireAssertString() {
		if (hasRequiredAssertString) return assertString.exports;
		hasRequiredAssertString = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = assertString;
			function assertString(input) {
			  if (input === undefined || input === null) throw new TypeError("Expected a string but received a ".concat(input));
			  if (input.constructor.name !== "String") throw new TypeError("Expected a string but received a ".concat(input.constructor.name));
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(assertString, assertString.exports));
		return assertString.exports;
	}

	let hasRequiredToDate;

	function requireToDate() {
		if (hasRequiredToDate) return toDate.exports;
		hasRequiredToDate = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = toDate;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function toDate(date) {
			  (0, _assertString.default)(date);
			  date = Date.parse(date);
			  return !isNaN(date) ? new Date(date) : null;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(toDate, toDate.exports));
		return toDate.exports;
	}

	const toFloat = {exports: {}};

	const isFloat = {};

	const nullUndefinedCheck = {exports: {}};

	let hasRequiredNullUndefinedCheck;

	function requireNullUndefinedCheck() {
		if (hasRequiredNullUndefinedCheck) return nullUndefinedCheck.exports;
		hasRequiredNullUndefinedCheck = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isNullOrUndefined;
			function isNullOrUndefined(value) {
			  return value === null || value === undefined;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(nullUndefinedCheck, nullUndefinedCheck.exports));
		return nullUndefinedCheck.exports;
	}

	const alpha = {};

	let hasRequiredAlpha;

	function requireAlpha() {
		if (hasRequiredAlpha) return alpha;
		hasRequiredAlpha = 1;

		Object.defineProperty(alpha, "__esModule", {
		  value: true
		});
		alpha.farsiLocales = alpha.englishLocales = alpha.dotDecimal = alpha.decimal = alpha.commaDecimal = alpha.bengaliLocales = alpha.arabicLocales = alpha.alphanumeric = alpha.alpha = void 0;
		const alpha$1 = alpha.alpha = {
		  "en-US": /^[A-Z]+$/i,
		  "az-AZ": /^[A-VXYZÇƏĞİıÖŞÜ]+$/i,
		  "bg-BG": /^[А-Я]+$/i,
		  "cs-CZ": /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/i,
		  "da-DK": /^[A-ZÆØÅ]+$/i,
		  "de-DE": /^[A-ZÄÖÜß]+$/i,
		  "el-GR": /^[Α-ώ]+$/i,
		  "es-ES": /^[A-ZÁÉÍÑÓÚÜ]+$/i,
		  "fa-IR": /^[ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی]+$/i,
		  "fi-FI": /^[A-ZÅÄÖ]+$/i,
		  "fr-FR": /^[A-ZÀÂÆÇÉÈÊËÏÎÔŒÙÛÜŸ]+$/i,
		  "it-IT": /^[A-ZÀÉÈÌÎÓÒÙ]+$/i,
		  "ja-JP": /^[ぁ-んァ-ヶｦ-ﾟ一-龠ー・。、]+$/i,
		  "nb-NO": /^[A-ZÆØÅ]+$/i,
		  "nl-NL": /^[A-ZÁÉËÏÓÖÜÚ]+$/i,
		  "nn-NO": /^[A-ZÆØÅ]+$/i,
		  "hu-HU": /^[A-ZÁÉÍÓÖŐÚÜŰ]+$/i,
		  "pl-PL": /^[A-ZĄĆĘŚŁŃÓŻŹ]+$/i,
		  "pt-PT": /^[A-ZÃÁÀÂÄÇÉÊËÍÏÕÓÔÖÚÜ]+$/i,
		  "ru-RU": /^[А-ЯЁ]+$/i,
		  "kk-KZ": /^[А-ЯЁ\u04D8\u04B0\u0406\u04A2\u0492\u04AE\u049A\u04E8\u04BA]+$/i,
		  "sl-SI": /^[A-ZČĆĐŠŽ]+$/i,
		  "sk-SK": /^[A-ZÁČĎÉÍŇÓŠŤÚÝŽĹŔĽÄÔ]+$/i,
		  "sr-RS@latin": /^[A-ZČĆŽŠĐ]+$/i,
		  "sr-RS": /^[А-ЯЂЈЉЊЋЏ]+$/i,
		  "sv-SE": /^[A-ZÅÄÖ]+$/i,
		  "th-TH": /^[ก-๐\s]+$/i,
		  "tr-TR": /^[A-ZÇĞİıÖŞÜ]+$/i,
		  "uk-UA": /^[А-ЩЬЮЯЄIЇҐі]+$/i,
		  "vi-VN": /^[A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴĐÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]+$/i,
		  "ko-KR": /^[ㄱ-ㅎㅏ-ㅣ가-힣]*$/,
		  "ku-IQ": /^[ئابپتجچحخدرڕزژسشعغفڤقکگلڵمنوۆھەیێيطؤثآإأكضصةظذ]+$/i,
		  "ar": /^[ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيًٌٍَُِّْٰ]+$/,
		  "he": /^[א-ת]+$/,
		  "fa": /^['آاءأؤئبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهةی']+$/i,
		  "bn": /^['ঀঁংঃঅআইঈউঊঋঌএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহ়ঽািীুূৃৄেৈোৌ্ৎৗড়ঢ়য়ৠৡৢৣৰৱ৲৳৴৵৶৷৸৹৺৻']+$/,
		  "eo": /^[ABCĈD-GĜHĤIJĴK-PRSŜTUŬVZ]+$/i,
		  "hi-IN": /^[\u0900-\u0961]+[\u0972-\u097F]*$/i,
		  "si-LK": /^[\u0D80-\u0DFF]+$/,
		  "ta-IN": /^[\u0B80-\u0BFF]+$/i,
		  "te-IN": /^[\u0C00-\u0C7F]+$/i,
		  "kn-IN": /^[\u0C80-\u0CFF]+$/i,
		  "ml-IN": /^[\u0D00-\u0D7F]+$/i,
		  "gu-IN": /^[\u0A80-\u0AFF]+$/i,
		  "pa-IN": /^[\u0A00-\u0A7F]+$/i,
		  "or-IN": /^[\u0B00-\u0B7F]+$/i
		};
		const alphanumeric = alpha.alphanumeric = {
		  "en-US": /^[0-9A-Z]+$/i,
		  "az-AZ": /^[0-9A-VXYZÇƏĞİıÖŞÜ]+$/i,
		  "bg-BG": /^[0-9А-Я]+$/i,
		  "cs-CZ": /^[0-9A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/i,
		  "da-DK": /^[0-9A-ZÆØÅ]+$/i,
		  "de-DE": /^[0-9A-ZÄÖÜß]+$/i,
		  "el-GR": /^[0-9Α-ω]+$/i,
		  "es-ES": /^[0-9A-ZÁÉÍÑÓÚÜ]+$/i,
		  "fi-FI": /^[0-9A-ZÅÄÖ]+$/i,
		  "fr-FR": /^[0-9A-ZÀÂÆÇÉÈÊËÏÎÔŒÙÛÜŸ]+$/i,
		  "it-IT": /^[0-9A-ZÀÉÈÌÎÓÒÙ]+$/i,
		  "ja-JP": /^[0-9０-９ぁ-んァ-ヶｦ-ﾟ一-龠ー・。、]+$/i,
		  "hu-HU": /^[0-9A-ZÁÉÍÓÖŐÚÜŰ]+$/i,
		  "nb-NO": /^[0-9A-ZÆØÅ]+$/i,
		  "nl-NL": /^[0-9A-ZÁÉËÏÓÖÜÚ]+$/i,
		  "nn-NO": /^[0-9A-ZÆØÅ]+$/i,
		  "pl-PL": /^[0-9A-ZĄĆĘŚŁŃÓŻŹ]+$/i,
		  "pt-PT": /^[0-9A-ZÃÁÀÂÄÇÉÊËÍÏÕÓÔÖÚÜ]+$/i,
		  "ru-RU": /^[0-9А-ЯЁ]+$/i,
		  "kk-KZ": /^[0-9А-ЯЁ\u04D8\u04B0\u0406\u04A2\u0492\u04AE\u049A\u04E8\u04BA]+$/i,
		  "sl-SI": /^[0-9A-ZČĆĐŠŽ]+$/i,
		  "sk-SK": /^[0-9A-ZÁČĎÉÍŇÓŠŤÚÝŽĹŔĽÄÔ]+$/i,
		  "sr-RS@latin": /^[0-9A-ZČĆŽŠĐ]+$/i,
		  "sr-RS": /^[0-9А-ЯЂЈЉЊЋЏ]+$/i,
		  "sv-SE": /^[0-9A-ZÅÄÖ]+$/i,
		  "th-TH": /^[ก-๙\s]+$/i,
		  "tr-TR": /^[0-9A-ZÇĞİıÖŞÜ]+$/i,
		  "uk-UA": /^[0-9А-ЩЬЮЯЄIЇҐі]+$/i,
		  "ko-KR": /^[0-9ㄱ-ㅎㅏ-ㅣ가-힣]*$/,
		  "ku-IQ": /^[٠١٢٣٤٥٦٧٨٩0-9ئابپتجچحخدرڕزژسشعغفڤقکگلڵمنوۆھەیێيطؤثآإأكضصةظذ]+$/i,
		  "vi-VN": /^[0-9A-ZÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴĐÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸ]+$/i,
		  "ar": /^[٠١٢٣٤٥٦٧٨٩0-9ءآأؤإئابةتثجحخدذرزسشصضطظعغفقكلمنهوىيًٌٍَُِّْٰ]+$/,
		  "he": /^[0-9א-ת]+$/,
		  "fa": /^['0-9آاءأؤئبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهةی۱۲۳۴۵۶۷۸۹۰']+$/i,
		  "bn": /^['ঀঁংঃঅআইঈউঊঋঌএঐওঔকখগঘঙচছজঝঞটঠডঢণতথদধনপফবভমযরলশষসহ়ঽািীুূৃৄেৈোৌ্ৎৗড়ঢ়য়ৠৡৢৣ০১২৩৪৫৬৭৮৯ৰৱ৲৳৴৵৶৷৸৹৺৻']+$/,
		  "eo": /^[0-9ABCĈD-GĜHĤIJĴK-PRSŜTUŬVZ]+$/i,
		  "hi-IN": /^[\u0900-\u0963]+[\u0966-\u097F]*$/i,
		  "si-LK": /^[0-9\u0D80-\u0DFF]+$/,
		  "ta-IN": /^[0-9\u0B80-\u0BFF.]+$/i,
		  "te-IN": /^[0-9\u0C00-\u0C7F.]+$/i,
		  "kn-IN": /^[0-9\u0C80-\u0CFF.]+$/i,
		  "ml-IN": /^[0-9\u0D00-\u0D7F.]+$/i,
		  "gu-IN": /^[0-9\u0A80-\u0AFF.]+$/i,
		  "pa-IN": /^[0-9\u0A00-\u0A7F.]+$/i,
		  "or-IN": /^[0-9\u0B00-\u0B7F.]+$/i
		};
		const decimal = alpha.decimal = {
		  "en-US": ".",
		  "ar": "٫"
		};
		const englishLocales = alpha.englishLocales = ["AU", "GB", "HK", "IN", "NZ", "ZA", "ZM"];
		for (var locale, i = 0; i < englishLocales.length; i++) {
		  locale = "en-".concat(englishLocales[i]);
		  alpha$1[locale] = alpha$1["en-US"];
		  alphanumeric[locale] = alphanumeric["en-US"];
		  decimal[locale] = decimal["en-US"];
		}

		// Source: http://www.localeplanet.com/java/
		const arabicLocales = alpha.arabicLocales = ["AE", "BH", "DZ", "EG", "IQ", "JO", "KW", "LB", "LY", "MA", "QM", "QA", "SA", "SD", "SY", "TN", "YE"];
		for (var _locale, _i = 0; _i < arabicLocales.length; _i++) {
		  _locale = "ar-".concat(arabicLocales[_i]);
		  alpha$1[_locale] = alpha$1.ar;
		  alphanumeric[_locale] = alphanumeric.ar;
		  decimal[_locale] = decimal.ar;
		}
		const farsiLocales = alpha.farsiLocales = ["IR", "AF"];
		for (var _locale2, _i2 = 0; _i2 < farsiLocales.length; _i2++) {
		  _locale2 = "fa-".concat(farsiLocales[_i2]);
		  alphanumeric[_locale2] = alphanumeric.fa;
		  decimal[_locale2] = decimal.ar;
		}
		const bengaliLocales = alpha.bengaliLocales = ["BD", "IN"];
		for (var _locale3, _i3 = 0; _i3 < bengaliLocales.length; _i3++) {
		  _locale3 = "bn-".concat(bengaliLocales[_i3]);
		  alpha$1[_locale3] = alpha$1.bn;
		  alphanumeric[_locale3] = alphanumeric.bn;
		  decimal[_locale3] = decimal["en-US"];
		}

		// Source: https://en.wikipedia.org/wiki/Decimal_mark
		const dotDecimal = alpha.dotDecimal = ["ar-EG", "ar-LB", "ar-LY"];
		const commaDecimal = alpha.commaDecimal = ["bg-BG", "cs-CZ", "da-DK", "de-DE", "el-GR", "en-ZM", "eo", "es-ES", "fr-CA", "fr-FR", "gu-IN", "hi-IN", "hu-HU", "id-ID", "it-IT", "kk-KZ", "kn-IN", "ku-IQ", "ml-IN", "nb-NO", "nl-NL", "nn-NO", "or-IN", "pa-IN", "pl-PL", "pt-PT", "ru-RU", "si-LK", "sl-SI", "sr-RS", "sr-RS@latin", "sv-SE", "ta-IN", "te-IN", "tr-TR", "uk-UA", "vi-VN"];
		for (let _i4 = 0; _i4 < dotDecimal.length; _i4++) {
		  decimal[dotDecimal[_i4]] = decimal["en-US"];
		}
		for (let _i5 = 0; _i5 < commaDecimal.length; _i5++) {
		  decimal[commaDecimal[_i5]] = ",";
		}
		alpha$1["fr-CA"] = alpha$1["fr-FR"];
		alphanumeric["fr-CA"] = alphanumeric["fr-FR"];
		alpha$1["pt-BR"] = alpha$1["pt-PT"];
		alphanumeric["pt-BR"] = alphanumeric["pt-PT"];
		decimal["pt-BR"] = decimal["pt-PT"];

		// see #862
		alpha$1["pl-Pl"] = alpha$1["pl-PL"];
		alphanumeric["pl-Pl"] = alphanumeric["pl-PL"];
		decimal["pl-Pl"] = decimal["pl-PL"];

		// see #1455
		alpha$1["fa-AF"] = alpha$1.fa;
		return alpha;
	}

	let hasRequiredIsFloat;

	function requireIsFloat() {
		if (hasRequiredIsFloat) return isFloat;
		hasRequiredIsFloat = 1;

		Object.defineProperty(isFloat, "__esModule", {
		  value: true
		});
		isFloat.default = isFloat$1;
		isFloat.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		const _nullUndefinedCheck = _interopRequireDefault(/* @__PURE__*/ requireNullUndefinedCheck());
		const _alpha = /* @__PURE__*/ requireAlpha();
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		function isFloat$1(str, options) {
		  (0, _assertString.default)(str);
		  options = options || {};
		  const float = new RegExp("^(?:[-+])?(?:[0-9]+)?(?:\\".concat(options.locale ? _alpha.decimal[options.locale] : ".", "[0-9]*)?(?:[eE][\\+\\-]?(?:[0-9]+))?$"));
		  if (str === "" || str === "." || str === "," || str === "-" || str === "+") {
		    return false;
		  }
		  const value = parseFloat(str.replace(",", "."));
		  return float.test(str) && (!options.hasOwnProperty("min") || (0, _nullUndefinedCheck.default)(options.min) || value >= options.min) && (!options.hasOwnProperty("max") || (0, _nullUndefinedCheck.default)(options.max) || value <= options.max) && (!options.hasOwnProperty("lt") || (0, _nullUndefinedCheck.default)(options.lt) || value < options.lt) && (!options.hasOwnProperty("gt") || (0, _nullUndefinedCheck.default)(options.gt) || value > options.gt);
		}
		isFloat.locales = Object.keys(_alpha.decimal);
		return isFloat;
	}

	let hasRequiredToFloat;

	function requireToFloat() {
		if (hasRequiredToFloat) return toFloat.exports;
		hasRequiredToFloat = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = toFloat;
			const _isFloat = _interopRequireDefault(/* @__PURE__*/ requireIsFloat());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function toFloat(str) {
			  if (!(0, _isFloat.default)(str)) return NaN;
			  return parseFloat(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(toFloat, toFloat.exports));
		return toFloat.exports;
	}

	const toInt = {exports: {}};

	let hasRequiredToInt;

	function requireToInt() {
		if (hasRequiredToInt) return toInt.exports;
		hasRequiredToInt = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = toInt;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function toInt(str, radix) {
			  (0, _assertString.default)(str);
			  return parseInt(str, radix || 10);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(toInt, toInt.exports));
		return toInt.exports;
	}

	const toBoolean = {exports: {}};

	let hasRequiredToBoolean;

	function requireToBoolean() {
		if (hasRequiredToBoolean) return toBoolean.exports;
		hasRequiredToBoolean = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = toBoolean;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function toBoolean(str, strict) {
			  (0, _assertString.default)(str);
			  if (strict) {
			    return str === "1" || /^true$/i.test(str);
			  }
			  return str !== "0" && !/^false$/i.test(str) && str !== "";
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(toBoolean, toBoolean.exports));
		return toBoolean.exports;
	}

	const equals = {exports: {}};

	let hasRequiredEquals;

	function requireEquals() {
		if (hasRequiredEquals) return equals.exports;
		hasRequiredEquals = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = equals;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function equals(str, comparison) {
			  (0, _assertString.default)(str);
			  return str === comparison;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(equals, equals.exports));
		return equals.exports;
	}

	const contains = {exports: {}};

	const toString$1 = {exports: {}};

	let hasRequiredToString;

	function requireToString() {
		if (hasRequiredToString) return toString$1.exports;
		hasRequiredToString = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = toString;
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			function toString(input) {
			  if (_typeof(input) === "object" && input !== null) {
			    if (typeof input.toString === "function") {
			      input = input.toString();
			    } else {
			      input = "[object Object]";
			    }
			  } else if (input === null || typeof input === "undefined" || isNaN(input) && !input.length) {
			    input = "";
			  }
			  return String(input);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(toString$1, toString$1.exports));
		return toString$1.exports;
	}

	const merge = {exports: {}};

	let hasRequiredMerge;

	function requireMerge() {
		if (hasRequiredMerge) return merge.exports;
		hasRequiredMerge = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = merge;
			function merge() {
			  const obj = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
			  const defaults = arguments.length > 1 ? arguments[1] : undefined;
			  for (const key in defaults) {
			    if (typeof obj[key] === "undefined") {
			      obj[key] = defaults[key];
			    }
			  }
			  return obj;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(merge, merge.exports));
		return merge.exports;
	}

	let hasRequiredContains;

	function requireContains() {
		if (hasRequiredContains) return contains.exports;
		hasRequiredContains = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = contains;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _toString = _interopRequireDefault(/* @__PURE__*/ requireToString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const defaultContainsOptions = {
			  ignoreCase: false,
			  minOccurrences: 1
			};
			function contains(str, elem, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, defaultContainsOptions);
			  if (options.ignoreCase) {
			    return str.toLowerCase().split((0, _toString.default)(elem).toLowerCase()).length > options.minOccurrences;
			  }
			  return str.split((0, _toString.default)(elem)).length > options.minOccurrences;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(contains, contains.exports));
		return contains.exports;
	}

	const matches = {exports: {}};

	let hasRequiredMatches;

	function requireMatches() {
		if (hasRequiredMatches) return matches.exports;
		hasRequiredMatches = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = matches;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function matches(str, pattern, modifiers) {
			  (0, _assertString.default)(str);
			  if (Object.prototype.toString.call(pattern) !== "[object RegExp]") {
			    pattern = new RegExp(pattern, modifiers);
			  }
			  return !!str.match(pattern);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(matches, matches.exports));
		return matches.exports;
	}

	const isEmail = {exports: {}};

	const checkHost = {exports: {}};

	let hasRequiredCheckHost;

	function requireCheckHost() {
		if (hasRequiredCheckHost) return checkHost.exports;
		hasRequiredCheckHost = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = checkHost;
			function isRegExp(obj) {
			  return Object.prototype.toString.call(obj) === "[object RegExp]";
			}
			function checkHost(host, matches) {
			  for (let i = 0; i < matches.length; i++) {
			    const match = matches[i];
			    if (host === match || isRegExp(match) && match.test(host)) {
			      return true;
			    }
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(checkHost, checkHost.exports));
		return checkHost.exports;
	}

	const isByteLength = {exports: {}};

	let hasRequiredIsByteLength;

	function requireIsByteLength() {
		if (hasRequiredIsByteLength) return isByteLength.exports;
		hasRequiredIsByteLength = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isByteLength;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}

			function isByteLength(str, options) {
			  (0, _assertString.default)(str);
			  let min;
			  let max;
			  if (_typeof(options) === "object") {
			    min = options.min || 0;
			    max = options.max;
			  } else {
			    // backwards compatibility: isByteLength(str, min [, max])
			    min = arguments[1];
			    max = arguments[2];
			  }
			  const len = encodeURI(str).split(/%..|./).length - 1;
			  return len >= min && (typeof max === "undefined" || len <= max);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isByteLength, isByteLength.exports));
		return isByteLength.exports;
	}

	const isFQDN = {exports: {}};

	let hasRequiredIsFQDN;

	function requireIsFQDN() {
		if (hasRequiredIsFQDN) return isFQDN.exports;
		hasRequiredIsFQDN = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isFQDN;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const default_fqdn_options = {
			  require_tld: true,
			  allow_underscores: false,
			  allow_trailing_dot: false,
			  allow_numeric_tld: false,
			  allow_wildcard: false,
			  ignore_max_length: false
			};
			function isFQDN(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_fqdn_options);

			  /* Remove the optional trailing dot before checking validity */
			  if (options.allow_trailing_dot && str[str.length - 1] === ".") {
			    str = str.substring(0, str.length - 1);
			  }

			  /* Remove the optional wildcard before checking validity */
			  if (options.allow_wildcard === true && str.indexOf("*.") === 0) {
			    str = str.substring(2);
			  }
			  const parts = str.split(".");
			  const tld = parts[parts.length - 1];
			  if (options.require_tld) {
			    // disallow fqdns without tld
			    if (parts.length < 2) {
			      return false;
			    }
			    if (!options.allow_numeric_tld && !/^([a-z\u00A1-\u00A8\u00AA-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]{2,}|xn[a-z0-9-]{2,})$/i.test(tld)) {
			      return false;
			    }

			    // disallow spaces
			    if (/\s/.test(tld)) {
			      return false;
			    }
			  }

			  // reject numeric TLDs
			  if (!options.allow_numeric_tld && /^\d+$/.test(tld)) {
			    return false;
			  }
			  return parts.every(function(part) {
			    if (part.length > 63 && !options.ignore_max_length) {
			      return false;
			    }
			    if (!/^[a-z_\u00a1-\uffff0-9-]+$/i.test(part)) {
			      return false;
			    }

			    // disallow full-width chars
			    if (/[\uff01-\uff5e]/.test(part)) {
			      return false;
			    }

			    // disallow parts starting or ending with hyphen
			    if (/^-|-$/.test(part)) {
			      return false;
			    }
			    if (!options.allow_underscores && /_/.test(part)) {
			      return false;
			    }
			    return true;
			  });
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isFQDN, isFQDN.exports));
		return isFQDN.exports;
	}

	const isIP = {exports: {}};

	let hasRequiredIsIP;

	function requireIsIP() {
		if (hasRequiredIsIP) return isIP.exports;
		hasRequiredIsIP = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isIP;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			/**
			11.3.  Examples

			   The following addresses

			             fe80::1234 (on the 1st link of the node)
			             ff02::5678 (on the 5th link of the node)
			             ff08::9abc (on the 10th organization of the node)

			   would be represented as follows:

			             fe80::1234%1
			             ff02::5678%5
			             ff08::9abc%10

			   (Here we assume a natural translation from a zone index to the
			   <zone_id> part, where the Nth zone of any scope is translated into
			   "N".)

			   If we use interface names as <zone_id>, those addresses could also be
			   represented as follows:

			            fe80::1234%ne0
			            ff02::5678%pvc1.3
			            ff08::9abc%interface10

			   where the interface "ne0" belongs to the 1st link, "pvc1.3" belongs
			   to the 5th link, and "interface10" belongs to the 10th organization.
			 * * */
			const IPv4SegmentFormat = "(?:[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])";
			const IPv4AddressFormat = "(".concat(IPv4SegmentFormat, "[.]){3}").concat(IPv4SegmentFormat);
			const IPv4AddressRegExp = new RegExp("^".concat(IPv4AddressFormat, "$"));
			const IPv6SegmentFormat = "(?:[0-9a-fA-F]{1,4})";
			const IPv6AddressRegExp = new RegExp("^(" + "(?:".concat(IPv6SegmentFormat, ":){7}(?:").concat(IPv6SegmentFormat, "|:)|") + "(?:".concat(IPv6SegmentFormat, ":){6}(?:").concat(IPv4AddressFormat, "|:").concat(IPv6SegmentFormat, "|:)|") + "(?:".concat(IPv6SegmentFormat, ":){5}(?::").concat(IPv4AddressFormat, "|(:").concat(IPv6SegmentFormat, "){1,2}|:)|") + "(?:".concat(IPv6SegmentFormat, ":){4}(?:(:").concat(IPv6SegmentFormat, "){0,1}:").concat(IPv4AddressFormat, "|(:").concat(IPv6SegmentFormat, "){1,3}|:)|") + "(?:".concat(IPv6SegmentFormat, ":){3}(?:(:").concat(IPv6SegmentFormat, "){0,2}:").concat(IPv4AddressFormat, "|(:").concat(IPv6SegmentFormat, "){1,4}|:)|") + "(?:".concat(IPv6SegmentFormat, ":){2}(?:(:").concat(IPv6SegmentFormat, "){0,3}:").concat(IPv4AddressFormat, "|(:").concat(IPv6SegmentFormat, "){1,5}|:)|") + "(?:".concat(IPv6SegmentFormat, ":){1}(?:(:").concat(IPv6SegmentFormat, "){0,4}:").concat(IPv4AddressFormat, "|(:").concat(IPv6SegmentFormat, "){1,6}|:)|") + "(?::((?::".concat(IPv6SegmentFormat, "){0,5}:").concat(IPv4AddressFormat, "|(?::").concat(IPv6SegmentFormat, "){1,7}|:))") + ")(%[0-9a-zA-Z.]{1,})?$");
			function isIP(ipAddress) {
			  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
			  (0, _assertString.default)(ipAddress);

			  // accessing 'arguments' for backwards compatibility: isIP(ipAddress [, version])

			  const version = (_typeof(options) === "object" ? options.version : arguments[1]) || "";
			  if (!version) {
			    return isIP(ipAddress, {
			      version: 4
			    }) || isIP(ipAddress, {
			      version: 6
			    });
			  }
			  if (version.toString() === "4") {
			    return IPv4AddressRegExp.test(ipAddress);
			  }
			  if (version.toString() === "6") {
			    return IPv6AddressRegExp.test(ipAddress);
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isIP, isIP.exports));
		return isIP.exports;
	}

	let hasRequiredIsEmail;

	function requireIsEmail() {
		if (hasRequiredIsEmail) return isEmail.exports;
		hasRequiredIsEmail = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isEmail;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _checkHost = _interopRequireDefault(/* @__PURE__*/ requireCheckHost());
			const _isByteLength = _interopRequireDefault(/* @__PURE__*/ requireIsByteLength());
			const _isFQDN = _interopRequireDefault(/* @__PURE__*/ requireIsFQDN());
			const _isIP = _interopRequireDefault(/* @__PURE__*/ requireIsIP());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const default_email_options = {
			  allow_display_name: false,
			  allow_underscores: false,
			  require_display_name: false,
			  allow_utf8_local_part: true,
			  require_tld: true,
			  blacklisted_chars: "",
			  ignore_max_length: false,
			  host_blacklist: [],
			  host_whitelist: []
			};


			/* eslint-disable no-control-regex */
			const splitNameAddress = /^([^\x00-\x1F\x7F-\x9F\cX]+)</i;
			const emailUserPart = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~]+$/i;
			const gmailUserPart = /^[a-z\d]+$/;
			const quotedEmailUser = /^([\s\x01-\x08\x0b\x0c\x0e-\x1f\x7f\x21\x23-\x5b\x5d-\x7e]|(\\[\x01-\x09\x0b\x0c\x0d-\x7f]))*$/i;
			const emailUserUtf8Part = /^[a-z\d!#\$%&'\*\+\-\/=\?\^_`{\|}~\u00A1-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+$/i;
			const quotedEmailUserUtf8 = /^([\s\x01-\x08\x0b\x0c\x0e-\x1f\x7f\x21\x23-\x5b\x5d-\x7e\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]|(\\[\x01-\x09\x0b\x0c\x0d-\x7f\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]))*$/i;
			const defaultMaxEmailLength = 254;

			/* eslint-enable no-control-regex */

			/**
			 * Validate display name according to the RFC2822: https://tools.ietf.org/html/rfc2822#appendix-A.1.2
			 *
			 * @param {string} display_name
			 */
			function validateDisplayName(display_name) {
			  const display_name_without_quotes = display_name.replace(/^"(.+)"$/, "$1");
			  // display name with only spaces is not valid
			  if (!display_name_without_quotes.trim()) {
			    return false;
			  }

			  // check whether display name contains illegal character
			  const contains_illegal = /[\.";<>]/.test(display_name_without_quotes);
			  if (contains_illegal) {
			    // if contains illegal characters,
			    // must to be enclosed in double-quotes, otherwise it's not a valid display name
			    if (display_name_without_quotes === display_name) {
			      return false;
			    }

			    // the quotes in display name must start with character symbol \
			    const all_start_with_back_slash = display_name_without_quotes.split("\"").length === display_name_without_quotes.split("\\\"").length;
			    if (!all_start_with_back_slash) {
			      return false;
			    }
			  }
			  return true;
			}
			function isEmail(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_email_options);
			  if (options.require_display_name || options.allow_display_name) {
			    const display_email = str.match(splitNameAddress);
			    if (display_email) {
			      let display_name = display_email[1];

			      // Remove display name and angle brackets to get email address
			      // Can be done in the regex but will introduce a ReDOS (See  #1597 for more info)
			      str = str.replace(display_name, "").replace(/(^<|>$)/g, "");

			      // sometimes need to trim the last space to get the display name
			      // because there may be a space between display name and email address
			      // eg. myname <address@gmail.com>
			      // the display name is `myname` instead of `myname `, so need to trim the last space
			      if (display_name.endsWith(" ")) {
			        display_name = display_name.slice(0, -1);
			      }
			      if (!validateDisplayName(display_name)) {
			        return false;
			      }
			    } else if (options.require_display_name) {
			      return false;
			    }
			  }
			  if (!options.ignore_max_length && str.length > defaultMaxEmailLength) {
			    return false;
			  }
			  const parts = str.split("@");
			  const domain = parts.pop();
			  const lower_domain = domain.toLowerCase();
			  if (options.host_blacklist.length > 0 && (0, _checkHost.default)(lower_domain, options.host_blacklist)) {
			    return false;
			  }
			  if (options.host_whitelist.length > 0 && !(0, _checkHost.default)(lower_domain, options.host_whitelist)) {
			    return false;
			  }
			  let user = parts.join("@");
			  if (options.domain_specific_validation && (lower_domain === "gmail.com" || lower_domain === "googlemail.com")) {
			    /*
			    Previously we removed dots for gmail addresses before validating.
			    This was removed because it allows `multiple..dots@gmail.com`
			    to be reported as valid, but it is not.
			    Gmail only normalizes single dots, removing them from here is pointless,
			    should be done in normalizeEmail
			    */
			    user = user.toLowerCase();

			    // Removing sub-address from username before gmail validation
			    const username = user.split("+")[0];

			    // Dots are not included in gmail length restriction
			    if (!(0, _isByteLength.default)(username.replace(/\./g, ""), {
			      min: 6,
			      max: 30
			    })) {
			      return false;
			    }
			    const _user_parts = username.split(".");
			    for (let i = 0; i < _user_parts.length; i++) {
			      if (!gmailUserPart.test(_user_parts[i])) {
			        return false;
			      }
			    }
			  }
			  if (options.ignore_max_length === false && (!(0, _isByteLength.default)(user, {
			    max: 64
			  }) || !(0, _isByteLength.default)(domain, {
			    max: 254
			  }))) {
			    return false;
			  }
			  if (!(0, _isFQDN.default)(domain, {
			    require_tld: options.require_tld,
			    ignore_max_length: options.ignore_max_length,
			    allow_underscores: options.allow_underscores
			  })) {
			    if (!options.allow_ip_domain) {
			      return false;
			    }
			    if (!(0, _isIP.default)(domain)) {
			      if (!domain.startsWith("[") || !domain.endsWith("]")) {
			        return false;
			      }
			      const noBracketdomain = domain.slice(1, -1);
			      if (noBracketdomain.length === 0 || !(0, _isIP.default)(noBracketdomain)) {
			        return false;
			      }
			    }
			  }
			  if (options.blacklisted_chars) {
			    if (user.search(new RegExp("[".concat(options.blacklisted_chars, "]+"), "g")) !== -1) return false;
			  }
			  if (user[0] === "\"" && user[user.length - 1] === "\"") {
			    user = user.slice(1, user.length - 1);
			    return options.allow_utf8_local_part ? quotedEmailUserUtf8.test(user) : quotedEmailUser.test(user);
			  }
			  const pattern = options.allow_utf8_local_part ? emailUserUtf8Part : emailUserPart;
			  const user_parts = user.split(".");
			  for (let _i = 0; _i < user_parts.length; _i++) {
			    if (!pattern.test(user_parts[_i])) {
			      return false;
			    }
			  }
			  return true;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isEmail, isEmail.exports));
		return isEmail.exports;
	}

	const isURL = {exports: {}};

	const includesString = {exports: {}};

	let hasRequiredIncludesString;

	function requireIncludesString() {
		if (hasRequiredIncludesString) return includesString.exports;
		hasRequiredIncludesString = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = void 0;
			const includes = function includes(str, val) {
			  return str.indexOf(val) !== -1;
			};
			exports$1.default = includes;
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(includesString, includesString.exports));
		return includesString.exports;
	}

	let hasRequiredIsURL;

	function requireIsURL() {
		if (hasRequiredIsURL) return isURL.exports;
		hasRequiredIsURL = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isURL;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _checkHost = _interopRequireDefault(/* @__PURE__*/ requireCheckHost());
			const _includesString = _interopRequireDefault(/* @__PURE__*/ requireIncludesString());
			const _isFQDN = _interopRequireDefault(/* @__PURE__*/ requireIsFQDN());
			const _isIP = _interopRequireDefault(/* @__PURE__*/ requireIsIP());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _slicedToArray(r, e) {
				return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
			}
			function _nonIterableRest() {
				throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
			}
			function _unsupportedIterableToArray(r, a) {
				if (r) {
					if ("string" == typeof r) return _arrayLikeToArray(r, a); let t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
				}
			}
			function _arrayLikeToArray(r, a) {
				(null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n;
			}
			function _iterableToArrayLimit(r, l) {
				let t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) {
					let e; let n; let i; let u; const a = []; let f = true; let o = false; try {
						if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
					} catch (r) {
						o = true, n = r;
					} finally {
						try {
							if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
						} finally {
							if (o) throw n;
						}
					} return a;
				}
			}
			function _arrayWithHoles(r) {
				if (Array.isArray(r)) return r;
			}
			/*
			options for isURL method

			protocols - valid protocols can be modified with this option.
			require_tld - If set to false isURL will not check if the URL's host includes a top-level domain.
			require_protocol - if set to true isURL will return false if protocol is not present in the URL.
			require_host - if set to false isURL will not check if host is present in the URL.
			require_port - if set to true isURL will check if port is present in the URL.
			require_valid_protocol - isURL will check if the URL's protocol is present in the protocols option.
			allow_underscores - if set to true, the validator will allow underscores in the URL.
			host_whitelist - if set to an array of strings or regexp, and the domain matches none of the strings
			                 defined in it, the validation fails.
			host_blacklist - if set to an array of strings or regexp, and the domain matches any of the strings
			                 defined in it, the validation fails.
			allow_trailing_dot - if set to true, the validator will allow the domain to end with
			                     a `.` character.
			allow_protocol_relative_urls - if set to true protocol relative URLs will be allowed.
			allow_fragments - if set to false isURL will return false if fragments are present.
			allow_query_components - if set to false isURL will return false if query components are present.
			disallow_auth - if set to true, the validator will fail if the URL contains an authentication
			                component, e.g. `http://username:password@example.com`
			validate_length - if set to false isURL will skip string length validation. `max_allowed_length`
			                  will be ignored if this is set as `false`.
			max_allowed_length - if set, isURL will not allow URLs longer than the specified value (default is
			                     2084 that IE maximum URL length).

			*/

			const default_url_options = {
			  protocols: ["http", "https", "ftp"],
			  require_tld: true,
			  require_protocol: false,
			  require_host: true,
			  require_port: false,
			  require_valid_protocol: true,
			  allow_underscores: false,
			  allow_trailing_dot: false,
			  allow_protocol_relative_urls: false,
			  allow_fragments: true,
			  allow_query_components: true,
			  validate_length: true,
			  max_allowed_length: 2084
			};
			const wrapped_ipv6 = /^\[([^\]]+)\](?::([0-9]+))?$/;
			function isURL(url, options) {
			  (0, _assertString.default)(url);
			  if (!url || /[\s<>]/.test(url)) {
			    return false;
			  }
			  if (url.indexOf("mailto:") === 0) {
			    return false;
			  }
			  options = (0, _merge.default)(options, default_url_options);
			  if (options.validate_length && url.length > options.max_allowed_length) {
			    return false;
			  }
			  if (!options.allow_fragments && (0, _includesString.default)(url, "#")) {
			    return false;
			  }
			  if (!options.allow_query_components && ((0, _includesString.default)(url, "?") || (0, _includesString.default)(url, "&"))) {
			    return false;
			  }
			  let protocol; let auth; let host; let hostname; let port; let port_str; let split; let ipv6;
			  split = url.split("#");
			  url = split.shift();
			  split = url.split("?");
			  url = split.shift();

			  // Replaced the 'split("://")' logic with a regex to match the protocol.
			  // This correctly identifies schemes like `javascript:` which don't use `//`.
			  // However, we need to be careful not to confuse authentication credentials (user:password@host)
			  // with protocols. A colon before an @ symbol might be part of auth, not a protocol separator.
			  const protocol_match = url.match(/^([a-z][a-z0-9+\-.]*):/i);
			  let had_explicit_protocol = false;
			  const cleanUpProtocol = function cleanUpProtocol(potential_protocol) {
			    had_explicit_protocol = true;
			    protocol = potential_protocol.toLowerCase();
			    if (options.require_valid_protocol && options.protocols.indexOf(protocol) === -1) {
			      // The identified protocol is not in the allowed list.
			      return false;
			    }

			    // Remove the protocol from the URL string.
			    return url.substring(protocol_match[0].length);
			  };
			  if (protocol_match) {
			    const potential_protocol = protocol_match[1];
			    const after_colon = url.substring(protocol_match[0].length);

			    // Check if what follows looks like authentication credentials (user:password@host)
			    // rather than a protocol. This happens when:
			    // 1. There's no `//` after the colon (protocols like `http://` have this)
			    // 2. There's an `@` symbol before any `/`
			    // 3. The part before `@` contains only valid auth characters (alphanumeric, -, _, ., %, :)
			    const starts_with_slashes = after_colon.slice(0, 2) === "//";
			    if (!starts_with_slashes) {
			      const first_slash_position = after_colon.indexOf("/");
			      const before_slash = first_slash_position === -1 ? after_colon : after_colon.substring(0, first_slash_position);
			      const at_position = before_slash.indexOf("@");
			      if (at_position !== -1) {
			        const before_at = before_slash.substring(0, at_position);
			        const valid_auth_regex = /^[a-zA-Z0-9\-_.%:]*$/;
			        const is_valid_auth = valid_auth_regex.test(before_at);

			        // Check if this contains URL-encoded content that could be malicious
			        // For example: javascript:%61%6c%65%72%74%28%31%29@example.com
			        // The encoded part decodes to: alert(1)
			        const has_encoded_content = /%[0-9a-fA-F]{2}/.test(before_at);
			        if (is_valid_auth && !has_encoded_content) {
			          // This looks like authentication (e.g., user:password@host), not a protocol
			          if (options.require_protocol) {
			            return false;
			          }

			          // Don't consume the colon; let the auth parsing handle it later
			        } else {
			          // This looks like a malicious protocol (e.g., javascript:alert();@host)
			          // or URL-encoded protocol handler (e.g., javascript:%61%6c%65%72%74%28%31%29@host)
			          url = cleanUpProtocol(potential_protocol);
			          if (url === false) {
			            return false;
			          }
			        }
			      } else {
			        // No @ symbol found. Check if this could be a port number instead of a protocol.
			        // If what's after the colon is numeric (or starts with a digit and contains only
			        // valid port characters until a path separator), it's likely hostname:port, not a protocol.
			        const looks_like_port = /^[0-9]/.test(after_colon);
			        if (looks_like_port) {
			          // This looks like hostname:port, not a protocol
			          if (options.require_protocol) {
			            return false;
			          }
			          // Don't consume anything; let it be parsed as hostname:port
			        } else {
			          // This is definitely a protocol
			          url = cleanUpProtocol(potential_protocol);
			          if (url === false) {
			            return false;
			          }
			        }
			      }
			    } else {
			      // Starts with '//', this is definitely a protocol like http://
			      url = cleanUpProtocol(potential_protocol);
			      if (url === false) {
			        return false;
			      }
			    }
			  } else if (options.require_protocol) {
			    return false;
			  }

			  // Handle leading '//' only as protocol-relative when there was NO explicit protocol.
			  // If there was an explicit protocol, '//' is the normal separator
			  // and should be stripped unconditionally.
			  if (url.slice(0, 2) === "//") {
			    if (!had_explicit_protocol && !options.allow_protocol_relative_urls) {
			      return false;
			    }
			    url = url.slice(2);
			  }
			  if (url === "") {
			    return false;
			  }
			  split = url.split("/");
			  url = split.shift();
			  if (url === "" && !options.require_host) {
			    return true;
			  }
			  split = url.split("@");
			  if (split.length > 1) {
			    if (options.disallow_auth) {
			      return false;
			    }
			    if (split[0] === "") {
			      return false;
			    }
			    auth = split.shift();
			    if (auth.indexOf(":") >= 0 && auth.split(":").length > 2) {
			      return false;
			    }
			    const _auth$split = auth.split(":");
			      const _auth$split2 = _slicedToArray(_auth$split, 2);
			      const user = _auth$split2[0];
			      const password = _auth$split2[1];
			    if (user === "" && password === "") {
			      return false;
			    }
			  }
			  hostname = split.join("@");
			  port_str = null;
			  ipv6 = null;
			  const ipv6_match = hostname.match(wrapped_ipv6);
			  if (ipv6_match) {
			    host = "";
			    ipv6 = ipv6_match[1];
			    port_str = ipv6_match[2] || null;
			  } else {
			    split = hostname.split(":");
			    host = split.shift();
			    if (split.length) {
			      port_str = split.join(":");
			    }
			  }
			  if (port_str !== null && port_str.length > 0) {
			    port = parseInt(port_str, 10);
			    if (!/^[0-9]+$/.test(port_str) || port <= 0 || port > 65535) {
			      return false;
			    }
			  } else if (options.require_port) {
			    return false;
			  }
			  if (options.host_whitelist) {
			    return (0, _checkHost.default)(host, options.host_whitelist);
			  }
			  if (host === "" && !options.require_host) {
			    return true;
			  }
			  if (!(0, _isIP.default)(host) && !(0, _isFQDN.default)(host, options) && (!ipv6 || !(0, _isIP.default)(ipv6, 6))) {
			    return false;
			  }
			  host = host || ipv6;
			  if (options.host_blacklist && (0, _checkHost.default)(host, options.host_blacklist)) {
			    return false;
			  }
			  return true;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isURL, isURL.exports));
		return isURL.exports;
	}

	const isMACAddress = {exports: {}};

	let hasRequiredIsMACAddress;

	function requireIsMACAddress() {
		if (hasRequiredIsMACAddress) return isMACAddress.exports;
		hasRequiredIsMACAddress = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMACAddress;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const macAddress48 = /^(?:[0-9a-fA-F]{2}([-:\s]))([0-9a-fA-F]{2}\1){4}([0-9a-fA-F]{2})$/;
			const macAddress48NoSeparators = /^([0-9a-fA-F]){12}$/;
			const macAddress48WithDots = /^([0-9a-fA-F]{4}\.){2}([0-9a-fA-F]{4})$/;
			const macAddress64 = /^(?:[0-9a-fA-F]{2}([-:\s]))([0-9a-fA-F]{2}\1){6}([0-9a-fA-F]{2})$/;
			const macAddress64NoSeparators = /^([0-9a-fA-F]){16}$/;
			const macAddress64WithDots = /^([0-9a-fA-F]{4}\.){3}([0-9a-fA-F]{4})$/;
			function isMACAddress(str, options) {
			  (0, _assertString.default)(str);
			  if (options !== null && options !== void 0 && options.eui) {
			    options.eui = String(options.eui);
			  }
			  /**
			   * @deprecated `no_colons` TODO: remove it in the next major
			  */
			  if (options !== null && options !== void 0 && options.no_colons || options !== null && options !== void 0 && options.no_separators) {
			    if (options.eui === "48") {
			      return macAddress48NoSeparators.test(str);
			    }
			    if (options.eui === "64") {
			      return macAddress64NoSeparators.test(str);
			    }
			    return macAddress48NoSeparators.test(str) || macAddress64NoSeparators.test(str);
			  }
			  if ((options === null || options === void 0 ? void 0 : options.eui) === "48") {
			    return macAddress48.test(str) || macAddress48WithDots.test(str);
			  }
			  if ((options === null || options === void 0 ? void 0 : options.eui) === "64") {
			    return macAddress64.test(str) || macAddress64WithDots.test(str);
			  }
			  return isMACAddress(str, {
			    eui: "48"
			  }) || isMACAddress(str, {
			    eui: "64"
			  });
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMACAddress, isMACAddress.exports));
		return isMACAddress.exports;
	}

	const isIPRange = {exports: {}};

	let hasRequiredIsIPRange;

	function requireIsIPRange() {
		if (hasRequiredIsIPRange) return isIPRange.exports;
		hasRequiredIsIPRange = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isIPRange;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isIP = _interopRequireDefault(/* @__PURE__*/ requireIsIP());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const subnetMaybe = /^\d{1,3}$/;
			const v4Subnet = 32;
			const v6Subnet = 128;
			function isIPRange(str) {
			  const version = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "";
			  (0, _assertString.default)(str);
			  const parts = str.split("/");

			  // parts[0] -> ip, parts[1] -> subnet
			  if (parts.length !== 2) {
			    return false;
			  }
			  if (!subnetMaybe.test(parts[1])) {
			    return false;
			  }

			  // Disallow preceding 0 i.e. 01, 02, ...
			  if (parts[1].length > 1 && parts[1].startsWith("0")) {
			    return false;
			  }
			  const isValidIP = (0, _isIP.default)(parts[0], version);
			  if (!isValidIP) {
			    return false;
			  }

			  // Define valid subnet according to IP's version
			  let expectedSubnet = null;
			  switch (String(version)) {
			    case "4":
			      expectedSubnet = v4Subnet;
			      break;
			    case "6":
			      expectedSubnet = v6Subnet;
			      break;
			    default:
			      expectedSubnet = (0, _isIP.default)(parts[0], "6") ? v6Subnet : v4Subnet;
			  }
			  return parts[1] <= expectedSubnet && parts[1] >= 0;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isIPRange, isIPRange.exports));
		return isIPRange.exports;
	}

	const isDate = {exports: {}};

	let hasRequiredIsDate;

	function requireIsDate() {
		if (hasRequiredIsDate) return isDate.exports;
		hasRequiredIsDate = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isDate;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _slicedToArray(r, e) {
				return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
			}
			function _nonIterableRest() {
				throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
			}
			function _iterableToArrayLimit(r, l) {
				let t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) {
					let e; let n; let i; let u; const a = []; let f = true; let o = false; try {
						if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
					} catch (r) {
						o = true, n = r;
					} finally {
						try {
							if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
						} finally {
							if (o) throw n;
						}
					} return a;
				}
			}
			function _arrayWithHoles(r) {
				if (Array.isArray(r)) return r;
			}
			function _createForOfIteratorHelper(r, e) {
				let t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) {
					if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
						t && (r = t); let _n = 0; const F = function F() {}; return {s: F, n: function n() {
							return _n >= r.length ? {done: true} : {done: false, value: r[_n++]};
						}, e: function e(r) {
							throw r;
						}, f: F};
					} throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				} let o; let a = true; let u = false; return {s: function s() {
					t = t.call(r);
				}, n: function n() {
					const r = t.next(); return a = r.done, r;
				}, e: function e(r) {
					u = true, o = r;
				}, f: function f() {
					try {
						a || null == t.return || t.return();
					} finally {
						if (u) throw o;
					}
				}};
			}
			function _unsupportedIterableToArray(r, a) {
				if (r) {
					if ("string" == typeof r) return _arrayLikeToArray(r, a); let t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
				}
			}
			function _arrayLikeToArray(r, a) {
				(null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n;
			}
			const default_date_options = {
			  format: "YYYY/MM/DD",
			  delimiters: ["/", "-"],
			  strictMode: false
			};
			function isValidFormat(format) {
			  return /(^(y{4}|y{2})[.\/-](m{1,2})[.\/-](d{1,2})$)|(^(m{1,2})[.\/-](d{1,2})[.\/-]((y{4}|y{2})$))|(^(d{1,2})[.\/-](m{1,2})[.\/-]((y{4}|y{2})$))/gi.test(format);
			}
			function zip(date, format) {
			  const zippedArr = [];
			    const len = Math.max(date.length, format.length);
			  for (let i = 0; i < len; i++) {
			    zippedArr.push([date[i], format[i]]);
			  }
			  return zippedArr;
			}
			function isDate(input, options) {
			  if (typeof options === "string") {
			    // Allow backward compatibility for old format isDate(input [, format])
			    options = (0, _merge.default)({
			      format: options
			    }, default_date_options);
			  } else {
			    options = (0, _merge.default)(options, default_date_options);
			  }
			  if (typeof input === "string" && isValidFormat(options.format)) {
			    if (options.strictMode && input.length !== options.format.length) return false;
			    const formatDelimiter = options.delimiters.find(function(delimiter) {
			      return options.format.indexOf(delimiter) !== -1;
			    });
			    const dateDelimiter = options.strictMode ? formatDelimiter : options.delimiters.find(function(delimiter) {
			      return input.indexOf(delimiter) !== -1;
			    });
			    const dateAndFormat = zip(input.split(dateDelimiter), options.format.toLowerCase().split(formatDelimiter));
			    const dateObj = {};
			    const _iterator = _createForOfIteratorHelper(dateAndFormat);
			      let _step;
			    try {
			      for (_iterator.s(); !(_step = _iterator.n()).done;) {
			        const _step$value = _slicedToArray(_step.value, 2);
			          const dateWord = _step$value[0];
			          const formatWord = _step$value[1];
			        if (!dateWord || !formatWord || dateWord.length !== formatWord.length) {
			          return false;
			        }
			        dateObj[formatWord.charAt(0)] = dateWord;
			      }
			    } catch (err) {
			      _iterator.e(err);
			    } finally {
			      _iterator.f();
			    }
			    let fullYear = dateObj.y;

			    // Check if the year starts with a hyphen
			    if (fullYear.startsWith("-")) {
			      return false; // Hyphen before year is not allowed
			    }
			    if (dateObj.y.length === 2) {
			      const parsedYear = parseInt(dateObj.y, 10);
			      if (isNaN(parsedYear)) {
			        return false;
			      }
			      const currentYearLastTwoDigits = new Date().getFullYear() % 100;
			      if (parsedYear < currentYearLastTwoDigits) {
			        fullYear = "20".concat(dateObj.y);
			      } else {
			        fullYear = "19".concat(dateObj.y);
			      }
			    }
			    let month = dateObj.m;
			    if (dateObj.m.length === 1) {
			      month = "0".concat(dateObj.m);
			    }
			    let day = dateObj.d;
			    if (dateObj.d.length === 1) {
			      day = "0".concat(dateObj.d);
			    }
			    return new Date("".concat(fullYear, "-").concat(month, "-").concat(day, "T00:00:00.000Z")).getUTCDate() === +dateObj.d;
			  }
			  if (!options.strictMode) {
			    return Object.prototype.toString.call(input) === "[object Date]" && isFinite(input);
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isDate, isDate.exports));
		return isDate.exports;
	}

	const isTime = {exports: {}};

	let hasRequiredIsTime;

	function requireIsTime() {
		if (hasRequiredIsTime) return isTime.exports;
		hasRequiredIsTime = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isTime;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const default_time_options = {
			  hourFormat: "hour24",
			  mode: "default"
			};
			const formats = {
			  hour24: {
			    default: /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/,
			    withSeconds: /^([01]?[0-9]|2[0-3]):([0-5][0-9]):([0-5][0-9])$/,
			    withOptionalSeconds: /^([01]?[0-9]|2[0-3]):([0-5][0-9])(?::([0-5][0-9]))?$/
			  },
			  hour12: {
			    default: /^(0?[1-9]|1[0-2]):([0-5][0-9]) (A|P)M$/,
			    withSeconds: /^(0?[1-9]|1[0-2]):([0-5][0-9]):([0-5][0-9]) (A|P)M$/,
			    withOptionalSeconds: /^(0?[1-9]|1[0-2]):([0-5][0-9])(?::([0-5][0-9]))? (A|P)M$/
			  }
			};
			function isTime(input, options) {
			  options = (0, _merge.default)(options, default_time_options);
			  if (typeof input !== "string") return false;
			  return formats[options.hourFormat][options.mode].test(input);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isTime, isTime.exports));
		return isTime.exports;
	}

	const isBoolean = {exports: {}};

	const includesArray = {exports: {}};

	let hasRequiredIncludesArray;

	function requireIncludesArray() {
		if (hasRequiredIncludesArray) return includesArray.exports;
		hasRequiredIncludesArray = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = void 0;
			const includes = function includes(arr, val) {
			  return arr.some(function(arrVal) {
			    return val === arrVal;
			  });
			};
			exports$1.default = includes;
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(includesArray, includesArray.exports));
		return includesArray.exports;
	}

	let hasRequiredIsBoolean;

	function requireIsBoolean() {
		if (hasRequiredIsBoolean) return isBoolean.exports;
		hasRequiredIsBoolean = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBoolean;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _includesArray = _interopRequireDefault(/* @__PURE__*/ requireIncludesArray());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const defaultOptions = {
			  loose: false
			};
			const strictBooleans = ["true", "false", "1", "0"];
			const looseBooleans = [].concat(strictBooleans, ["yes", "no"]);
			function isBoolean(str) {
			  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : defaultOptions;
			  (0, _assertString.default)(str);
			  if (options.loose) {
			    return (0, _includesArray.default)(looseBooleans, str.toLowerCase());
			  }
			  return (0, _includesArray.default)(strictBooleans, str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBoolean, isBoolean.exports));
		return isBoolean.exports;
	}

	const isLocale = {exports: {}};

	let hasRequiredIsLocale;

	function requireIsLocale() {
		if (hasRequiredIsLocale) return isLocale.exports;
		hasRequiredIsLocale = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLocale;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/*
			  = 3ALPHA              ; selected ISO 639 codes
			    *2("-" 3ALPHA)      ; permanently reserved
			 */
			const extlang = "([A-Za-z]{3}(-[A-Za-z]{3}){0,2})";

			/*
			  = 2*3ALPHA            ; shortest ISO 639 code
			    ["-" extlang]       ; sometimes followed by
			                        ; extended language subtags
			  / 4ALPHA              ; or reserved for future use
			  / 5*8ALPHA            ; or registered language subtag
			 */
			const language = "(([a-zA-Z]{2,3}(-".concat(extlang, ")?)|([a-zA-Z]{5,8}))");

			/*
			  = 4ALPHA              ; ISO 15924 code
			 */
			const script = "([A-Za-z]{4})";

			/*
			  = 2ALPHA              ; ISO 3166-1 code
			  / 3DIGIT              ; UN M.49 code
			 */
			const region = "([A-Za-z]{2}|\\d{3})";

			/*
			  = 5*8alphanum         ; registered variants
			  / (DIGIT 3alphanum)
			 */
			const variant = "([A-Za-z0-9]{5,8}|(\\d[A-Z-a-z0-9]{3}))";

			/*
			  = DIGIT               ; 0 - 9
			  / %x41-57             ; A - W
			  / %x59-5A             ; Y - Z
			  / %x61-77             ; a - w
			  / %x79-7A             ; y - z
			 */
			const singleton = "(\\d|[A-W]|[Y-Z]|[a-w]|[y-z])";

			/*
			  = singleton 1*("-" (2*8alphanum))
			                        ; Single alphanumerics
			                        ; "x" reserved for private use
			 */
			const extension = "(".concat(singleton, "(-[A-Za-z0-9]{2,8})+)");

			/*
			  = "x" 1*("-" (1*8alphanum))
			 */
			const privateuse = "(x(-[A-Za-z0-9]{1,8})+)";

			// irregular tags do not match the 'langtag' production and would not
			// otherwise be considered 'well-formed'. These tags are all valid, but
			// most are deprecated in favor of more modern subtags or subtag combination

			const irregular = "((en-GB-oed)|(i-ami)|(i-bnn)|(i-default)|(i-enochian)|" + "(i-hak)|(i-klingon)|(i-lux)|(i-mingo)|(i-navajo)|(i-pwn)|(i-tao)|" + "(i-tay)|(i-tsu)|(sgn-BE-FR)|(sgn-BE-NL)|(sgn-CH-DE))";

			// regular tags match the 'langtag' production, but their subtags are not
			// extended language or variant subtags: their meaning is defined by
			// their registration and all of these are deprecated in favor of a more
			// modern subtag or sequence of subtags

			const regular = "((art-lojban)|(cel-gaulish)|(no-bok)|(no-nyn)|(zh-guoyu)|" + "(zh-hakka)|(zh-min)|(zh-min-nan)|(zh-xiang))";

			/*
			  = irregular           ; non-redundant tags registered
			  / regular             ; during the RFC 3066 era

			 */
			const grandfathered = "(".concat(irregular, "|").concat(regular, ")");

			/*
			  RFC 5646 defines delimitation of subtags via a hyphen:

			      "Subtag" refers to a specific section of a tag, delimited by a
			      hyphen, such as the subtags 'zh', 'Hant', and 'CN' in the tag "zh-
			      Hant-CN".  Examples of subtags in this document are enclosed in
			      single quotes ('Hant')

			  However, we need to add "_" to maintain the existing behaviour.
			 */
			const delimiter = "(-|_)";

			/*
			  = language
			    ["-" script]
			    ["-" region]
			    *("-" variant)
			    *("-" extension)
			    ["-" privateuse]
			 */
			const langtag = "".concat(language, "(").concat(delimiter).concat(script, ")?(").concat(delimiter).concat(region, ")?(").concat(delimiter).concat(variant, ")*(").concat(delimiter).concat(extension, ")*(").concat(delimiter).concat(privateuse, ")?");

			/*
			  Regex implementation based on BCP RFC 5646
			  Tags for Identifying Languages
			  https://www.rfc-editor.org/rfc/rfc5646.html
			 */
			const languageTagRegex = new RegExp("(^".concat(privateuse, "$)|(^").concat(grandfathered, "$)|(^").concat(langtag, "$)"));
			function isLocale(str) {
			  (0, _assertString.default)(str);
			  return languageTagRegex.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLocale, isLocale.exports));
		return isLocale.exports;
	}

	const isAbaRouting = {exports: {}};

	let hasRequiredIsAbaRouting;

	function requireIsAbaRouting() {
		if (hasRequiredIsAbaRouting) return isAbaRouting.exports;
		hasRequiredIsAbaRouting = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isAbaRouting;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// http://www.brainjar.com/js/validation/
			// https://www.aba.com/news-research/research-analysis/routing-number-policy-procedures
			// series reserved for future use are excluded
			const isRoutingReg = /^(?!(1[3-9])|(20)|(3[3-9])|(4[0-9])|(5[0-9])|(60)|(7[3-9])|(8[1-9])|(9[0-2])|(9[3-9]))[0-9]{9}$/;
			function isAbaRouting(str) {
			  (0, _assertString.default)(str);
			  if (!isRoutingReg.test(str)) return false;
			  let checkSumVal = 0;
			  for (let i = 0; i < str.length; i++) {
			    if (i % 3 === 0) checkSumVal += str[i] * 3; else if (i % 3 === 1) checkSumVal += str[i] * 7; else checkSumVal += str[i] * 1;
			  }
			  return checkSumVal % 10 === 0;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isAbaRouting, isAbaRouting.exports));
		return isAbaRouting.exports;
	}

	const isAlpha = {};

	let hasRequiredIsAlpha;

	function requireIsAlpha() {
		if (hasRequiredIsAlpha) return isAlpha;
		hasRequiredIsAlpha = 1;

		Object.defineProperty(isAlpha, "__esModule", {
		  value: true
		});
		isAlpha.default = isAlpha$1;
		isAlpha.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		const _alpha = /* @__PURE__*/ requireAlpha();
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		function isAlpha$1(_str) {
		  const locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "en-US";
		  const options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
		  (0, _assertString.default)(_str);
		  let str = _str;
		  const ignore = options.ignore;
		  if (ignore) {
		    if (ignore instanceof RegExp) {
		      str = str.replace(ignore, "");
		    } else if (typeof ignore === "string") {
		      str = str.replace(new RegExp("[".concat(ignore.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&"), "]"), "g"), ""); // escape regex for ignore
		    } else {
		      throw new Error("ignore should be instance of a String or RegExp");
		    }
		  }
		  if (locale in _alpha.alpha) {
		    return _alpha.alpha[locale].test(str);
		  }
		  throw new Error("Invalid locale '".concat(locale, "'"));
		}
		isAlpha.locales = Object.keys(_alpha.alpha);
		return isAlpha;
	}

	const isAlphanumeric = {};

	let hasRequiredIsAlphanumeric;

	function requireIsAlphanumeric() {
		if (hasRequiredIsAlphanumeric) return isAlphanumeric;
		hasRequiredIsAlphanumeric = 1;

		Object.defineProperty(isAlphanumeric, "__esModule", {
		  value: true
		});
		isAlphanumeric.default = isAlphanumeric$1;
		isAlphanumeric.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		const _alpha = /* @__PURE__*/ requireAlpha();
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		function isAlphanumeric$1(_str) {
		  const locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "en-US";
		  const options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
		  (0, _assertString.default)(_str);
		  let str = _str;
		  const ignore = options.ignore;
		  if (ignore) {
		    if (ignore instanceof RegExp) {
		      str = str.replace(ignore, "");
		    } else if (typeof ignore === "string") {
		      str = str.replace(new RegExp("[".concat(ignore.replace(/[-[\]{}()*+?.,\\^$|#\\s]/g, "\\$&"), "]"), "g"), ""); // escape regex for ignore
		    } else {
		      throw new Error("ignore should be instance of a String or RegExp");
		    }
		  }
		  if (locale in _alpha.alphanumeric) {
		    return _alpha.alphanumeric[locale].test(str);
		  }
		  throw new Error("Invalid locale '".concat(locale, "'"));
		}
		isAlphanumeric.locales = Object.keys(_alpha.alphanumeric);
		return isAlphanumeric;
	}

	const isNumeric = {exports: {}};

	let hasRequiredIsNumeric;

	function requireIsNumeric() {
		if (hasRequiredIsNumeric) return isNumeric.exports;
		hasRequiredIsNumeric = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isNumeric;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _alpha = /* @__PURE__*/ requireAlpha();
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const numericNoSymbols = /^[0-9]+$/;
			function isNumeric(str, options) {
			  (0, _assertString.default)(str);
			  if (options && options.no_symbols) {
			    return numericNoSymbols.test(str);
			  }
			  return new RegExp("^[+-]?([0-9]*[".concat((options || {}).locale ? _alpha.decimal[options.locale] : ".", "])?[0-9]+$")).test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isNumeric, isNumeric.exports));
		return isNumeric.exports;
	}

	const isPassportNumber = {};

	let hasRequiredIsPassportNumber;

	function requireIsPassportNumber() {
		if (hasRequiredIsPassportNumber) return isPassportNumber;
		hasRequiredIsPassportNumber = 1;

		Object.defineProperty(isPassportNumber, "__esModule", {
		  value: true
		});
		isPassportNumber.default = isPassportNumber$1;
		isPassportNumber.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		/**
		 * Reference:
		 * https://en.wikipedia.org/ -- Wikipedia
		 * https://docs.microsoft.com/en-us/microsoft-365/compliance/eu-passport-number -- EU Passport Number
		 * https://countrycode.org/ -- Country Codes
		 */
		const passportRegexByCountryCode = {
		  AM: /^[A-Z]{2}\d{7}$/,
		  // ARMENIA
		  AR: /^[A-Z]{3}\d{6}$/,
		  // ARGENTINA
		  AT: /^[A-Z]\d{7}$/,
		  // AUSTRIA
		  AU: /^[A-Z]\d{7}$/,
		  // AUSTRALIA
		  AZ: /^[A-Z]{1}\d{8}$/,
		  // AZERBAIJAN
		  BE: /^[A-Z]{2}\d{6}$/,
		  // BELGIUM
		  BG: /^\d{9}$/,
		  // BULGARIA
		  BR: /^[A-Z]{2}\d{6}$/,
		  // BRAZIL
		  BY: /^[A-Z]{2}\d{7}$/,
		  // BELARUS
		  CA: /^[A-Z]{2}\d{6}$|^[A-Z]\d{6}[A-Z]{2}$/,
		  // CANADA
		  CH: /^[A-Z]\d{7}$/,
		  // SWITZERLAND
		  CN: /^G\d{8}$|^E(?![IO])[A-Z0-9]\d{7}$/,
		  // CHINA [G=Ordinary, E=Electronic] followed by 8-digits, or E followed by any UPPERCASE letter (except I and O) followed by 7 digits
		  CY: /^[A-Z](\d{6}|\d{8})$/,
		  // CYPRUS
		  CZ: /^\d{8}$/,
		  // CZECH REPUBLIC
		  DE: /^[CFGHJKLMNPRTVWXYZ0-9]{9}$/,
		  // GERMANY
		  DK: /^\d{9}$/,
		  // DENMARK
		  DZ: /^\d{9}$/,
		  // ALGERIA
		  EE: /^([A-Z]\d{7}|[A-Z]{2}\d{7})$/,
		  // ESTONIA (K followed by 7-digits), e-passports have 2 UPPERCASE followed by 7 digits
		  ES: /^[A-Z0-9]{2}([A-Z0-9]?)\d{6}$/,
		  // SPAIN
		  FI: /^[A-Z]{2}\d{7}$/,
		  // FINLAND
		  FR: /^\d{2}[A-Z]{2}\d{5}$/,
		  // FRANCE
		  GB: /^\d{9}$/,
		  // UNITED KINGDOM
		  GR: /^[A-Z]{2}\d{7}$/,
		  // GREECE
		  HR: /^\d{9}$/,
		  // CROATIA
		  HU: /^[A-Z]{2}(\d{6}|\d{7})$/,
		  // HUNGARY
		  IE: /^[A-Z0-9]{2}\d{7}$/,
		  // IRELAND
		  IN: /^[A-Z]{1}-?\d{7}$/,
		  // INDIA
		  ID: /^[A-C]\d{7}$/,
		  // INDONESIA
		  IR: /^[A-Z]\d{8}$/,
		  // IRAN
		  IS: /^(A)\d{7}$/,
		  // ICELAND
		  IT: /^[A-Z0-9]{2}\d{7}$/,
		  // ITALY
		  JM: /^[Aa]\d{7}$/,
		  // JAMAICA
		  JP: /^[A-Z]{2}\d{7}$/,
		  // JAPAN
		  KR: /^[MS]\d{8}$/,
		  // SOUTH KOREA, REPUBLIC OF KOREA, [S=PS Passports, M=PM Passports]
		  KZ: /^[a-zA-Z]\d{7}$/,
		  // KAZAKHSTAN
		  LI: /^[a-zA-Z]\d{5}$/,
		  // LIECHTENSTEIN
		  LT: /^[A-Z0-9]{8}$/,
		  // LITHUANIA
		  LU: /^[A-Z0-9]{8}$/,
		  // LUXEMBURG
		  LV: /^[A-Z0-9]{2}\d{7}$/,
		  // LATVIA
		  LY: /^[A-Z0-9]{8}$/,
		  // LIBYA
		  MT: /^\d{7}$/,
		  // MALTA
		  MZ: /^([A-Z]{2}\d{7})|(\d{2}[A-Z]{2}\d{5})$/,
		  // MOZAMBIQUE
		  MY: /^[AHK]\d{8}$/,
		  // MALAYSIA
		  MX: /^\d{10,11}$/,
		  // MEXICO
		  NL: /^[A-Z]{2}[A-Z0-9]{6}\d$/,
		  // NETHERLANDS
		  NZ: /^([Ll]([Aa]|[Dd]|[Ff]|[Hh])|[Ee]([Aa]|[Pp])|[Nn])\d{6}$/,
		  // NEW ZEALAND
		  PH: /^([A-Z](\d{6}|\d{7}[A-Z]))|([A-Z]{2}(\d{6}|\d{7}))$/,
		  // PHILIPPINES
		  PK: /^[A-Z]{2}\d{7}$/,
		  // PAKISTAN
		  PL: /^[A-Z]{2}\d{7}$/,
		  // POLAND
		  PT: /^[A-Z]\d{6}$/,
		  // PORTUGAL
		  RO: /^\d{8,9}$/,
		  // ROMANIA
		  RU: /^\d{9}$/,
		  // RUSSIAN FEDERATION
		  SE: /^\d{8}$/,
		  // SWEDEN
		  SL: /^(P)[A-Z]\d{7}$/,
		  // SLOVENIA
		  SK: /^[0-9A-Z]\d{7}$/,
		  // SLOVAKIA
		  TH: /^[A-Z]{1,2}\d{6,7}$/,
		  // THAILAND
		  TR: /^[A-Z]\d{8}$/,
		  // TURKEY
		  UA: /^[A-Z]{2}\d{6}$/,
		  // UKRAINE
		  US: /^\d{9}$|^[A-Z]\d{8}$/,
		  // UNITED STATES
		  ZA: /^[TAMD]\d{8}$/ // SOUTH AFRICA
		};
		isPassportNumber.locales = Object.keys(passportRegexByCountryCode);

		/**
		 * Check if str is a valid passport number
		 * relative to provided ISO Country Code.
		 *
		 * @param {string} str
		 * @param {string} countryCode
		 * @returns {boolean}
		 */
		function isPassportNumber$1(str, countryCode) {
		  (0, _assertString.default)(str);
		  /** Remove All Whitespaces, Convert to UPPERCASE */
		  const normalizedStr = str.replace(/\s/g, "").toUpperCase();
		  return countryCode.toUpperCase() in passportRegexByCountryCode && passportRegexByCountryCode[countryCode].test(normalizedStr);
		}
		return isPassportNumber;
	}

	const isPort = {exports: {}};

	const isInt = {exports: {}};

	let hasRequiredIsInt;

	function requireIsInt() {
		if (hasRequiredIsInt) return isInt.exports;
		hasRequiredIsInt = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isInt;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _nullUndefinedCheck = _interopRequireDefault(/* @__PURE__*/ requireNullUndefinedCheck());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const int = /^(?:[-+]?(?:0|[1-9][0-9]*))$/;
			const intLeadingZeroes = /^[-+]?[0-9]+$/;
			function isInt(str, options) {
			  (0, _assertString.default)(str);
			  options = options || {};

			  // Get the regex to use for testing, based on whether
			  // leading zeroes are allowed or not.
			  const regex = options.allow_leading_zeroes === false ? int : intLeadingZeroes;

			  // Check min/max/lt/gt
			  const minCheckPassed = !options.hasOwnProperty("min") || (0, _nullUndefinedCheck.default)(options.min) || str >= options.min;
			  const maxCheckPassed = !options.hasOwnProperty("max") || (0, _nullUndefinedCheck.default)(options.max) || str <= options.max;
			  const ltCheckPassed = !options.hasOwnProperty("lt") || (0, _nullUndefinedCheck.default)(options.lt) || str < options.lt;
			  const gtCheckPassed = !options.hasOwnProperty("gt") || (0, _nullUndefinedCheck.default)(options.gt) || str > options.gt;
			  return regex.test(str) && minCheckPassed && maxCheckPassed && ltCheckPassed && gtCheckPassed;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isInt, isInt.exports));
		return isInt.exports;
	}

	let hasRequiredIsPort;

	function requireIsPort() {
		if (hasRequiredIsPort) return isPort.exports;
		hasRequiredIsPort = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isPort;
			const _isInt = _interopRequireDefault(/* @__PURE__*/ requireIsInt());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isPort(str) {
			  return (0, _isInt.default)(str, {
			    allow_leading_zeroes: false,
			    min: 0,
			    max: 65535
			  });
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isPort, isPort.exports));
		return isPort.exports;
	}

	const isLowercase = {exports: {}};

	let hasRequiredIsLowercase;

	function requireIsLowercase() {
		if (hasRequiredIsLowercase) return isLowercase.exports;
		hasRequiredIsLowercase = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLowercase;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isLowercase(str) {
			  (0, _assertString.default)(str);
			  return str === str.toLowerCase();
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLowercase, isLowercase.exports));
		return isLowercase.exports;
	}

	const isUppercase = {exports: {}};

	let hasRequiredIsUppercase;

	function requireIsUppercase() {
		if (hasRequiredIsUppercase) return isUppercase.exports;
		hasRequiredIsUppercase = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isUppercase;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isUppercase(str) {
			  (0, _assertString.default)(str);
			  return str === str.toUpperCase();
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isUppercase, isUppercase.exports));
		return isUppercase.exports;
	}

	const isIMEI = {exports: {}};

	let hasRequiredIsIMEI;

	function requireIsIMEI() {
		if (hasRequiredIsIMEI) return isIMEI.exports;
		hasRequiredIsIMEI = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isIMEI;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const imeiRegexWithoutHyphens = /^[0-9]{15}$/;
			const imeiRegexWithHyphens = /^\d{2}-\d{6}-\d{6}-\d{1}$/;
			function isIMEI(str, options) {
			  (0, _assertString.default)(str);
			  options = options || {};

			  // default regex for checking imei is the one without hyphens

			  let imeiRegex = imeiRegexWithoutHyphens;
			  if (options.allow_hyphens) {
			    imeiRegex = imeiRegexWithHyphens;
			  }
			  if (!imeiRegex.test(str)) {
			    return false;
			  }
			  str = str.replace(/-/g, "");
			  let sum = 0;
			    let mul = 2;
			    const l = 14;
			  for (let i = 0; i < l; i++) {
			    const digit = str.substring(l - i - 1, l - i);
			    const tp = parseInt(digit, 10) * mul;
			    if (tp >= 10) {
			      sum += tp % 10 + 1;
			    } else {
			      sum += tp;
			    }
			    if (mul === 1) {
			      mul += 1;
			    } else {
			      mul -= 1;
			    }
			  }
			  const chk = (10 - sum % 10) % 10;
			  if (chk !== parseInt(str.substring(14, 15), 10)) {
			    return false;
			  }
			  return true;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isIMEI, isIMEI.exports));
		return isIMEI.exports;
	}

	const isAscii = {exports: {}};

	let hasRequiredIsAscii;

	function requireIsAscii() {
		if (hasRequiredIsAscii) return isAscii.exports;
		hasRequiredIsAscii = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isAscii;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/* eslint-disable no-control-regex */
			const ascii = /^[\x00-\x7F]+$/;
			/* eslint-enable no-control-regex */

			function isAscii(str) {
			  (0, _assertString.default)(str);
			  return ascii.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isAscii, isAscii.exports));
		return isAscii.exports;
	}

	const isFullWidth = {};

	let hasRequiredIsFullWidth;

	function requireIsFullWidth() {
		if (hasRequiredIsFullWidth) return isFullWidth;
		hasRequiredIsFullWidth = 1;

		Object.defineProperty(isFullWidth, "__esModule", {
		  value: true
		});
		isFullWidth.default = isFullWidth$1;
		isFullWidth.fullWidth = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		const fullWidth = isFullWidth.fullWidth = /[^\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/;
		function isFullWidth$1(str) {
		  (0, _assertString.default)(str);
		  return fullWidth.test(str);
		}
		return isFullWidth;
	}

	const isHalfWidth = {};

	let hasRequiredIsHalfWidth;

	function requireIsHalfWidth() {
		if (hasRequiredIsHalfWidth) return isHalfWidth;
		hasRequiredIsHalfWidth = 1;

		Object.defineProperty(isHalfWidth, "__esModule", {
		  value: true
		});
		isHalfWidth.default = isHalfWidth$1;
		isHalfWidth.halfWidth = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		const halfWidth = isHalfWidth.halfWidth = /[\u0020-\u007E\uFF61-\uFF9F\uFFA0-\uFFDC\uFFE8-\uFFEE0-9a-zA-Z]/;
		function isHalfWidth$1(str) {
		  (0, _assertString.default)(str);
		  return halfWidth.test(str);
		}
		return isHalfWidth;
	}

	const isVariableWidth = {exports: {}};

	let hasRequiredIsVariableWidth;

	function requireIsVariableWidth() {
		if (hasRequiredIsVariableWidth) return isVariableWidth.exports;
		hasRequiredIsVariableWidth = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isVariableWidth;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isFullWidth = /* @__PURE__*/ requireIsFullWidth();
			const _isHalfWidth = /* @__PURE__*/ requireIsHalfWidth();
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isVariableWidth(str) {
			  (0, _assertString.default)(str);
			  return _isFullWidth.fullWidth.test(str) && _isHalfWidth.halfWidth.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isVariableWidth, isVariableWidth.exports));
		return isVariableWidth.exports;
	}

	const isMultibyte = {exports: {}};

	let hasRequiredIsMultibyte;

	function requireIsMultibyte() {
		if (hasRequiredIsMultibyte) return isMultibyte.exports;
		hasRequiredIsMultibyte = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMultibyte;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/* eslint-disable no-control-regex */
			const multibyte = /[^\x00-\x7F]/;
			/* eslint-enable no-control-regex */

			function isMultibyte(str) {
			  (0, _assertString.default)(str);
			  return multibyte.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMultibyte, isMultibyte.exports));
		return isMultibyte.exports;
	}

	const isSemVer = {exports: {}};

	const multilineRegex = {exports: {}};

	let hasRequiredMultilineRegex;

	function requireMultilineRegex() {
		if (hasRequiredMultilineRegex) return multilineRegex.exports;
		hasRequiredMultilineRegex = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = multilineRegexp;
			/**
			 * Build RegExp object from an array
			 * of multiple/multi-line regexp parts
			 *
			 * @param {string[]} parts
			 * @param {string} flags
			 * @returns {object} - RegExp object
			 */
			function multilineRegexp(parts, flags) {
			  const regexpAsStringLiteral = parts.join("");
			  return new RegExp(regexpAsStringLiteral, flags);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(multilineRegex, multilineRegex.exports));
		return multilineRegex.exports;
	}

	let hasRequiredIsSemVer;

	function requireIsSemVer() {
		if (hasRequiredIsSemVer) return isSemVer.exports;
		hasRequiredIsSemVer = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isSemVer;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _multilineRegex = _interopRequireDefault(/* @__PURE__*/ requireMultilineRegex());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/**
			 * Regular Expression to match
			 * semantic versioning (SemVer)
			 * built from multi-line, multi-parts regexp
			 * Reference: https://semver.org/
			 */
			const semanticVersioningRegex = (0, _multilineRegex.default)(["^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)", "(?:-((?:0|[1-9]\\d*|\\d*[a-z-][0-9a-z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-z-][0-9a-z-]*))*))", "?(?:\\+([0-9a-z-]+(?:\\.[0-9a-z-]+)*))?$"], "i");
			function isSemVer(str) {
			  (0, _assertString.default)(str);
			  return semanticVersioningRegex.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isSemVer, isSemVer.exports));
		return isSemVer.exports;
	}

	const isSurrogatePair = {exports: {}};

	let hasRequiredIsSurrogatePair;

	function requireIsSurrogatePair() {
		if (hasRequiredIsSurrogatePair) return isSurrogatePair.exports;
		hasRequiredIsSurrogatePair = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isSurrogatePair;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const surrogatePair = /[\uD800-\uDBFF][\uDC00-\uDFFF]/;
			function isSurrogatePair(str) {
			  (0, _assertString.default)(str);
			  return surrogatePair.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isSurrogatePair, isSurrogatePair.exports));
		return isSurrogatePair.exports;
	}

	const isDecimal = {exports: {}};

	let hasRequiredIsDecimal;

	function requireIsDecimal() {
		if (hasRequiredIsDecimal) return isDecimal.exports;
		hasRequiredIsDecimal = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isDecimal;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _includesArray = _interopRequireDefault(/* @__PURE__*/ requireIncludesArray());
			const _alpha = /* @__PURE__*/ requireAlpha();
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function decimalRegExp(options) {
			  const regExp = new RegExp("^[-+]?([0-9]+)?(\\".concat(_alpha.decimal[options.locale], "[0-9]{").concat(options.decimal_digits, "})").concat(options.force_decimal ? "" : "?", "$"));
			  return regExp;
			}
			const default_decimal_options = {
			  force_decimal: false,
			  decimal_digits: "1,",
			  locale: "en-US"
			};
			const blacklist = ["", "-", "+"];
			function isDecimal(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_decimal_options);
			  if (options.locale in _alpha.decimal) {
			    return !(0, _includesArray.default)(blacklist, str.replace(/ /g, "")) && decimalRegExp(options).test(str);
			  }
			  throw new Error("Invalid locale '".concat(options.locale, "'"));
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isDecimal, isDecimal.exports));
		return isDecimal.exports;
	}

	const isHexadecimal = {exports: {}};

	let hasRequiredIsHexadecimal;

	function requireIsHexadecimal() {
		if (hasRequiredIsHexadecimal) return isHexadecimal.exports;
		hasRequiredIsHexadecimal = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isHexadecimal;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const hexadecimal = /^(0x|0h)?[0-9A-F]+$/i;
			function isHexadecimal(str) {
			  (0, _assertString.default)(str);
			  return hexadecimal.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isHexadecimal, isHexadecimal.exports));
		return isHexadecimal.exports;
	}

	const isOctal = {exports: {}};

	let hasRequiredIsOctal;

	function requireIsOctal() {
		if (hasRequiredIsOctal) return isOctal.exports;
		hasRequiredIsOctal = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isOctal;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const octal = /^(0o)?[0-7]+$/i;
			function isOctal(str) {
			  (0, _assertString.default)(str);
			  return octal.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isOctal, isOctal.exports));
		return isOctal.exports;
	}

	const isDivisibleBy = {exports: {}};

	let hasRequiredIsDivisibleBy;

	function requireIsDivisibleBy() {
		if (hasRequiredIsDivisibleBy) return isDivisibleBy.exports;
		hasRequiredIsDivisibleBy = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isDivisibleBy;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _toFloat = _interopRequireDefault(/* @__PURE__*/ requireToFloat());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isDivisibleBy(str, num) {
			  (0, _assertString.default)(str);
			  return (0, _toFloat.default)(str) % parseInt(num, 10) === 0;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isDivisibleBy, isDivisibleBy.exports));
		return isDivisibleBy.exports;
	}

	const isHexColor = {exports: {}};

	let hasRequiredIsHexColor;

	function requireIsHexColor() {
		if (hasRequiredIsHexColor) return isHexColor.exports;
		hasRequiredIsHexColor = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isHexColor;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const hexcolor = /^#?([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i;
			const hexcolor_with_prefix = /^#([0-9A-F]{3}|[0-9A-F]{4}|[0-9A-F]{6}|[0-9A-F]{8})$/i;
			const default_is_hexcolor_options = {
			  require_hashtag: false
			};
			function isHexColor(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_is_hexcolor_options);
			  const hexcolor_regex = options.require_hashtag ? hexcolor_with_prefix : hexcolor;
			  return hexcolor_regex.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isHexColor, isHexColor.exports));
		return isHexColor.exports;
	}

	const isRgbColor = {exports: {}};

	let hasRequiredIsRgbColor;

	function requireIsRgbColor() {
		if (hasRequiredIsRgbColor) return isRgbColor.exports;
		hasRequiredIsRgbColor = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isRgbColor;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			const rgbColor = /^rgb\((([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]),){2}([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5])\)$/;
			const rgbaColor = /^rgba\((([0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]),){3}(0?\.\d\d?|1(\.0)?|0(\.0)?)\)$/;
			const rgbColorPercent = /^rgb\((([0-9]%|[1-9][0-9]%|100%),){2}([0-9]%|[1-9][0-9]%|100%)\)$/;
			const rgbaColorPercent = /^rgba\((([0-9]%|[1-9][0-9]%|100%),){3}(0?\.\d\d?|1(\.0)?|0(\.0)?)\)$/;
			const startsWithRgb = /^rgba?/;
			function isRgbColor(str, options) {
			  (0, _assertString.default)(str);
			  // default options to true for percent and false for spaces
			  let allowSpaces = false;
			  let includePercentValues = true;
			  if (_typeof(options) !== "object") {
			    if (arguments.length >= 2) {
			      includePercentValues = arguments[1];
			    }
			  } else {
			    allowSpaces = options.allowSpaces !== undefined ? options.allowSpaces : allowSpaces;
			    includePercentValues = options.includePercentValues !== undefined ? options.includePercentValues : includePercentValues;
			  }
			  if (allowSpaces) {
			    // make sure it starts with continous rgba? without spaces before stripping
			    if (!startsWithRgb.test(str)) {
			      return false;
			    }
			    // strip all whitespace
			    str = str.replace(/\s/g, "");
			  }
			  if (!includePercentValues) {
			    return rgbColor.test(str) || rgbaColor.test(str);
			  }
			  return rgbColor.test(str) || rgbaColor.test(str) || rgbColorPercent.test(str) || rgbaColorPercent.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isRgbColor, isRgbColor.exports));
		return isRgbColor.exports;
	}

	const isHSL = {exports: {}};

	let hasRequiredIsHSL;

	function requireIsHSL() {
		if (hasRequiredIsHSL) return isHSL.exports;
		hasRequiredIsHSL = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isHSL;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const hslComma = /^hsla?\(((\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?))(deg|grad|rad|turn)?(,(\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?)%){2}(,((\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?)%?))?\)$/i;
			const hslSpace = /^hsla?\(((\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?))(deg|grad|rad|turn)?(\s(\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?)%){2}\s?(\/\s((\+|\-)?([0-9]+(\.[0-9]+)?(e(\+|\-)?[0-9]+)?|\.[0-9]+(e(\+|\-)?[0-9]+)?)%?)\s?)?\)$/i;
			function isHSL(str) {
			  (0, _assertString.default)(str);

			  // Strip duplicate spaces before calling the validation regex (See  #1598 for more info)
			  const strippedStr = str.replace(/\s+/g, " ").replace(/\s?(hsla?\(|\)|,)\s?/ig, "$1");
			  if (strippedStr.indexOf(",") !== -1) {
			    return hslComma.test(strippedStr);
			  }
			  return hslSpace.test(strippedStr);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isHSL, isHSL.exports));
		return isHSL.exports;
	}

	const isISRC = {exports: {}};

	let hasRequiredIsISRC;

	function requireIsISRC() {
		if (hasRequiredIsISRC) return isISRC.exports;
		hasRequiredIsISRC = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISRC;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// see http://isrc.ifpi.org/en/isrc-standard/code-syntax
			const isrc = /^[A-Z]{2}[0-9A-Z]{3}\d{2}\d{5}$/;
			function isISRC(str) {
			  (0, _assertString.default)(str);
			  return isrc.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISRC, isISRC.exports));
		return isISRC.exports;
	}

	const isIBAN = {};

	let hasRequiredIsIBAN;

	function requireIsIBAN() {
		if (hasRequiredIsIBAN) return isIBAN;
		hasRequiredIsIBAN = 1;

		Object.defineProperty(isIBAN, "__esModule", {
		  value: true
		});
		isIBAN.default = isIBAN$1;
		isIBAN.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		const _includesArray = _interopRequireDefault(/* @__PURE__*/ requireIncludesArray());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		/**
		 * List of country codes with
		 * corresponding IBAN regular expression
		 * Reference: https://en.wikipedia.org/wiki/International_Bank_Account_Number
		 */
		const ibanRegexThroughCountryCode = {
		  AD: /^(AD[0-9]{2})\d{8}[A-Z0-9]{12}$/,
		  AE: /^(AE[0-9]{2})\d{3}\d{16}$/,
		  AL: /^(AL[0-9]{2})\d{8}[A-Z0-9]{16}$/,
		  AT: /^(AT[0-9]{2})\d{16}$/,
		  AZ: /^(AZ[0-9]{2})[A-Z0-9]{4}\d{20}$/,
		  BA: /^(BA[0-9]{2})\d{16}$/,
		  BE: /^(BE[0-9]{2})\d{12}$/,
		  BG: /^(BG[0-9]{2})[A-Z]{4}\d{6}[A-Z0-9]{8}$/,
		  BH: /^(BH[0-9]{2})[A-Z]{4}[A-Z0-9]{14}$/,
		  BR: /^(BR[0-9]{2})\d{23}[A-Z]{1}[A-Z0-9]{1}$/,
		  BY: /^(BY[0-9]{2})[A-Z0-9]{4}\d{20}$/,
		  CH: /^(CH[0-9]{2})\d{5}[A-Z0-9]{12}$/,
		  CR: /^(CR[0-9]{2})\d{18}$/,
		  CY: /^(CY[0-9]{2})\d{8}[A-Z0-9]{16}$/,
		  CZ: /^(CZ[0-9]{2})\d{20}$/,
		  DE: /^(DE[0-9]{2})\d{18}$/,
		  DK: /^(DK[0-9]{2})\d{14}$/,
		  DO: /^(DO[0-9]{2})[A-Z]{4}\d{20}$/,
		  DZ: /^(DZ\d{24})$/,
		  EE: /^(EE[0-9]{2})\d{16}$/,
		  EG: /^(EG[0-9]{2})\d{25}$/,
		  ES: /^(ES[0-9]{2})\d{20}$/,
		  FI: /^(FI[0-9]{2})\d{14}$/,
		  FO: /^(FO[0-9]{2})\d{14}$/,
		  FR: /^(FR[0-9]{2})\d{10}[A-Z0-9]{11}\d{2}$/,
		  GB: /^(GB[0-9]{2})[A-Z]{4}\d{14}$/,
		  GE: /^(GE[0-9]{2})[A-Z0-9]{2}\d{16}$/,
		  GI: /^(GI[0-9]{2})[A-Z]{4}[A-Z0-9]{15}$/,
		  GL: /^(GL[0-9]{2})\d{14}$/,
		  GR: /^(GR[0-9]{2})\d{7}[A-Z0-9]{16}$/,
		  GT: /^(GT[0-9]{2})[A-Z0-9]{4}[A-Z0-9]{20}$/,
		  HR: /^(HR[0-9]{2})\d{17}$/,
		  HU: /^(HU[0-9]{2})\d{24}$/,
		  IE: /^(IE[0-9]{2})[A-Z]{4}\d{14}$/,
		  IL: /^(IL[0-9]{2})\d{19}$/,
		  IQ: /^(IQ[0-9]{2})[A-Z]{4}\d{15}$/,
		  IR: /^(IR[0-9]{2})\d{22}$/,
		  IS: /^(IS[0-9]{2})\d{22}$/,
		  IT: /^(IT[0-9]{2})[A-Z]{1}\d{10}[A-Z0-9]{12}$/,
		  JO: /^(JO[0-9]{2})[A-Z]{4}\d{22}$/,
		  KW: /^(KW[0-9]{2})[A-Z]{4}[A-Z0-9]{22}$/,
		  KZ: /^(KZ[0-9]{2})\d{3}[A-Z0-9]{13}$/,
		  LB: /^(LB[0-9]{2})\d{4}[A-Z0-9]{20}$/,
		  LC: /^(LC[0-9]{2})[A-Z]{4}[A-Z0-9]{24}$/,
		  LI: /^(LI[0-9]{2})\d{5}[A-Z0-9]{12}$/,
		  LT: /^(LT[0-9]{2})\d{16}$/,
		  LU: /^(LU[0-9]{2})\d{3}[A-Z0-9]{13}$/,
		  LV: /^(LV[0-9]{2})[A-Z]{4}[A-Z0-9]{13}$/,
		  MA: /^(MA[0-9]{26})$/,
		  MC: /^(MC[0-9]{2})\d{10}[A-Z0-9]{11}\d{2}$/,
		  MD: /^(MD[0-9]{2})[A-Z0-9]{20}$/,
		  ME: /^(ME[0-9]{2})\d{18}$/,
		  MK: /^(MK[0-9]{2})\d{3}[A-Z0-9]{10}\d{2}$/,
		  MR: /^(MR[0-9]{2})\d{23}$/,
		  MT: /^(MT[0-9]{2})[A-Z]{4}\d{5}[A-Z0-9]{18}$/,
		  MU: /^(MU[0-9]{2})[A-Z]{4}\d{19}[A-Z]{3}$/,
		  MZ: /^(MZ[0-9]{2})\d{21}$/,
		  NL: /^(NL[0-9]{2})[A-Z]{4}\d{10}$/,
		  NO: /^(NO[0-9]{2})\d{11}$/,
		  PK: /^(PK[0-9]{2})[A-Z0-9]{4}\d{16}$/,
		  PL: /^(PL[0-9]{2})\d{24}$/,
		  PS: /^(PS[0-9]{2})[A-Z]{4}[A-Z0-9]{21}$/,
		  PT: /^(PT[0-9]{2})\d{21}$/,
		  QA: /^(QA[0-9]{2})[A-Z]{4}[A-Z0-9]{21}$/,
		  RO: /^(RO[0-9]{2})[A-Z]{4}[A-Z0-9]{16}$/,
		  RS: /^(RS[0-9]{2})\d{18}$/,
		  SA: /^(SA[0-9]{2})\d{2}[A-Z0-9]{18}$/,
		  SC: /^(SC[0-9]{2})[A-Z]{4}\d{20}[A-Z]{3}$/,
		  SE: /^(SE[0-9]{2})\d{20}$/,
		  SI: /^(SI[0-9]{2})\d{15}$/,
		  SK: /^(SK[0-9]{2})\d{20}$/,
		  SM: /^(SM[0-9]{2})[A-Z]{1}\d{10}[A-Z0-9]{12}$/,
		  SV: /^(SV[0-9]{2})[A-Z0-9]{4}\d{20}$/,
		  TL: /^(TL[0-9]{2})\d{19}$/,
		  TN: /^(TN[0-9]{2})\d{20}$/,
		  TR: /^(TR[0-9]{2})\d{5}[A-Z0-9]{17}$/,
		  UA: /^(UA[0-9]{2})\d{6}[A-Z0-9]{19}$/,
		  VA: /^(VA[0-9]{2})\d{18}$/,
		  VG: /^(VG[0-9]{2})[A-Z]{4}\d{16}$/,
		  XK: /^(XK[0-9]{2})\d{16}$/
		};

		/**
		 * Check if the country codes passed are valid using the
		 * ibanRegexThroughCountryCode as a reference
		 *
		 * @param {Array} countryCodeArray
		 * @returns {boolean}
		 */

		function hasOnlyValidCountryCodes(countryCodeArray) {
		  const countryCodeArrayFilteredWithObjectIbanCode = countryCodeArray.filter(function(countryCode) {
		    return !(countryCode in ibanRegexThroughCountryCode);
		  });
		  if (countryCodeArrayFilteredWithObjectIbanCode.length > 0) {
		    return false;
		  }
		  return true;
		}

		/**
		 * Check whether string has correct universal IBAN format
		 * The IBAN consists of up to 34 alphanumeric characters, as follows:
		 * Country Code using ISO 3166-1 alpha-2, two letters
		 * check digits, two digits and
		 * Basic Bank Account Number (BBAN), up to 30 alphanumeric characters.
		 * NOTE: Permitted IBAN characters are: digits [0-9] and the 26 latin alphabetic [A-Z]
		 *
		 * @param {string} str - string under validation
		 * @param {object} options - object to pass the countries to be either whitelisted or blacklisted
		 * @returns {boolean}
		 */
		function hasValidIbanFormat(str, options) {
		  // Strip white spaces and hyphens
		  const strippedStr = str.replace(/[\s\-]+/gi, "").toUpperCase();
		  const isoCountryCode = strippedStr.slice(0, 2).toUpperCase();
		  const isoCountryCodeInIbanRegexCodeObject = isoCountryCode in ibanRegexThroughCountryCode;
		  if (options.whitelist) {
		    if (!hasOnlyValidCountryCodes(options.whitelist)) {
		      return false;
		    }
		    const isoCountryCodeInWhiteList = (0, _includesArray.default)(options.whitelist, isoCountryCode);
		    if (!isoCountryCodeInWhiteList) {
		      return false;
		    }
		  }
		  if (options.blacklist) {
		    const isoCountryCodeInBlackList = (0, _includesArray.default)(options.blacklist, isoCountryCode);
		    if (isoCountryCodeInBlackList) {
		      return false;
		    }
		  }
		  return isoCountryCodeInIbanRegexCodeObject && ibanRegexThroughCountryCode[isoCountryCode].test(strippedStr);
		}

		/**
		   * Check whether string has valid IBAN Checksum
		   * by performing basic mod-97 operation and
		   * the remainder should equal 1
		   * -- Start by rearranging the IBAN by moving the four initial characters to the end of the string
		   * -- Replace each letter in the string with two digits, A -> 10, B = 11, Z = 35
		   * -- Interpret the string as a decimal integer and
		   * -- compute the remainder on division by 97 (mod 97)
		   * Reference: https://en.wikipedia.org/wiki/International_Bank_Account_Number
		   *
		   * @param {string} str
		   * @returns {boolean}
		   */
		function hasValidIbanChecksum(str) {
		  const strippedStr = str.replace(/[^A-Z0-9]+/gi, "").toUpperCase(); // Keep only digits and A-Z latin alphabetic
		  const rearranged = strippedStr.slice(4) + strippedStr.slice(0, 4);
		  const alphaCapsReplacedWithDigits = rearranged.replace(/[A-Z]/g, function(char) {
		    return char.charCodeAt(0) - 55;
		  });
		  const remainder = alphaCapsReplacedWithDigits.match(/\d{1,7}/g).reduce(function(acc, value) {
		    return Number(acc + value) % 97;
		  }, "");
		  return remainder === 1;
		}
		function isIBAN$1(str) {
		  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
		  (0, _assertString.default)(str);
		  return hasValidIbanFormat(str, options) && hasValidIbanChecksum(str);
		}
		isIBAN.locales = Object.keys(ibanRegexThroughCountryCode);
		return isIBAN;
	}

	const isBIC = {exports: {}};

	const isISO31661Alpha2 = {};

	let hasRequiredIsISO31661Alpha2;

	function requireIsISO31661Alpha2() {
		if (hasRequiredIsISO31661Alpha2) return isISO31661Alpha2;
		hasRequiredIsISO31661Alpha2 = 1;

		Object.defineProperty(isISO31661Alpha2, "__esModule", {
		  value: true
		});
		isISO31661Alpha2.CountryCodes = void 0;
		isISO31661Alpha2.default = isISO31661Alpha2$1;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		// from https://en.wikipedia.org/wiki/ISO_3166-1_alpha-2
		const validISO31661Alpha2CountriesCodes = new Set(["AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI", "VN", "VU", "WF", "WS", "YE", "YT", "ZA", "ZM", "ZW"]);
		function isISO31661Alpha2$1(str) {
		  (0, _assertString.default)(str);
		  return validISO31661Alpha2CountriesCodes.has(str.toUpperCase());
		}
		isISO31661Alpha2.CountryCodes = validISO31661Alpha2CountriesCodes;
		return isISO31661Alpha2;
	}

	let hasRequiredIsBIC;

	function requireIsBIC() {
		if (hasRequiredIsBIC) return isBIC.exports;
		hasRequiredIsBIC = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBIC;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isISO31661Alpha = /* @__PURE__*/ requireIsISO31661Alpha2();
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// https://en.wikipedia.org/wiki/ISO_9362
			const isBICReg = /^[A-Za-z]{6}[A-Za-z0-9]{2}([A-Za-z0-9]{3})?$/;
			function isBIC(str) {
			  (0, _assertString.default)(str);

			  // toUpperCase() should be removed when a new major version goes out that changes
			  // the regex to [A-Z] (per the spec).
			  const countryCode = str.slice(4, 6).toUpperCase();
			  if (!_isISO31661Alpha.CountryCodes.has(countryCode) && countryCode !== "XK") {
			    return false;
			  }
			  return isBICReg.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBIC, isBIC.exports));
		return isBIC.exports;
	}

	const isMD5 = {exports: {}};

	let hasRequiredIsMD5;

	function requireIsMD5() {
		if (hasRequiredIsMD5) return isMD5.exports;
		hasRequiredIsMD5 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMD5;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const md5 = /^[a-f0-9]{32}$/;
			function isMD5(str) {
			  (0, _assertString.default)(str);
			  return md5.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMD5, isMD5.exports));
		return isMD5.exports;
	}

	const isHash = {exports: {}};

	let hasRequiredIsHash;

	function requireIsHash() {
		if (hasRequiredIsHash) return isHash.exports;
		hasRequiredIsHash = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isHash;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const lengths = {
			  md5: 32,
			  md4: 32,
			  sha1: 40,
			  sha256: 64,
			  sha384: 96,
			  sha512: 128,
			  ripemd128: 32,
			  ripemd160: 40,
			  tiger128: 32,
			  tiger160: 40,
			  tiger192: 48,
			  crc32: 8,
			  crc32b: 8
			};
			function isHash(str, algorithm) {
			  (0, _assertString.default)(str);
			  const hash = new RegExp("^[a-fA-F0-9]{".concat(lengths[algorithm], "}$"));
			  return hash.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isHash, isHash.exports));
		return isHash.exports;
	}

	const isJWT = {exports: {}};

	const isBase64 = {exports: {}};

	let hasRequiredIsBase64;

	function requireIsBase64() {
		if (hasRequiredIsBase64) return isBase64.exports;
		hasRequiredIsBase64 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBase64;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const base64WithPadding = /^[A-Za-z0-9+/]+={0,2}$/;
			const base64WithoutPadding = /^[A-Za-z0-9+/]+$/;
			const base64UrlWithPadding = /^[A-Za-z0-9_-]+={0,2}$/;
			const base64UrlWithoutPadding = /^[A-Za-z0-9_-]+$/;
			function isBase64(str, options) {
			  let _options;
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, {
			    urlSafe: false,
			    padding: !((_options = options) !== null && _options !== void 0 && _options.urlSafe)
			  });
			  if (str === "") return true;
			  if (options.padding && str.length % 4 !== 0) return false;
			  let regex;
			  if (options.urlSafe) {
			    regex = options.padding ? base64UrlWithPadding : base64UrlWithoutPadding;
			  } else {
			    regex = options.padding ? base64WithPadding : base64WithoutPadding;
			  }
			  return (!options.padding || str.length % 4 === 0) && regex.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBase64, isBase64.exports));
		return isBase64.exports;
	}

	let hasRequiredIsJWT;

	function requireIsJWT() {
		if (hasRequiredIsJWT) return isJWT.exports;
		hasRequiredIsJWT = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isJWT;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isBase = _interopRequireDefault(/* @__PURE__*/ requireIsBase64());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isJWT(str) {
			  (0, _assertString.default)(str);
			  const dotSplit = str.split(".");
			  const len = dotSplit.length;
			  if (len !== 3) {
			    return false;
			  }
			  return dotSplit.reduce(function(acc, currElem) {
			    return acc && (0, _isBase.default)(currElem, {
			      urlSafe: true
			    });
			  }, true);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isJWT, isJWT.exports));
		return isJWT.exports;
	}

	const isJSON = {exports: {}};

	let hasRequiredIsJSON;

	function requireIsJSON() {
		if (hasRequiredIsJSON) return isJSON.exports;
		hasRequiredIsJSON = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isJSON;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _includesArray = _interopRequireDefault(/* @__PURE__*/ requireIncludesArray());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			const default_json_options = {
			  allow_primitives: false
			};
			function isJSON(str, options) {
			  (0, _assertString.default)(str);
			  try {
			    options = (0, _merge.default)(options, default_json_options);
			    let primitives = [];
			    if (options.allow_primitives) {
			      primitives = [null, false, true];
			    }
			    const obj = JSON.parse(str);
			    return (0, _includesArray.default)(primitives, obj) || !!obj && _typeof(obj) === "object";
			  } catch (e) {/* ignore */}
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isJSON, isJSON.exports));
		return isJSON.exports;
	}

	const isEmpty = {exports: {}};

	let hasRequiredIsEmpty;

	function requireIsEmpty() {
		if (hasRequiredIsEmpty) return isEmpty.exports;
		hasRequiredIsEmpty = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isEmpty;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const default_is_empty_options = {
			  ignore_whitespace: false
			};
			function isEmpty(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_is_empty_options);
			  return (options.ignore_whitespace ? str.trim().length : str.length) === 0;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isEmpty, isEmpty.exports));
		return isEmpty.exports;
	}

	const isLength = {exports: {}};

	let hasRequiredIsLength;

	function requireIsLength() {
		if (hasRequiredIsLength) return isLength.exports;
		hasRequiredIsLength = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLength;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}

			function isLength(str, options) {
			  (0, _assertString.default)(str);
			  let min;
			  let max;
			  if (_typeof(options) === "object") {
			    min = options.min || 0;
			    max = options.max;
			  } else {
			    // backwards compatibility: isLength(str, min [, max])
			    min = arguments[1] || 0;
			    max = arguments[2];
			  }
			  const presentationSequences = str.match(/[^\uFE0F\uFE0E][\uFE0F\uFE0E]/g) || [];
			  const surrogatePairs = str.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || [];
			  const len = str.length - presentationSequences.length - surrogatePairs.length;
			  const isInsideRange = len >= min && (typeof max === "undefined" || len <= max);
			  if (isInsideRange && Array.isArray(options === null || options === void 0 ? void 0 : options.discreteLengths)) {
			    return options.discreteLengths.some(function(discreteLen) {
			      return discreteLen === len;
			    });
			  }
			  return isInsideRange;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLength, isLength.exports));
		return isLength.exports;
	}

	const isULID = {exports: {}};

	let hasRequiredIsULID;

	function requireIsULID() {
		if (hasRequiredIsULID) return isULID.exports;
		hasRequiredIsULID = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isULID;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isULID(str) {
			  (0, _assertString.default)(str);
			  return /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isULID, isULID.exports));
		return isULID.exports;
	}

	const isUUID = {exports: {}};

	let hasRequiredIsUUID;

	function requireIsUUID() {
		if (hasRequiredIsUUID) return isUUID.exports;
		hasRequiredIsUUID = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isUUID;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const uuid = {
			  1: /^[0-9A-F]{8}-[0-9A-F]{4}-1[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  2: /^[0-9A-F]{8}-[0-9A-F]{4}-2[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  3: /^[0-9A-F]{8}-[0-9A-F]{4}-3[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  4: /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  5: /^[0-9A-F]{8}-[0-9A-F]{4}-5[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  6: /^[0-9A-F]{8}-[0-9A-F]{4}-6[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  7: /^[0-9A-F]{8}-[0-9A-F]{4}-7[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  8: /^[0-9A-F]{8}-[0-9A-F]{4}-8[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i,
			  nil: /^00000000-0000-0000-0000-000000000000$/i,
			  max: /^ffffffff-ffff-ffff-ffff-ffffffffffff$/i,
			  loose: /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i,
			  // From https://github.com/uuidjs/uuid/blob/main/src/regex.js
			  all: /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/i
			};
			function isUUID(str, version) {
			  (0, _assertString.default)(str);
			  if (version === undefined || version === null) {
			    version = "all";
			  }
			  return version in uuid ? uuid[version].test(str) : false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isUUID, isUUID.exports));
		return isUUID.exports;
	}

	const isMongoId = {exports: {}};

	let hasRequiredIsMongoId;

	function requireIsMongoId() {
		if (hasRequiredIsMongoId) return isMongoId.exports;
		hasRequiredIsMongoId = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMongoId;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isHexadecimal = _interopRequireDefault(/* @__PURE__*/ requireIsHexadecimal());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isMongoId(str) {
			  (0, _assertString.default)(str);
			  return (0, _isHexadecimal.default)(str) && str.length === 24;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMongoId, isMongoId.exports));
		return isMongoId.exports;
	}

	const isAfter = {exports: {}};

	let hasRequiredIsAfter;

	function requireIsAfter() {
		if (hasRequiredIsAfter) return isAfter.exports;
		hasRequiredIsAfter = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isAfter;
			const _toDate = _interopRequireDefault(/* @__PURE__*/ requireToDate());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			function isAfter(date, options) {
			  // For backwards compatibility:
			  // isAfter(str [, date]), i.e. `options` could be used as argument for the legacy `date`
			  const comparisonDate = (_typeof(options) === "object" ? options.comparisonDate : options) || Date().toString();
			  const comparison = (0, _toDate.default)(comparisonDate);
			  const original = (0, _toDate.default)(date);
			  return !!(original && comparison && original > comparison);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isAfter, isAfter.exports));
		return isAfter.exports;
	}

	const isBefore = {exports: {}};

	let hasRequiredIsBefore;

	function requireIsBefore() {
		if (hasRequiredIsBefore) return isBefore.exports;
		hasRequiredIsBefore = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBefore;
			const _toDate = _interopRequireDefault(/* @__PURE__*/ requireToDate());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			function isBefore(date, options) {
			  // For backwards compatibility:
			  // isBefore(str [, date]), i.e. `options` could be used as argument for the legacy `date`
			  const comparisonDate = (_typeof(options) === "object" ? options.comparisonDate : options) || Date().toString();
			  const comparison = (0, _toDate.default)(comparisonDate);
			  const original = (0, _toDate.default)(date);
			  return !!(original && comparison && original < comparison);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBefore, isBefore.exports));
		return isBefore.exports;
	}

	const isIn = {exports: {}};

	let hasRequiredIsIn;

	function requireIsIn() {
		if (hasRequiredIsIn) return isIn.exports;
		hasRequiredIsIn = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isIn;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _toString = _interopRequireDefault(/* @__PURE__*/ requireToString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			function isIn(str, options) {
			  (0, _assertString.default)(str);
			  let i;
			  if (Object.prototype.toString.call(options) === "[object Array]") {
			    const array = [];
			    for (i in options) {
			      // https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md#ignoring-code-for-coverage-purposes
			      // istanbul ignore else
			      if ({}.hasOwnProperty.call(options, i)) {
			        array[i] = (0, _toString.default)(options[i]);
			      }
			    }
			    return array.indexOf(str) >= 0;
			  } else if (_typeof(options) === "object") {
			    return options.hasOwnProperty(str);
			  } else if (options && typeof options.indexOf === "function") {
			    return options.indexOf(str) >= 0;
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isIn, isIn.exports));
		return isIn.exports;
	}

	const isLuhnNumber = {exports: {}};

	let hasRequiredIsLuhnNumber;

	function requireIsLuhnNumber() {
		if (hasRequiredIsLuhnNumber) return isLuhnNumber.exports;
		hasRequiredIsLuhnNumber = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLuhnNumber;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isLuhnNumber(str) {
			  (0, _assertString.default)(str);
			  const sanitized = str.replace(/[- ]+/g, "");
			  let sum = 0;
			  let digit;
			  let tmpNum;
			  let shouldDouble;
			  for (let i = sanitized.length - 1; i >= 0; i--) {
			    digit = sanitized.substring(i, i + 1);
			    tmpNum = parseInt(digit, 10);
			    if (shouldDouble) {
			      tmpNum *= 2;
			      if (tmpNum >= 10) {
			        sum += tmpNum % 10 + 1;
			      } else {
			        sum += tmpNum;
			      }
			    } else {
			      sum += tmpNum;
			    }
			    shouldDouble = !shouldDouble;
			  }
			  return !!(sum % 10 === 0 ? sanitized : false);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLuhnNumber, isLuhnNumber.exports));
		return isLuhnNumber.exports;
	}

	const isCreditCard = {exports: {}};

	let hasRequiredIsCreditCard;

	function requireIsCreditCard() {
		if (hasRequiredIsCreditCard) return isCreditCard.exports;
		hasRequiredIsCreditCard = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isCreditCard;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _isLuhnNumber = _interopRequireDefault(/* @__PURE__*/ requireIsLuhnNumber());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const cards = {
			  amex: /^3[47][0-9]{13}$/,
			  dinersclub: /^3(?:0[0-5]|[68][0-9])[0-9]{11}$/,
			  discover: /^6(?:011|5[0-9][0-9])[0-9]{12,15}$/,
			  jcb: /^(?:2131|1800|35\d{3})\d{11}$/,
			  mastercard: /^5[1-5][0-9]{2}|(222[1-9]|22[3-9][0-9]|2[3-6][0-9]{2}|27[01][0-9]|2720)[0-9]{12}$/,
			  // /^[25][1-7][0-9]{14}$/;
			  unionpay: /^(6[27][0-9]{14}|^(81[0-9]{14,17}))$/,
			  visa: /^(?:4[0-9]{12})(?:[0-9]{3,6})?$/
			};
			const allCards = function() {
			  const tmpCardsArray = [];
			  for (const cardProvider in cards) {
			    // istanbul ignore else
			    if (cards.hasOwnProperty(cardProvider)) {
			      tmpCardsArray.push(cards[cardProvider]);
			    }
			  }
			  return tmpCardsArray;
			}();
			function isCreditCard(card) {
			  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
			  (0, _assertString.default)(card);
			  const provider = options.provider;
			  const sanitized = card.replace(/[- ]+/g, "");
			  if (provider && provider.toLowerCase() in cards) {
			    // specific provider in the list
			    if (!cards[provider.toLowerCase()].test(sanitized)) {
			      return false;
			    }
			  } else if (provider && !(provider.toLowerCase() in cards)) {
			    /* specific provider not in the list */
			    throw new Error("".concat(provider, " is not a valid credit card provider."));
			  } else if (!allCards.some(function(cardProvider) {
			    return cardProvider.test(sanitized);
			  })) {
			    // no specific provider
			    return false;
			  }
			  return (0, _isLuhnNumber.default)(card);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isCreditCard, isCreditCard.exports));
		return isCreditCard.exports;
	}

	const isIdentityCard = {exports: {}};

	let hasRequiredIsIdentityCard;

	function requireIsIdentityCard() {
		if (hasRequiredIsIdentityCard) return isIdentityCard.exports;
		hasRequiredIsIdentityCard = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isIdentityCard;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _includesArray = _interopRequireDefault(/* @__PURE__*/ requireIncludesArray());
			const _isInt = _interopRequireDefault(/* @__PURE__*/ requireIsInt());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const validators = {
			  "PL": function PL(str) {
			    (0, _assertString.default)(str);
			    const weightOfDigits = {
			      1: 1,
			      2: 3,
			      3: 7,
			      4: 9,
			      5: 1,
			      6: 3,
			      7: 7,
			      8: 9,
			      9: 1,
			      10: 3,
			      11: 0
			    };
			    if (str != null && str.length === 11 && (0, _isInt.default)(str, {
			      allow_leading_zeroes: true
			    })) {
			      const digits = str.split("").slice(0, -1);
			      const sum = digits.reduce(function(acc, digit, index) {
			        return acc + Number(digit) * weightOfDigits[index + 1];
			      }, 0);
			      const modulo = sum % 10;
			      const lastDigit = Number(str.charAt(str.length - 1));
			      if (modulo === 0 && lastDigit === 0 || lastDigit === 10 - modulo) {
			        return true;
			      }
			    }
			    return false;
			  },
			  "ES": function ES(str) {
			    (0, _assertString.default)(str);
			    const DNI = /^[0-9X-Z][0-9]{7}[TRWAGMYFPDXBNJZSQVHLCKE]$/;
			    const charsValue = {
			      X: 0,
			      Y: 1,
			      Z: 2
			    };
			    const controlDigits = ["T", "R", "W", "A", "G", "M", "Y", "F", "P", "D", "X", "B", "N", "J", "Z", "S", "Q", "V", "H", "L", "C", "K", "E"];

			    // sanitize user input
			    const sanitized = str.trim().toUpperCase();

			    // validate the data structure
			    if (!DNI.test(sanitized)) {
			      return false;
			    }

			    // validate the control digit
			    const number = sanitized.slice(0, -1).replace(/[X,Y,Z]/g, function(char) {
			      return charsValue[char];
			    });
			    return sanitized.endsWith(controlDigits[number % 23]);
			  },
			  "FI": function FI(str) {
			    // https://dvv.fi/en/personal-identity-code#:~:text=control%20character%20for%20a-,personal,-identity%20code%20calculated
			    (0, _assertString.default)(str);
			    if (str.length !== 11) {
			      return false;
			    }
			    if (!str.match(/^\d{6}[\-A\+]\d{3}[0-9ABCDEFHJKLMNPRSTUVWXY]{1}$/)) {
			      return false;
			    }
			    const checkDigits = "0123456789ABCDEFHJKLMNPRSTUVWXY";
			    const idAsNumber = parseInt(str.slice(0, 6), 10) * 1000 + parseInt(str.slice(7, 10), 10);
			    const remainder = idAsNumber % 31;
			    const checkDigit = checkDigits[remainder];
			    return checkDigit === str.slice(10, 11);
			  },
			  "IN": function IN(str) {
			    const DNI = /^[1-9]\d{3}\s?\d{4}\s?\d{4}$/;

			    // multiplication table
			    const d = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];

			    // permutation table
			    const p = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];

			    // sanitize user input
			    const sanitized = str.trim();

			    // validate the data structure
			    if (!DNI.test(sanitized)) {
			      return false;
			    }
			    let c = 0;
			    const invertedArray = sanitized.replace(/\s/g, "").split("").map(Number).reverse();
			    invertedArray.forEach(function(val, i) {
			      c = d[c][p[i % 8][val]];
			    });
			    return c === 0;
			  },
			  "IR": function IR(str) {
			    if (!str.match(/^\d{10}$/)) return false;
			    str = "0000".concat(str).slice(str.length - 6);
			    if (parseInt(str.slice(3, 9), 10) === 0) return false;
			    const lastNumber = parseInt(str.slice(9, 10), 10);
			    let sum = 0;
			    for (let i = 0; i < 9; i++) {
			      sum += parseInt(str.slice(i, i + 1), 10) * (10 - i);
			    }
			    sum %= 11;
			    return sum < 2 && lastNumber === sum || sum >= 2 && lastNumber === 11 - sum;
			  },
			  "IT": function IT(str) {
			    if (str.length !== 9) return false;
			    if (str === "CA00000AA") return false; // https://it.wikipedia.org/wiki/Carta_d%27identit%C3%A0_elettronica_italiana
			    return str.search(/C[A-Z]\d{5}[A-Z]{2}/i) > -1;
			  },
			  "NO": function NO(str) {
			    const sanitized = str.trim();
			    if (isNaN(Number(sanitized))) return false;
			    if (sanitized.length !== 11) return false;
			    if (sanitized === "00000000000") return false;

			    // https://no.wikipedia.org/wiki/F%C3%B8dselsnummer
			    const f = sanitized.split("").map(Number);
			    const k1 = (11 - (3 * f[0] + 7 * f[1] + 6 * f[2] + 1 * f[3] + 8 * f[4] + 9 * f[5] + 4 * f[6] + 5 * f[7] + 2 * f[8]) % 11) % 11;
			    const k2 = (11 - (5 * f[0] + 4 * f[1] + 3 * f[2] + 2 * f[3] + 7 * f[4] + 6 * f[5] + 5 * f[6] + 4 * f[7] + 3 * f[8] + 2 * k1) % 11) % 11;
			    if (k1 !== f[9] || k2 !== f[10]) return false;
			    return true;
			  },
			  "TH": function TH(str) {
			    if (!str.match(/^[1-8]\d{12}$/)) return false;

			    // validate check digit
			    let sum = 0;
			    for (let i = 0; i < 12; i++) {
			      sum += parseInt(str[i], 10) * (13 - i);
			    }
			    return str[12] === ((11 - sum % 11) % 10).toString();
			  },
			  "LK": function LK(str) {
			    const old_nic = /^[1-9]\d{8}[vx]$/i;
			    const new_nic = /^[1-9]\d{11}$/i;
			    if (str.length === 10 && old_nic.test(str)) return true; else if (str.length === 12 && new_nic.test(str)) return true;
			    return false;
			  },
			  "he-IL": function heIL(str) {
			    const DNI = /^\d{9}$/;

			    // sanitize user input
			    const sanitized = str.trim();

			    // validate the data structure
			    if (!DNI.test(sanitized)) {
			      return false;
			    }
			    const id = sanitized;
			    let sum = 0;
			      let incNum;
			    for (let i = 0; i < id.length; i++) {
			      incNum = Number(id[i]) * (i % 2 + 1); // Multiply number by 1 or 2
			      sum += incNum > 9 ? incNum - 9 : incNum; // Sum the digits up and add to total
			    }
			    return sum % 10 === 0;
			  },
			  "ar-LY": function arLY(str) {
			    // Libya National Identity Number NIN is 12 digits, the first digit is either 1 or 2
			    const NIN = /^(1|2)\d{11}$/;

			    // sanitize user input
			    const sanitized = str.trim();

			    // validate the data structure
			    if (!NIN.test(sanitized)) {
			      return false;
			    }
			    return true;
			  },
			  "ar-TN": function arTN(str) {
			    const DNI = /^\d{8}$/;

			    // sanitize user input
			    const sanitized = str.trim();

			    // validate the data structure
			    if (!DNI.test(sanitized)) {
			      return false;
			    }
			    return true;
			  },
			  "zh-CN": function zhCN(str) {
			    const provincesAndCities = ["11",
			    // 北京
			    "12",
			    // 天津
			    "13",
			    // 河北
			    "14",
			    // 山西
			    "15",
			    // 内蒙古
			    "21",
			    // 辽宁
			    "22",
			    // 吉林
			    "23",
			    // 黑龙江
			    "31",
			    // 上海
			    "32",
			    // 江苏
			    "33",
			    // 浙江
			    "34",
			    // 安徽
			    "35",
			    // 福建
			    "36",
			    // 江西
			    "37",
			    // 山东
			    "41",
			    // 河南
			    "42",
			    // 湖北
			    "43",
			    // 湖南
			    "44",
			    // 广东
			    "45",
			    // 广西
			    "46",
			    // 海南
			    "50",
			    // 重庆
			    "51",
			    // 四川
			    "52",
			    // 贵州
			    "53",
			    // 云南
			    "54",
			    // 西藏
			    "61",
			    // 陕西
			    "62",
			    // 甘肃
			    "63",
			    // 青海
			    "64",
			    // 宁夏
			    "65",
			    // 新疆
			    "71",
			    // 台湾
			    "81",
			    // 香港
			    "82",
			    // 澳门
			    "91" // 国外
			    ];
			    const powers = ["7", "9", "10", "5", "8", "4", "2", "1", "6", "3", "7", "9", "10", "5", "8", "4", "2"];
			    const parityBit = ["1", "0", "X", "9", "8", "7", "6", "5", "4", "3", "2"];
			    const checkAddressCode = function checkAddressCode(addressCode) {
			      return (0, _includesArray.default)(provincesAndCities, addressCode);
			    };
			    const checkBirthDayCode = function checkBirthDayCode(birDayCode) {
			      const yyyy = parseInt(birDayCode.substring(0, 4), 10);
			      const mm = parseInt(birDayCode.substring(4, 6), 10);
			      const dd = parseInt(birDayCode.substring(6), 10);
			      const xdata = new Date(yyyy, mm - 1, dd);
			      if (xdata > new Date()) {
			        return false;
			      } else if (xdata.getFullYear() === yyyy && xdata.getMonth() === mm - 1 && xdata.getDate() === dd) {
			        return true;
			      }
			      return false;
			    };
			    const getParityBit = function getParityBit(idCardNo) {
			      const id17 = idCardNo.substring(0, 17);
			      let power = 0;
			      for (let i = 0; i < 17; i++) {
			        power += parseInt(id17.charAt(i), 10) * parseInt(powers[i], 10);
			      }
			      const mod = power % 11;
			      return parityBit[mod];
			    };
			    const checkParityBit = function checkParityBit(idCardNo) {
			      return getParityBit(idCardNo) === idCardNo.charAt(17).toUpperCase();
			    };
			    const check15IdCardNo = function check15IdCardNo(idCardNo) {
			      let check = /^[1-9]\d{7}((0[1-9])|(1[0-2]))((0[1-9])|([1-2][0-9])|(3[0-1]))\d{3}$/.test(idCardNo);
			      if (!check) return false;
			      const addressCode = idCardNo.substring(0, 2);
			      check = checkAddressCode(addressCode);
			      if (!check) return false;
			      const birDayCode = "19".concat(idCardNo.substring(6, 12));
			      check = checkBirthDayCode(birDayCode);
			      if (!check) return false;
			      return true;
			    };
			    const check18IdCardNo = function check18IdCardNo(idCardNo) {
			      let check = /^[1-9]\d{5}[1-9]\d{3}((0[1-9])|(1[0-2]))((0[1-9])|([1-2][0-9])|(3[0-1]))\d{3}(\d|x|X)$/.test(idCardNo);
			      if (!check) return false;
			      const addressCode = idCardNo.substring(0, 2);
			      check = checkAddressCode(addressCode);
			      if (!check) return false;
			      const birDayCode = idCardNo.substring(6, 14);
			      check = checkBirthDayCode(birDayCode);
			      if (!check) return false;
			      return checkParityBit(idCardNo);
			    };
			    const checkIdCardNo = function checkIdCardNo(idCardNo) {
			      const check = /^\d{15}|(\d{17}(\d|x|X))$/.test(idCardNo);
			      if (!check) return false;
			      if (idCardNo.length === 15) {
			        return check15IdCardNo(idCardNo);
			      }
			      return check18IdCardNo(idCardNo);
			    };
			    return checkIdCardNo(str);
			  },
			  "zh-HK": function zhHK(str) {
			    // sanitize user input
			    str = str.trim();

			    // HKID number starts with 1 or 2 letters, followed by 6 digits,
			    // then a checksum contained in square / round brackets or nothing
			    const regexHKID = /^[A-Z]{1,2}[0-9]{6}((\([0-9A]\))|(\[[0-9A]\])|([0-9A]))$/;
			    const regexIsDigit = /^[0-9]$/;

			    // convert the user input to all uppercase and apply regex
			    str = str.toUpperCase();
			    if (!regexHKID.test(str)) return false;
			    str = str.replace(/\[|\]|\(|\)/g, "");
			    if (str.length === 8) str = "3".concat(str);
			    let checkSumVal = 0;
			    for (let i = 0; i <= 7; i++) {
			      let convertedChar = void 0;
			      if (!regexIsDigit.test(str[i])) convertedChar = (str[i].charCodeAt(0) - 55) % 11; else convertedChar = str[i];
			      checkSumVal += convertedChar * (9 - i);
			    }
			    checkSumVal %= 11;
			    let checkSumConverted;
			    if (checkSumVal === 0) checkSumConverted = "0"; else if (checkSumVal === 1) checkSumConverted = "A"; else checkSumConverted = String(11 - checkSumVal);
			    if (checkSumConverted === str[str.length - 1]) return true;
			    return false;
			  },
			  "zh-TW": function zhTW(str) {
			    const ALPHABET_CODES = {
			      A: 10,
			      B: 11,
			      C: 12,
			      D: 13,
			      E: 14,
			      F: 15,
			      G: 16,
			      H: 17,
			      I: 34,
			      J: 18,
			      K: 19,
			      L: 20,
			      M: 21,
			      N: 22,
			      O: 35,
			      P: 23,
			      Q: 24,
			      R: 25,
			      S: 26,
			      T: 27,
			      U: 28,
			      V: 29,
			      W: 32,
			      X: 30,
			      Y: 31,
			      Z: 33
			    };
			    const sanitized = str.trim().toUpperCase();
			    if (!/^[A-Z][0-9]{9}$/.test(sanitized)) return false;
			    return Array.from(sanitized).reduce(function(sum, number, index) {
			      if (index === 0) {
			        const code = ALPHABET_CODES[number];
			        return code % 10 * 9 + Math.floor(code / 10);
			      }
			      if (index === 9) {
			        return (10 - sum % 10 - Number(number)) % 10 === 0;
			      }
			      return sum + Number(number) * (9 - index);
			    }, 0);
			  },
			  "PK": function PK(str) {
			    // Pakistani National Identity Number CNIC is 13 digits
			    const CNIC = /^[1-7][0-9]{4}-[0-9]{7}-[1-9]$/;

			    // sanitize user input
			    const sanitized = str.trim();

			    // validate the data structure
			    return CNIC.test(sanitized);
			  }
			};
			function isIdentityCard(str, locale) {
			  (0, _assertString.default)(str);
			  if (locale in validators) {
			    return validators[locale](str);
			  } else if (locale === "any") {
			    for (const key in validators) {
			      // https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md#ignoring-code-for-coverage-purposes
			      // istanbul ignore else
			      if (validators.hasOwnProperty(key)) {
			        const validator = validators[key];
			        if (validator(str)) {
			          return true;
			        }
			      }
			    }
			    return false;
			  }
			  throw new Error("Invalid locale '".concat(locale, "'"));
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isIdentityCard, isIdentityCard.exports));
		return isIdentityCard.exports;
	}

	const isEAN = {exports: {}};

	let hasRequiredIsEAN;

	function requireIsEAN() {
		if (hasRequiredIsEAN) return isEAN.exports;
		hasRequiredIsEAN = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isEAN;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/**
			 * The most commonly used EAN standard is
			 * the thirteen-digit EAN-13, while the
			 * less commonly used 8-digit EAN-8 barcode was
			 * introduced for use on small packages.
			 * Also EAN/UCC-14 is used for Grouping of individual
			 * trade items above unit level(Intermediate, Carton or Pallet).
			 * For more info about EAN-14 checkout: https://www.gtin.info/itf-14-barcodes/
			 * EAN consists of:
			 * GS1 prefix, manufacturer code, product code and check digit
			 * Reference: https://en.wikipedia.org/wiki/International_Article_Number
			 * Reference: https://www.gtin.info/
			 */

			/**
			 * Define EAN Lengths; 8 for EAN-8; 13 for EAN-13; 14 for EAN-14
			 * and Regular Expression for valid EANs (EAN-8, EAN-13, EAN-14),
			 * with exact numeric matching of 8 or 13 or 14 digits [0-9]
			 */
			const LENGTH_EAN_8 = 8;
			const LENGTH_EAN_14 = 14;
			const validEanRegex = /^(\d{8}|\d{13}|\d{14})$/;

			/**
			 * Get position weight given:
			 * EAN length and digit index/position
			 *
			 * @param {number} length
			 * @param {number} index
			 * @returns {number}
			 */
			function getPositionWeightThroughLengthAndIndex(length, index) {
			  if (length === LENGTH_EAN_8 || length === LENGTH_EAN_14) {
			    return index % 2 === 0 ? 3 : 1;
			  }
			  return index % 2 === 0 ? 1 : 3;
			}

			/**
			 * Calculate EAN Check Digit
			 * Reference: https://en.wikipedia.org/wiki/International_Article_Number#Calculation_of_checksum_digit
			 *
			 * @param {string} ean
			 * @returns {number}
			 */
			function calculateCheckDigit(ean) {
			  const checksum = ean.slice(0, -1).split("").map(function(char, index) {
			    return Number(char) * getPositionWeightThroughLengthAndIndex(ean.length, index);
			  }).reduce(function(acc, partialSum) {
			    return acc + partialSum;
			  }, 0);
			  const remainder = 10 - checksum % 10;
			  return remainder < 10 ? remainder : 0;
			}

			/**
			 * Check if string is valid EAN:
			 * Matches EAN-8/EAN-13/EAN-14 regex
			 * Has valid check digit.
			 *
			 * @param {string} str
			 * @returns {boolean}
			 */
			function isEAN(str) {
			  (0, _assertString.default)(str);
			  const actualCheckDigit = Number(str.slice(-1));
			  return validEanRegex.test(str) && actualCheckDigit === calculateCheckDigit(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isEAN, isEAN.exports));
		return isEAN.exports;
	}

	const isISIN = {exports: {}};

	let hasRequiredIsISIN;

	function requireIsISIN() {
		if (hasRequiredIsISIN) return isISIN.exports;
		hasRequiredIsISIN = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISIN;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const isin = /^[A-Z]{2}[0-9A-Z]{9}[0-9]$/;

			// this link details how the check digit is calculated:
			// https://www.isin.org/isin-format/. it is a little bit
			// odd in that it works with digits, not numbers. in order
			// to make only one pass through the ISIN characters, the
			// each alpha character is handled as 2 characters within
			// the loop.

			function isISIN(str) {
			  (0, _assertString.default)(str);
			  if (!isin.test(str)) {
			    return false;
			  }
			  let double = true;
			  let sum = 0;
			  // convert values
			  for (let i = str.length - 2; i >= 0; i--) {
			    if (str[i] >= "A" && str[i] <= "Z") {
			      const value = str[i].charCodeAt(0) - 55;
			      const lo = value % 10;
			      const hi = Math.trunc(value / 10);
			      // letters have two digits, so handle the low order
			      // and high order digits separately.
			      for (let _i = 0, _arr = [lo, hi]; _i < _arr.length; _i++) {
			        const digit = _arr[_i];
			        if (double) {
			          if (digit >= 5) {
			            sum += 1 + (digit - 5) * 2;
			          } else {
			            sum += digit * 2;
			          }
			        } else {
			          sum += digit;
			        }
			        double = !double;
			      }
			    } else {
			      const _digit = str[i].charCodeAt(0) - "0".charCodeAt(0);
			      if (double) {
			        if (_digit >= 5) {
			          sum += 1 + (_digit - 5) * 2;
			        } else {
			          sum += _digit * 2;
			        }
			      } else {
			        sum += _digit;
			      }
			      double = !double;
			    }
			  }
			  const check = Math.trunc((sum + 9) / 10) * 10 - sum;
			  return +str[str.length - 1] === check;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISIN, isISIN.exports));
		return isISIN.exports;
	}

	const isISBN = {exports: {}};

	let hasRequiredIsISBN;

	function requireIsISBN() {
		if (hasRequiredIsISBN) return isISBN.exports;
		hasRequiredIsISBN = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISBN;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const possibleIsbn10 = /^(?:[0-9]{9}X|[0-9]{10})$/;
			const possibleIsbn13 = /^(?:[0-9]{13})$/;
			const factor = [1, 3];
			function isISBN(isbn, options) {
			  (0, _assertString.default)(isbn);

			  // For backwards compatibility:
			  // isISBN(str [, version]), i.e. `options` could be used as argument for the legacy `version`
			  const version = String((options === null || options === void 0 ? void 0 : options.version) || options);
			  if (!(options !== null && options !== void 0 && options.version || options)) {
			    return isISBN(isbn, {
			      version: 10
			    }) || isISBN(isbn, {
			      version: 13
			    });
			  }
			  const sanitizedIsbn = isbn.replace(/[\s-]+/g, "");
			  let checksum = 0;
			  if (version === "10") {
			    if (!possibleIsbn10.test(sanitizedIsbn)) {
			      return false;
			    }
			    for (let i = 0; i < version - 1; i++) {
			      checksum += (i + 1) * sanitizedIsbn.charAt(i);
			    }
			    if (sanitizedIsbn.charAt(9) === "X") {
			      checksum += 10 * 10;
			    } else {
			      checksum += 10 * sanitizedIsbn.charAt(9);
			    }
			    if (checksum % 11 === 0) {
			      return true;
			    }
			  } else if (version === "13") {
			    if (!possibleIsbn13.test(sanitizedIsbn)) {
			      return false;
			    }
			    for (let _i = 0; _i < 12; _i++) {
			      checksum += factor[_i % 2] * sanitizedIsbn.charAt(_i);
			    }
			    if (sanitizedIsbn.charAt(12) - (10 - checksum % 10) % 10 === 0) {
			      return true;
			    }
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISBN, isISBN.exports));
		return isISBN.exports;
	}

	const isISSN = {exports: {}};

	let hasRequiredIsISSN;

	function requireIsISSN() {
		if (hasRequiredIsISSN) return isISSN.exports;
		hasRequiredIsISSN = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISSN;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const issn = "^\\d{4}-?\\d{3}[\\dX]$";
			function isISSN(str) {
			  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
			  (0, _assertString.default)(str);
			  let testIssn = issn;
			  testIssn = options.require_hyphen ? testIssn.replace("?", "") : testIssn;
			  testIssn = options.case_sensitive ? new RegExp(testIssn) : new RegExp(testIssn, "i");
			  if (!testIssn.test(str)) {
			    return false;
			  }
			  const digits = str.replace("-", "").toUpperCase();
			  let checksum = 0;
			  for (let i = 0; i < digits.length; i++) {
			    const digit = digits[i];
			    checksum += (digit === "X" ? 10 : +digit) * (8 - i);
			  }
			  return checksum % 11 === 0;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISSN, isISSN.exports));
		return isISSN.exports;
	}

	const isTaxID = {exports: {}};

	const algorithms = {};

	let hasRequiredAlgorithms;

	function requireAlgorithms() {
		if (hasRequiredAlgorithms) return algorithms;
		hasRequiredAlgorithms = 1;

		Object.defineProperty(algorithms, "__esModule", {
		  value: true
		});
		algorithms.iso7064Check = iso7064Check;
		algorithms.luhnCheck = luhnCheck;
		algorithms.reverseMultiplyAndSum = reverseMultiplyAndSum;
		algorithms.verhoeffCheck = verhoeffCheck;
		/**
		 * Algorithmic validation functions
		 * May be used as is or implemented in the workflow of other validators.
		 */

		/*
		 * ISO 7064 validation function
		 * Called with a string of numbers (incl. check digit)
		 * to validate according to ISO 7064 (MOD 11, 10).
		 */
		function iso7064Check(str) {
		  let checkvalue = 10;
		  for (let i = 0; i < str.length - 1; i++) {
		    checkvalue = (parseInt(str[i], 10) + checkvalue) % 10 === 0 ? 10 * 2 % 11 : (parseInt(str[i], 10) + checkvalue) % 10 * 2 % 11;
		  }
		  checkvalue = checkvalue === 1 ? 0 : 11 - checkvalue;
		  return checkvalue === parseInt(str[10], 10);
		}

		/*
		 * Luhn (mod 10) validation function
		 * Called with a string of numbers (incl. check digit)
		 * to validate according to the Luhn algorithm.
		 */
		function luhnCheck(str) {
		  let checksum = 0;
		  let second = false;
		  for (let i = str.length - 1; i >= 0; i--) {
		    if (second) {
		      const product = parseInt(str[i], 10) * 2;
		      if (product > 9) {
		        // sum digits of product and add to checksum
		        checksum += product.toString().split("").map(function(a) {
		          return parseInt(a, 10);
		        }).reduce(function(a, b) {
		          return a + b;
		        }, 0);
		      } else {
		        checksum += product;
		      }
		    } else {
		      checksum += parseInt(str[i], 10);
		    }
		    second = !second;
		  }
		  return checksum % 10 === 0;
		}

		/*
		 * Reverse TIN multiplication and summation helper function
		 * Called with an array of single-digit integers and a base multiplier
		 * to calculate the sum of the digits multiplied in reverse.
		 * Normally used in variations of MOD 11 algorithmic checks.
		 */
		function reverseMultiplyAndSum(digits, base) {
		  let total = 0;
		  for (let i = 0; i < digits.length; i++) {
		    total += digits[i] * (base - i);
		  }
		  return total;
		}

		/*
		 * Verhoeff validation helper function
		 * Called with a string of numbers
		 * to validate according to the Verhoeff algorithm.
		 */
		function verhoeffCheck(str) {
		  const d_table = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8], [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]];
		  const p_table = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7], [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]];

		  // Copy (to prevent replacement) and reverse
		  const str_copy = str.split("").reverse().join("");
		  let checksum = 0;
		  for (let i = 0; i < str_copy.length; i++) {
		    checksum = d_table[checksum][p_table[i % 8][parseInt(str_copy[i], 10)]];
		  }
		  return checksum === 0;
		}
		return algorithms;
	}

	let hasRequiredIsTaxID;

	function requireIsTaxID() {
		if (hasRequiredIsTaxID) return isTaxID.exports;
		hasRequiredIsTaxID = 1;
		(function(module, exports$1) {
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isTaxID;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const algorithms = _interopRequireWildcard(/* @__PURE__*/ requireAlgorithms());
			const _isDate = _interopRequireDefault(/* @__PURE__*/ requireIsDate());
			function _interopRequireWildcard(e, t) {
				if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) {
					if (!t && e && e.__esModule) return e; let o; let i; const f = {__proto__: null, default: e}; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) {
						if (o.has(e)) return o.get(e); o.set(e, f);
					} for (const _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f;
				})(e, t);
			}
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _toConsumableArray(r) {
				return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
			}
			function _nonIterableSpread() {
				throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
			}
			function _unsupportedIterableToArray(r, a) {
				if (r) {
					if ("string" == typeof r) return _arrayLikeToArray(r, a); let t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
				}
			}
			function _iterableToArray(r) {
				if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
			}
			function _arrayWithoutHoles(r) {
				if (Array.isArray(r)) return _arrayLikeToArray(r);
			}
			function _arrayLikeToArray(r, a) {
				(null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n;
			}
			/**
			 * TIN Validation
			 * Validates Tax Identification Numbers (TINs) from the US, EU member states and the United Kingdom.
			 *
			 * EU-UK:
			 * National TIN validity is calculated using public algorithms as made available by DG TAXUD.
			 *
			 * See `https://ec.europa.eu/taxation_customs/tin/specs/FS-TIN%20Algorithms-Public.docx` for more information.
			 *
			 * US:
			 * An Employer Identification Number (EIN), also known as a Federal Tax Identification Number,
			 *  is used to identify a business entity.
			 *
			 * NOTES:
			 *  - Prefix 47 is being reserved for future use
			 *  - Prefixes 26, 27, 45, 46 and 47 were previously assigned by the Philadelphia campus.
			 *
			 * See `http://www.irs.gov/Businesses/Small-Businesses-&-Self-Employed/How-EINs-are-Assigned-and-Valid-EIN-Prefixes`
			 * for more information.
			 */

			// Locale functions

			/*
			 * bg-BG validation function
			 * (Edinen graždanski nomer (EGN/ЕГН), persons only)
			 * Checks if birth date (first six digits) is valid and calculates check (last) digit
			 */
			function bgBgCheck(tin) {
			  // Extract full year, normalize month and check birth date validity
			  let century_year = tin.slice(0, 2);
			  let month = parseInt(tin.slice(2, 4), 10);
			  if (month > 40) {
			    month -= 40;
			    century_year = "20".concat(century_year);
			  } else if (month > 20) {
			    month -= 20;
			    century_year = "18".concat(century_year);
			  } else {
			    century_year = "19".concat(century_year);
			  }
			  if (month < 10) {
			    month = "0".concat(month);
			  }
			  const date = "".concat(century_year, "/").concat(month, "/").concat(tin.slice(4, 6));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });

			  // Calculate checksum by multiplying digits with fixed values
			  const multip_lookup = [2, 4, 8, 5, 10, 9, 7, 3, 6];
			  let checksum = 0;
			  for (let i = 0; i < multip_lookup.length; i++) {
			    checksum += digits[i] * multip_lookup[i];
			  }
			  checksum = checksum % 11 === 10 ? 0 : checksum % 11;
			  return checksum === digits[9];
			}

			/**
			 * Check if an input is a valid Canadian SIN (Social Insurance Number)
			 *
			 * The Social Insurance Number (SIN) is a 9 digit number that
			 * you need to work in Canada or to have access to government programs and benefits.
			 *
			 * https://en.wikipedia.org/wiki/Social_Insurance_Number
			 * https://www.canada.ca/en/employment-social-development/services/sin.html
			 * https://www.codercrunch.com/challenge/819302488/sin-validator
			 *
			 * @param {string} input
			 * @returns {boolean}
			 */
			function isCanadianSIN(input) {
			  const digitsArray = input.split("");
			  const even = digitsArray.filter(function(_, idx) {
			    return idx % 2;
			  }).map(function(i) {
			    return Number(i) * 2;
			  }).join("").split("");
			  const total = digitsArray.filter(function(_, idx) {
			    return !(idx % 2);
			  }).concat(even).map(function(i) {
			    return Number(i);
			  }).reduce(function(acc, cur) {
			    return acc + cur;
			  });
			  return total % 10 === 0;
			}

			/*
			 * cs-CZ validation function
			 * (Rodné číslo (RČ), persons only)
			 * Checks if birth date (first six digits) is valid and divisibility by 11
			 * Material not in DG TAXUD document sourced from:
			 * -`https://lorenc.info/3MA381/overeni-spravnosti-rodneho-cisla.htm`
			 * -`https://www.mvcr.cz/clanek/rady-a-sluzby-dokumenty-rodne-cislo.aspx`
			 */
			function csCzCheck(tin) {
			  tin = tin.replace(/\W/, "");

			  // Extract full year from TIN length
			  let full_year = parseInt(tin.slice(0, 2), 10);
			  if (tin.length === 10) {
			    if (full_year < 54) {
			      full_year = "20".concat(full_year);
			    } else {
			      full_year = "19".concat(full_year);
			    }
			  } else {
			    if (tin.slice(6) === "000") {
			      return false;
			    } // Three-zero serial not assigned before 1954
			    if (full_year < 54) {
			      full_year = "19".concat(full_year);
			    } else {
			      return false; // No 18XX years seen in any of the resources
			    }
			  }
			  // Add missing zero if needed
			  if (full_year.length === 3) {
			    full_year = [full_year.slice(0, 2), "0", full_year.slice(2)].join("");
			  }

			  // Extract month from TIN and normalize
			  let month = parseInt(tin.slice(2, 4), 10);
			  if (month > 50) {
			    month -= 50;
			  }
			  if (month > 20) {
			    // Month-plus-twenty was only introduced in 2004
			    if (parseInt(full_year, 10) < 2004) {
			      return false;
			    }
			    month -= 20;
			  }
			  if (month < 10) {
			    month = "0".concat(month);
			  }

			  // Check date validity
			  const date = "".concat(full_year, "/").concat(month, "/").concat(tin.slice(4, 6));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Verify divisibility by 11
			  if (tin.length === 10) {
			    if (parseInt(tin, 10) % 11 !== 0) {
			      // Some numbers up to and including 1985 are still valid if
			      // check (last) digit equals 0 and modulo of first 9 digits equals 10
			      const checkdigit = parseInt(tin.slice(0, 9), 10) % 11;
			      if (parseInt(full_year, 10) < 1986 && checkdigit === 10) {
			        if (parseInt(tin.slice(9), 10) !== 0) {
			          return false;
			        }
			      } else {
			        return false;
			      }
			    }
			  }
			  return true;
			}

			/*
			 * de-AT validation function
			 * (Abgabenkontonummer, persons/entities)
			 * Verify TIN validity by calling luhnCheck()
			 */
			function deAtCheck(tin) {
			  return algorithms.luhnCheck(tin);
			}

			/*
			 * de-DE validation function
			 * (Steueridentifikationsnummer (Steuer-IdNr.), persons only)
			 * Tests for single duplicate/triplicate value, then calculates ISO 7064 check (last) digit
			 * Partial implementation of spec (same result with both algorithms always)
			 */
			function deDeCheck(tin) {
			  // Split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });

			  // Fill array with strings of number positions
			  let occurrences = [];
			  for (let i = 0; i < digits.length - 1; i++) {
			    occurrences.push("");
			    for (let j = 0; j < digits.length - 1; j++) {
			      if (digits[i] === digits[j]) {
			        occurrences[i] += j;
			      }
			    }
			  }

			  // Remove digits with one occurrence and test for only one duplicate/triplicate
			  occurrences = occurrences.filter(function(a) {
			    return a.length > 1;
			  });
			  if (occurrences.length !== 2 && occurrences.length !== 3) {
			    return false;
			  }

			  // In case of triplicate value only two digits are allowed next to each other
			  if (occurrences[0].length === 3) {
			    const trip_locations = occurrences[0].split("").map(function(a) {
			      return parseInt(a, 10);
			    });
			    let recurrent = 0; // Amount of neighbor occurrences
			    for (let _i = 0; _i < trip_locations.length - 1; _i++) {
			      if (trip_locations[_i] + 1 === trip_locations[_i + 1]) {
			        recurrent += 1;
			      }
			    }
			    if (recurrent === 2) {
			      return false;
			    }
			  }
			  return algorithms.iso7064Check(tin);
			}

			/*
			 * dk-DK validation function
			 * (CPR-nummer (personnummer), persons only)
			 * Checks if birth date (first six digits) is valid and assigned to century (seventh) digit,
			 * and calculates check (last) digit
			 */
			function dkDkCheck(tin) {
			  tin = tin.replace(/\W/, "");

			  // Extract year, check if valid for given century digit and add century
			  let year = parseInt(tin.slice(4, 6), 10);
			  const century_digit = tin.slice(6, 7);
			  switch (century_digit) {
			    case "0":
			    case "1":
			    case "2":
			    case "3":
			      year = "19".concat(year);
			      break;
			    case "4":
			    case "9":
			      if (year < 37) {
			        year = "20".concat(year);
			      } else {
			        year = "19".concat(year);
			      }
			      break;
			    default:
			      if (year < 37) {
			        year = "20".concat(year);
			      } else if (year > 58) {
			        year = "18".concat(year);
			      } else {
			        return false;
			      }
			      break;
			  }
			  // Add missing zero if needed
			  if (year.length === 3) {
			    year = [year.slice(0, 2), "0", year.slice(2)].join("");
			  }
			  // Check date validity
			  const date = "".concat(year, "/").concat(tin.slice(2, 4), "/").concat(tin.slice(0, 2));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  let checksum = 0;
			  let weight = 4;
			  // Multiply by weight and add to checksum
			  for (let i = 0; i < 9; i++) {
			    checksum += digits[i] * weight;
			    weight -= 1;
			    if (weight === 1) {
			      weight = 7;
			    }
			  }
			  checksum %= 11;
			  if (checksum === 1) {
			    return false;
			  }
			  return checksum === 0 ? digits[9] === 0 : digits[9] === 11 - checksum;
			}

			/*
			 * el-CY validation function
			 * (Arithmos Forologikou Mitroou (AFM/ΑΦΜ), persons only)
			 * Verify TIN validity by calculating ASCII value of check (last) character
			 */
			function elCyCheck(tin) {
			  // split digits into an array for further processing
			  const digits = tin.slice(0, 8).split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  let checksum = 0;
			  // add digits in even places
			  for (let i = 1; i < digits.length; i += 2) {
			    checksum += digits[i];
			  }

			  // add digits in odd places
			  for (let _i2 = 0; _i2 < digits.length; _i2 += 2) {
			    if (digits[_i2] < 2) {
			      checksum += 1 - digits[_i2];
			    } else {
			      checksum += 2 * (digits[_i2] - 2) + 5;
			      if (digits[_i2] > 4) {
			        checksum += 2;
			      }
			    }
			  }
			  return String.fromCharCode(checksum % 26 + 65) === tin.charAt(8);
			}

			/*
			 * el-GR validation function
			 * (Arithmos Forologikou Mitroou (AFM/ΑΦΜ), persons/entities)
			 * Verify TIN validity by calculating check (last) digit
			 * Algorithm not in DG TAXUD document- sourced from:
			 * - `http://epixeirisi.gr/%CE%9A%CE%A1%CE%99%CE%A3%CE%99%CE%9C%CE%91-%CE%98%CE%95%CE%9C%CE%91%CE%A4%CE%91-%CE%A6%CE%9F%CE%A1%CE%9F%CE%9B%CE%9F%CE%93%CE%99%CE%91%CE%A3-%CE%9A%CE%91%CE%99-%CE%9B%CE%9F%CE%93%CE%99%CE%A3%CE%A4%CE%99%CE%9A%CE%97%CE%A3/23791/%CE%91%CF%81%CE%B9%CE%B8%CE%BC%CF%8C%CF%82-%CE%A6%CE%BF%CF%81%CE%BF%CE%BB%CE%BF%CE%B3%CE%B9%CE%BA%CE%BF%CF%8D-%CE%9C%CE%B7%CF%84%CF%81%CF%8E%CE%BF%CF%85`
			 */
			function elGrCheck(tin) {
			  // split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  let checksum = 0;
			  for (let i = 0; i < 8; i++) {
			    checksum += digits[i] * Math.pow(2, 8 - i);
			  }
			  return checksum % 11 % 10 === digits[8];
			}

			/*
			 * en-GB validation function (should go here if needed)
			 * (National Insurance Number (NINO) or Unique Taxpayer Reference (UTR),
			 * persons/entities respectively)
			 */

			/*
			 * en-IE validation function
			 * (Personal Public Service Number (PPS No), persons only)
			 * Verify TIN validity by calculating check (second to last) character
			 */
			function enIeCheck(tin) {
			  let checksum = algorithms.reverseMultiplyAndSum(tin.split("").slice(0, 7).map(function(a) {
			    return parseInt(a, 10);
			  }), 8);
			  if (tin.length === 9 && tin[8] !== "W") {
			    checksum += (tin[8].charCodeAt(0) - 64) * 9;
			  }
			  checksum %= 23;
			  if (checksum === 0) {
			    return tin[7].toUpperCase() === "W";
			  }
			  return tin[7].toUpperCase() === String.fromCharCode(64 + checksum);
			}

			// Valid US IRS campus prefixes
			const enUsCampusPrefix = {
			  andover: ["10", "12"],
			  atlanta: ["60", "67"],
			  austin: ["50", "53"],
			  brookhaven: ["01", "02", "03", "04", "05", "06", "11", "13", "14", "16", "21", "22", "23", "25", "34", "51", "52", "54", "55", "56", "57", "58", "59", "65"],
			  cincinnati: ["30", "32", "35", "36", "37", "38", "61"],
			  fresno: ["15", "24"],
			  internet: ["20", "26", "27", "45", "46", "47"],
			  kansas: ["40", "44"],
			  memphis: ["94", "95"],
			  ogden: ["80", "90"],
			  philadelphia: ["33", "39", "41", "42", "43", "46", "48", "62", "63", "64", "66", "68", "71", "72", "73", "74", "75", "76", "77", "81", "82", "83", "84", "85", "86", "87", "88", "91", "92", "93", "98", "99"],
			  sba: ["31"]
			};

			// Return an array of all US IRS campus prefixes
			function enUsGetPrefixes() {
			  const prefixes = [];
			  for (const location in enUsCampusPrefix) {
			    // https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md#ignoring-code-for-coverage-purposes
			    // istanbul ignore else
			    if (enUsCampusPrefix.hasOwnProperty(location)) {
			      prefixes.push.apply(prefixes, _toConsumableArray(enUsCampusPrefix[location]));
			    }
			  }
			  return prefixes;
			}

			/*
			 * en-US validation function
			 * Verify that the TIN starts with a valid IRS campus prefix
			 */
			function enUsCheck(tin) {
			  return enUsGetPrefixes().indexOf(tin.slice(0, 2)) !== -1;
			}

			/*
			 * es-AR validation function
			 * Clave Única de Identificación Tributaria (CUIT/CUIL)
			 * Sourced from:
			 * - https://servicioscf.afip.gob.ar/publico/abc/ABCpaso2.aspx?id_nivel1=3036&id_nivel2=3040&p=Conceptos%20b%C3%A1sicos
			 * - https://es.wikipedia.org/wiki/Clave_%C3%9Anica_de_Identificaci%C3%B3n_Tributaria
			 */

			function esArCheck(tin) {
			  let accum = 0;
			  const digits = tin.split("");
			  const digit = parseInt(digits.pop(), 10);
			  for (let i = 0; i < digits.length; i++) {
			    accum += digits[9 - i] * (2 + i % 6);
			  }
			  let verif = 11 - accum % 11;
			  if (verif === 11) {
			    verif = 0;
			  } else if (verif === 10) {
			    verif = 9;
			  }
			  return digit === verif;
			}

			/*
			 * es-ES validation function
			 * (Documento Nacional de Identidad (DNI)
			 * or Número de Identificación de Extranjero (NIE), persons only)
			 * Verify TIN validity by calculating check (last) character
			 */
			function esEsCheck(tin) {
			  // Split characters into an array for further processing
			  let chars = tin.toUpperCase().split("");

			  // Replace initial letter if needed
			  if (isNaN(parseInt(chars[0], 10)) && chars.length > 1) {
			    let lead_replace = 0;
			    switch (chars[0]) {
			      case "Y":
			        lead_replace = 1;
			        break;
			      case "Z":
			        lead_replace = 2;
			        break;
			    }
			    chars.splice(0, 1, lead_replace);
			    // Fill with zeros if smaller than proper
			  } else {
			    while (chars.length < 9) {
			      chars.unshift(0);
			    }
			  }

			  // Calculate checksum and check according to lookup
			  const lookup = ["T", "R", "W", "A", "G", "M", "Y", "F", "P", "D", "X", "B", "N", "J", "Z", "S", "Q", "V", "H", "L", "C", "K", "E"];
			  chars = chars.join("");
			  const checksum = parseInt(chars.slice(0, 8), 10) % 23;
			  return chars[8] === lookup[checksum];
			}

			/*
			 * et-EE validation function
			 * (Isikukood (IK), persons only)
			 * Checks if birth date (century digit and six following) is valid and calculates check (last) digit
			 * Material not in DG TAXUD document sourced from:
			 * - `https://www.oecd.org/tax/automatic-exchange/crs-implementation-and-assistance/tax-identification-numbers/Estonia-TIN.pdf`
			 */
			function etEeCheck(tin) {
			  // Extract year and add century
			  let full_year = tin.slice(1, 3);
			  const century_digit = tin.slice(0, 1);
			  switch (century_digit) {
			    case "1":
			    case "2":
			      full_year = "18".concat(full_year);
			      break;
			    case "3":
			    case "4":
			      full_year = "19".concat(full_year);
			      break;
			    default:
			      full_year = "20".concat(full_year);
			      break;
			  }
			  // Check date validity
			  const date = "".concat(full_year, "/").concat(tin.slice(3, 5), "/").concat(tin.slice(5, 7));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  let checksum = 0;
			  let weight = 1;
			  // Multiply by weight and add to checksum
			  for (let i = 0; i < 10; i++) {
			    checksum += digits[i] * weight;
			    weight += 1;
			    if (weight === 10) {
			      weight = 1;
			    }
			  }
			  // Do again if modulo 11 of checksum is 10
			  if (checksum % 11 === 10) {
			    checksum = 0;
			    weight = 3;
			    for (let _i3 = 0; _i3 < 10; _i3++) {
			      checksum += digits[_i3] * weight;
			      weight += 1;
			      if (weight === 10) {
			        weight = 1;
			      }
			    }
			    if (checksum % 11 === 10) {
			      return digits[10] === 0;
			    }
			  }
			  return checksum % 11 === digits[10];
			}

			/*
			 * fi-FI validation function
			 * (Henkilötunnus (HETU), persons only)
			 * Checks if birth date (first six digits plus century symbol) is valid
			 * and calculates check (last) digit
			 */
			function fiFiCheck(tin) {
			  // Extract year and add century
			  let full_year = tin.slice(4, 6);
			  const century_symbol = tin.slice(6, 7);
			  switch (century_symbol) {
			    case "+":
			      full_year = "18".concat(full_year);
			      break;
			    case "-":
			      full_year = "19".concat(full_year);
			      break;
			    default:
			      full_year = "20".concat(full_year);
			      break;
			  }
			  // Check date validity
			  const date = "".concat(full_year, "/").concat(tin.slice(2, 4), "/").concat(tin.slice(0, 2));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Calculate check character
			  let checksum = parseInt(tin.slice(0, 6) + tin.slice(7, 10), 10) % 31;
			  if (checksum < 10) {
			    return checksum === parseInt(tin.slice(10), 10);
			  }
			  checksum -= 10;
			  const letters_lookup = ["A", "B", "C", "D", "E", "F", "H", "J", "K", "L", "M", "N", "P", "R", "S", "T", "U", "V", "W", "X", "Y"];
			  return letters_lookup[checksum] === tin.slice(10);
			}

			/*
			 * fr/nl-BE validation function
			 * (Numéro national (N.N.), persons only)
			 * Checks if birth date (first six digits) is valid and calculates check (last two) digits
			 */
			function frBeCheck(tin) {
			  // Zero month/day value is acceptable
			  if (tin.slice(2, 4) !== "00" || tin.slice(4, 6) !== "00") {
			    // Extract date from first six digits of TIN
			    const date = "".concat(tin.slice(0, 2), "/").concat(tin.slice(2, 4), "/").concat(tin.slice(4, 6));
			    if (!(0, _isDate.default)(date, "YY/MM/DD")) {
			      return false;
			    }
			  }
			  let checksum = 97 - parseInt(tin.slice(0, 9), 10) % 97;
			  const checkdigits = parseInt(tin.slice(9, 11), 10);
			  if (checksum !== checkdigits) {
			    checksum = 97 - parseInt("2".concat(tin.slice(0, 9)), 10) % 97;
			    if (checksum !== checkdigits) {
			      return false;
			    }
			  }
			  return true;
			}

			/*
			 * fr-FR validation function
			 * (Numéro fiscal de référence (numéro SPI), persons only)
			 * Verify TIN validity by calculating check (last three) digits
			 */
			function frFrCheck(tin) {
			  tin = tin.replace(/\s/g, "");
			  const checksum = parseInt(tin.slice(0, 10), 10) % 511;
			  const checkdigits = parseInt(tin.slice(10, 13), 10);
			  return checksum === checkdigits;
			}

			/*
			 * fr/lb-LU validation function
			 * (numéro d’identification personnelle, persons only)
			 * Verify birth date validity and run Luhn and Verhoeff checks
			 */
			function frLuCheck(tin) {
			  // Extract date and check validity
			  const date = "".concat(tin.slice(0, 4), "/").concat(tin.slice(4, 6), "/").concat(tin.slice(6, 8));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Run Luhn check
			  if (!algorithms.luhnCheck(tin.slice(0, 12))) {
			    return false;
			  }
			  // Remove Luhn check digit and run Verhoeff check
			  return algorithms.verhoeffCheck("".concat(tin.slice(0, 11)).concat(tin[12]));
			}

			/*
			 * hr-HR validation function
			 * (Osobni identifikacijski broj (OIB), persons/entities)
			 * Verify TIN validity by calling iso7064Check(digits)
			 */
			function hrHrCheck(tin) {
			  return algorithms.iso7064Check(tin);
			}

			/*
			 * hu-HU validation function
			 * (Adóazonosító jel, persons only)
			 * Verify TIN validity by calculating check (last) digit
			 */
			function huHuCheck(tin) {
			  // split digits into an array for further processing
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  let checksum = 8;
			  for (let i = 1; i < 9; i++) {
			    checksum += digits[i] * (i + 1);
			  }
			  return checksum % 11 === digits[9];
			}

			/*
			 * lt-LT validation function (should go here if needed)
			 * (Asmens kodas, persons/entities respectively)
			 * Current validation check is alias of etEeCheck- same format applies
			 */

			/*
			 * it-IT first/last name validity check
			 * Accepts it-IT TIN-encoded names as a three-element character array and checks their validity
			 * Due to lack of clarity between resources ("Are only Italian consonants used?
			 * What happens if a person has X in their name?" etc.) only two test conditions
			 * have been implemented:
			 * Vowels may only be followed by other vowels or an X character
			 * and X characters after vowels may only be followed by other X characters.
			 */
			function itItNameCheck(name) {
			  // true at the first occurrence of a vowel
			  let vowelflag = false;

			  // true at the first occurrence of an X AFTER vowel
			  // (to properly handle last names with X as consonant)
			  let xflag = false;
			  for (let i = 0; i < 3; i++) {
			    if (!vowelflag && /[AEIOU]/.test(name[i])) {
			      vowelflag = true;
			    } else if (!xflag && vowelflag && name[i] === "X") {
			      xflag = true;
			    } else if (i > 0) {
			      if (vowelflag && !xflag) {
			        if (!/[AEIOU]/.test(name[i])) {
			          return false;
			        }
			      }
			      if (xflag) {
			        if (!/X/.test(name[i])) {
			          return false;
			        }
			      }
			    }
			  }
			  return true;
			}

			/*
			 * it-IT validation function
			 * (Codice fiscale (TIN-IT), persons only)
			 * Verify name, birth date and codice catastale validity
			 * and calculate check character.
			 * Material not in DG-TAXUD document sourced from:
			 * `https://en.wikipedia.org/wiki/Italian_fiscal_code`
			 */
			function itItCheck(tin) {
			  // Capitalize and split characters into an array for further processing
			  const chars = tin.toUpperCase().split("");

			  // Check first and last name validity calling itItNameCheck()
			  if (!itItNameCheck(chars.slice(0, 3))) {
			    return false;
			  }
			  if (!itItNameCheck(chars.slice(3, 6))) {
			    return false;
			  }

			  // Convert letters in number spaces back to numbers if any
			  const number_locations = [6, 7, 9, 10, 12, 13, 14];
			  const number_replace = {
			    L: "0",
			    M: "1",
			    N: "2",
			    P: "3",
			    Q: "4",
			    R: "5",
			    S: "6",
			    T: "7",
			    U: "8",
			    V: "9"
			  };
			  for (let _i4 = 0, _number_locations = number_locations; _i4 < _number_locations.length; _i4++) {
			    const i = _number_locations[_i4];
			    if (chars[i] in number_replace) {
			      chars.splice(i, 1, number_replace[chars[i]]);
			    }
			  }

			  // Extract month and day, and check date validity
			  const month_replace = {
			    A: "01",
			    B: "02",
			    C: "03",
			    D: "04",
			    E: "05",
			    H: "06",
			    L: "07",
			    M: "08",
			    P: "09",
			    R: "10",
			    S: "11",
			    T: "12"
			  };
			  const month = month_replace[chars[8]];
			  let day = parseInt(chars[9] + chars[10], 10);
			  if (day > 40) {
			    day -= 40;
			  }
			  if (day < 10) {
			    day = "0".concat(day);
			  }
			  const date = "".concat(chars[6]).concat(chars[7], "/").concat(month, "/").concat(day);
			  if (!(0, _isDate.default)(date, "YY/MM/DD")) {
			    return false;
			  }

			  // Calculate check character by adding up even and odd characters as numbers
			  let checksum = 0;
			  for (let _i5 = 1; _i5 < chars.length - 1; _i5 += 2) {
			    let char_to_int = parseInt(chars[_i5], 10);
			    if (isNaN(char_to_int)) {
			      char_to_int = chars[_i5].charCodeAt(0) - 65;
			    }
			    checksum += char_to_int;
			  }
			  const odd_convert = {
			    // Maps of characters at odd places
			    A: 1,
			    B: 0,
			    C: 5,
			    D: 7,
			    E: 9,
			    F: 13,
			    G: 15,
			    H: 17,
			    I: 19,
			    J: 21,
			    K: 2,
			    L: 4,
			    M: 18,
			    N: 20,
			    O: 11,
			    P: 3,
			    Q: 6,
			    R: 8,
			    S: 12,
			    T: 14,
			    U: 16,
			    V: 10,
			    W: 22,
			    X: 25,
			    Y: 24,
			    Z: 23,
			    0: 1,
			    1: 0
			  };
			  for (let _i6 = 0; _i6 < chars.length - 1; _i6 += 2) {
			    let _char_to_int = 0;
			    if (chars[_i6] in odd_convert) {
			      _char_to_int = odd_convert[chars[_i6]];
			    } else {
			      const multiplier = parseInt(chars[_i6], 10);
			      _char_to_int = 2 * multiplier + 1;
			      if (multiplier > 4) {
			        _char_to_int += 2;
			      }
			    }
			    checksum += _char_to_int;
			  }
			  if (String.fromCharCode(65 + checksum % 26) !== chars[15]) {
			    return false;
			  }
			  return true;
			}

			/*
			 * lv-LV validation function
			 * (Personas kods (PK), persons only)
			 * Check validity of birth date and calculate check (last) digit
			 * Support only for old format numbers (not starting with '32', issued before 2017/07/01)
			 * Material not in DG TAXUD document sourced from:
			 * `https://boot.ritakafija.lv/forums/index.php?/topic/88314-personas-koda-algoritms-%C4%8Deksumma/`
			 */
			function lvLvCheck(tin) {
			  tin = tin.replace(/\W/, "");
			  // Extract date from TIN
			  const day = tin.slice(0, 2);
			  if (day !== "32") {
			    // No date/checksum check if new format
			    const month = tin.slice(2, 4);
			    if (month !== "00") {
			      // No date check if unknown month
			      let full_year = tin.slice(4, 6);
			      switch (tin[6]) {
			        case "0":
			          full_year = "18".concat(full_year);
			          break;
			        case "1":
			          full_year = "19".concat(full_year);
			          break;
			        default:
			          full_year = "20".concat(full_year);
			          break;
			      }
			      // Check date validity
			      const date = "".concat(full_year, "/").concat(tin.slice(2, 4), "/").concat(day);
			      if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			        return false;
			      }
			    }

			    // Calculate check digit
			    let checksum = 1101;
			    const multip_lookup = [1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
			    for (let i = 0; i < tin.length - 1; i++) {
			      checksum -= parseInt(tin[i], 10) * multip_lookup[i];
			    }
			    return parseInt(tin[10], 10) === checksum % 11;
			  }
			  return true;
			}

			/*
			 * mt-MT validation function
			 * (Identity Card Number or Unique Taxpayer Reference, persons/entities)
			 * Verify Identity Card Number structure (no other tests found)
			 */
			function mtMtCheck(tin) {
			  if (tin.length !== 9) {
			    // No tests for UTR
			    const chars = tin.toUpperCase().split("");
			    // Fill with zeros if smaller than proper
			    while (chars.length < 8) {
			      chars.unshift(0);
			    }
			    // Validate format according to last character
			    switch (tin[7]) {
			      case "A":
			      case "P":
			        if (parseInt(chars[6], 10) === 0) {
			          return false;
			        }
			        break;
			      default:
			        {
			          const first_part = parseInt(chars.join("").slice(0, 5), 10);
			          if (first_part > 32000) {
			            return false;
			          }
			          const second_part = parseInt(chars.join("").slice(5, 7), 10);
			          if (first_part === second_part) {
			            return false;
			          }
			        }
			    }
			  }
			  return true;
			}

			/*
			 * nl-NL validation function
			 * (Burgerservicenummer (BSN) or Rechtspersonen Samenwerkingsverbanden Informatie Nummer (RSIN),
			 * persons/entities respectively)
			 * Verify TIN validity by calculating check (last) digit (variant of MOD 11)
			 */
			function nlNlCheck(tin) {
			  return algorithms.reverseMultiplyAndSum(tin.split("").slice(0, 8).map(function(a) {
			    return parseInt(a, 10);
			  }), 9) % 11 === parseInt(tin[8], 10);
			}

			/*
			 * pl-PL validation function
			 * (Powszechny Elektroniczny System Ewidencji Ludności (PESEL)
			 * or Numer identyfikacji podatkowej (NIP), persons/entities)
			 * Verify TIN validity by validating birth date (PESEL) and calculating check (last) digit
			 */
			function plPlCheck(tin) {
			  // NIP
			  if (tin.length === 10) {
			    // Calculate last digit by multiplying with lookup
			    const lookup = [6, 5, 7, 2, 3, 4, 5, 6, 7];
			    let _checksum = 0;
			    for (let i = 0; i < lookup.length; i++) {
			      _checksum += parseInt(tin[i], 10) * lookup[i];
			    }
			    _checksum %= 11;
			    if (_checksum === 10) {
			      return false;
			    }
			    return _checksum === parseInt(tin[9], 10);
			  }

			  // PESEL
			  // Extract full year using month
			  let full_year = tin.slice(0, 2);
			  let month = parseInt(tin.slice(2, 4), 10);
			  if (month > 80) {
			    full_year = "18".concat(full_year);
			    month -= 80;
			  } else if (month > 60) {
			    full_year = "22".concat(full_year);
			    month -= 60;
			  } else if (month > 40) {
			    full_year = "21".concat(full_year);
			    month -= 40;
			  } else if (month > 20) {
			    full_year = "20".concat(full_year);
			    month -= 20;
			  } else {
			    full_year = "19".concat(full_year);
			  }
			  // Add leading zero to month if needed
			  if (month < 10) {
			    month = "0".concat(month);
			  }
			  // Check date validity
			  const date = "".concat(full_year, "/").concat(month, "/").concat(tin.slice(4, 6));
			  if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }

			  // Calculate last digit by multiplying with odd one-digit numbers except 5
			  let checksum = 0;
			  let multiplier = 1;
			  for (let _i7 = 0; _i7 < tin.length - 1; _i7++) {
			    checksum += parseInt(tin[_i7], 10) * multiplier % 10;
			    multiplier += 2;
			    if (multiplier > 10) {
			      multiplier = 1;
			    } else if (multiplier === 5) {
			      multiplier += 2;
			    }
			  }
			  checksum = 10 - checksum % 10;
			  return checksum === parseInt(tin[10], 10);
			}

			/*
			* pt-BR validation function
			* (Cadastro de Pessoas Físicas (CPF, persons)
			* Cadastro Nacional de Pessoas Jurídicas (CNPJ, entities)
			* Both inputs will be validated
			*/

			function ptBrCheck(tin) {
			  if (tin.length === 11) {
			    let _sum;
			    let remainder;
			    _sum = 0;
			    if (
			    // Reject known invalid CPFs
			    tin === "11111111111" || tin === "22222222222" || tin === "33333333333" || tin === "44444444444" || tin === "55555555555" || tin === "66666666666" || tin === "77777777777" || tin === "88888888888" || tin === "99999999999" || tin === "00000000000") return false;
			    for (let i = 1; i <= 9; i++) _sum += parseInt(tin.substring(i - 1, i), 10) * (11 - i);
			    remainder = _sum * 10 % 11;
			    if (remainder === 10) remainder = 0;
			    if (remainder !== parseInt(tin.substring(9, 10), 10)) return false;
			    _sum = 0;
			    for (let _i8 = 1; _i8 <= 10; _i8++) _sum += parseInt(tin.substring(_i8 - 1, _i8), 10) * (12 - _i8);
			    remainder = _sum * 10 % 11;
			    if (remainder === 10) remainder = 0;
			    if (remainder !== parseInt(tin.substring(10, 11), 10)) return false;
			    return true;
			  }
			  if (
			  // Reject know invalid CNPJs
			  tin === "00000000000000" || tin === "11111111111111" || tin === "22222222222222" || tin === "33333333333333" || tin === "44444444444444" || tin === "55555555555555" || tin === "66666666666666" || tin === "77777777777777" || tin === "88888888888888" || tin === "99999999999999") {
			    return false;
			  }
			  let length = tin.length - 2;
			  let identifiers = tin.substring(0, length);
			  const verificators = tin.substring(length);
			  let sum = 0;
			  let pos = length - 7;
			  for (let _i9 = length; _i9 >= 1; _i9--) {
			    sum += identifiers.charAt(length - _i9) * pos;
			    pos -= 1;
			    if (pos < 2) {
			      pos = 9;
			    }
			  }
			  let result = sum % 11 < 2 ? 0 : 11 - sum % 11;
			  if (result !== parseInt(verificators.charAt(0), 10)) {
			    return false;
			  }
			  length += 1;
			  identifiers = tin.substring(0, length);
			  sum = 0;
			  pos = length - 7;
			  for (let _i0 = length; _i0 >= 1; _i0--) {
			    sum += identifiers.charAt(length - _i0) * pos;
			    pos -= 1;
			    if (pos < 2) {
			      pos = 9;
			    }
			  }
			  result = sum % 11 < 2 ? 0 : 11 - sum % 11;
			  if (result !== parseInt(verificators.charAt(1), 10)) {
			    return false;
			  }
			  return true;
			}

			/*
			 * pt-PT validation function
			 * (Número de identificação fiscal (NIF), persons/entities)
			 * Verify TIN validity by calculating check (last) digit (variant of MOD 11)
			 */
			function ptPtCheck(tin) {
			  const checksum = 11 - algorithms.reverseMultiplyAndSum(tin.split("").slice(0, 8).map(function(a) {
			    return parseInt(a, 10);
			  }), 9) % 11;
			  if (checksum > 9) {
			    return parseInt(tin[8], 10) === 0;
			  }
			  return checksum === parseInt(tin[8], 10);
			}

			/*
			 * ro-RO validation function
			 * (Cod Numeric Personal (CNP) or Cod de înregistrare fiscală (CIF),
			 * persons only)
			 * Verify CNP validity by calculating check (last) digit (test not found for CIF)
			 * Material not in DG TAXUD document sourced from:
			 * `https://en.wikipedia.org/wiki/National_identification_number#Romania`
			 */
			function roRoCheck(tin) {
			  if (tin.slice(0, 4) !== "9000") {
			    // No test found for this format
			    // Extract full year using century digit if possible
			    let full_year = tin.slice(1, 3);
			    switch (tin[0]) {
			      case "1":
			      case "2":
			        full_year = "19".concat(full_year);
			        break;
			      case "3":
			      case "4":
			        full_year = "18".concat(full_year);
			        break;
			      case "5":
			      case "6":
			        full_year = "20".concat(full_year);
			        break;
			    }

			    // Check date validity
			    const date = "".concat(full_year, "/").concat(tin.slice(3, 5), "/").concat(tin.slice(5, 7));
			    if (date.length === 8) {
			      if (!(0, _isDate.default)(date, "YY/MM/DD")) {
			        return false;
			      }
			    } else if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			      return false;
			    }

			    // Calculate check digit
			    const digits = tin.split("").map(function(a) {
			      return parseInt(a, 10);
			    });
			    const multipliers = [2, 7, 9, 1, 4, 6, 3, 5, 8, 2, 7, 9];
			    let checksum = 0;
			    for (let i = 0; i < multipliers.length; i++) {
			      checksum += digits[i] * multipliers[i];
			    }
			    if (checksum % 11 === 10) {
			      return digits[12] === 1;
			    }
			    return digits[12] === checksum % 11;
			  }
			  return true;
			}

			/*
			 * sk-SK validation function
			 * (Rodné číslo (RČ) or bezvýznamové identifikačné číslo (BIČ), persons only)
			 * Checks validity of pre-1954 birth numbers (rodné číslo) only
			 * Due to the introduction of the pseudo-random BIČ it is not possible to test
			 * post-1954 birth numbers without knowing whether they are BIČ or RČ beforehand
			 */
			function skSkCheck(tin) {
			  if (tin.length === 9) {
			    tin = tin.replace(/\W/, "");
			    if (tin.slice(6) === "000") {
			      return false;
			    } // Three-zero serial not assigned before 1954

			    // Extract full year from TIN length
			    let full_year = parseInt(tin.slice(0, 2), 10);
			    if (full_year > 53) {
			      return false;
			    }
			    if (full_year < 10) {
			      full_year = "190".concat(full_year);
			    } else {
			      full_year = "19".concat(full_year);
			    }

			    // Extract month from TIN and normalize
			    let month = parseInt(tin.slice(2, 4), 10);
			    if (month > 50) {
			      month -= 50;
			    }
			    if (month < 10) {
			      month = "0".concat(month);
			    }

			    // Check date validity
			    const date = "".concat(full_year, "/").concat(month, "/").concat(tin.slice(4, 6));
			    if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			      return false;
			    }
			  }
			  return true;
			}

			/*
			 * sl-SI validation function
			 * (Davčna številka, persons/entities)
			 * Verify TIN validity by calculating check (last) digit (variant of MOD 11)
			 */
			function slSiCheck(tin) {
			  const checksum = 11 - algorithms.reverseMultiplyAndSum(tin.split("").slice(0, 7).map(function(a) {
			    return parseInt(a, 10);
			  }), 8) % 11;
			  if (checksum === 10) {
			    return parseInt(tin[7], 10) === 0;
			  }
			  return checksum === parseInt(tin[7], 10);
			}

			/*
			 * sv-SE validation function
			 * (Personnummer or samordningsnummer, persons only)
			 * Checks validity of birth date and calls luhnCheck() to validate check (last) digit
			 */
			function svSeCheck(tin) {
			  // Make copy of TIN and normalize to two-digit year form
			  let tin_copy = tin.slice(0);
			  if (tin.length > 11) {
			    tin_copy = tin_copy.slice(2);
			  }

			  // Extract date of birth
			  let full_year = "";
			  const month = tin_copy.slice(2, 4);
			  let day = parseInt(tin_copy.slice(4, 6), 10);
			  if (tin.length > 11) {
			    full_year = tin.slice(0, 4);
			  } else {
			    full_year = tin.slice(0, 2);
			    if (tin.length === 11 && day < 60) {
			      // Extract full year from centenarian symbol
			      // Should work just fine until year 10000 or so
			      let current_year = new Date().getFullYear().toString();
			      const current_century = parseInt(current_year.slice(0, 2), 10);
			      current_year = parseInt(current_year, 10);
			      if (tin[6] === "-") {
			        if (parseInt("".concat(current_century).concat(full_year), 10) > current_year) {
			          full_year = "".concat(current_century - 1).concat(full_year);
			        } else {
			          full_year = "".concat(current_century).concat(full_year);
			        }
			      } else {
			        full_year = "".concat(current_century - 1).concat(full_year);
			        if (current_year - parseInt(full_year, 10) < 100) {
			          return false;
			        }
			      }
			    }
			  }

			  // Normalize day and check date validity
			  if (day > 60) {
			    day -= 60;
			  }
			  if (day < 10) {
			    day = "0".concat(day);
			  }
			  const date = "".concat(full_year, "/").concat(month, "/").concat(day);
			  if (date.length === 8) {
			    if (!(0, _isDate.default)(date, "YY/MM/DD")) {
			      return false;
			    }
			  } else if (!(0, _isDate.default)(date, "YYYY/MM/DD")) {
			    return false;
			  }
			  return algorithms.luhnCheck(tin.replace(/\W/, ""));
			}

			/**
			 * uk-UA validation function
			 * Verify TIN validity by calculating check (last) digit (variant of MOD 11)
			 *
			 * @param tin
			 */
			function ukUaCheck(tin) {
			  // Calculate check digit
			  const digits = tin.split("").map(function(a) {
			    return parseInt(a, 10);
			  });
			  const multipliers = [-1, 5, 7, 9, 4, 6, 10, 5, 7];
			  let checksum = 0;
			  for (let i = 0; i < multipliers.length; i++) {
			    checksum += digits[i] * multipliers[i];
			  }
			  return checksum % 11 === 10 ? digits[9] === 0 : digits[9] === checksum % 11;
			}

			// Locale lookup objects

			/*
			 * Tax id regex formats for various locales
			 *
			 * Where not explicitly specified in DG-TAXUD document both
			 * uppercase and lowercase letters are acceptable.
			 */
			const taxIdFormat = {
			  "bg-BG": /^\d{10}$/,
			  "cs-CZ": /^\d{6}\/{0,1}\d{3,4}$/,
			  "de-AT": /^\d{9}$/,
			  "de-DE": /^[1-9]\d{10}$/,
			  "dk-DK": /^\d{6}-{0,1}\d{4}$/,
			  "el-CY": /^[09]\d{7}[A-Z]$/,
			  "el-GR": /^([0-4]|[7-9])\d{8}$/,
			  "en-CA": /^\d{9}$/,
			  "en-GB": /^\d{10}$|^(?!GB|NK|TN|ZZ)(?![DFIQUV])[A-Z](?![DFIQUVO])[A-Z]\d{6}[ABCD ]$/i,
			  "en-IE": /^\d{7}[A-W][A-IW]{0,1}$/i,
			  "en-US": /^\d{2}[- ]{0,1}\d{7}$/,
			  "es-AR": /(20|23|24|27|30|33|34)[0-9]{8}[0-9]/,
			  "es-ES": /^(\d{0,8}|[XYZKLM]\d{7})[A-HJ-NP-TV-Z]$/i,
			  "et-EE": /^[1-6]\d{6}(00[1-9]|0[1-9][0-9]|[1-6][0-9]{2}|70[0-9]|710)\d$/,
			  "fi-FI": /^\d{6}[-+A]\d{3}[0-9A-FHJ-NPR-Y]$/i,
			  "fr-BE": /^\d{11}$/,
			  "fr-FR": /^[0-3]\d{12}$|^[0-3]\d\s\d{2}(\s\d{3}){3}$/,
			  // Conforms both to official spec and provided example
			  "fr-LU": /^\d{13}$/,
			  "hr-HR": /^\d{11}$/,
			  "hu-HU": /^8\d{9}$/,
			  "it-IT": /^[A-Z]{6}[L-NP-V0-9]{2}[A-EHLMPRST][L-NP-V0-9]{2}[A-ILMZ][L-NP-V0-9]{3}[A-Z]$/i,
			  "lv-LV": /^\d{6}-{0,1}\d{5}$/,
			  // Conforms both to DG TAXUD spec and original research
			  "mt-MT": /^\d{3,7}[APMGLHBZ]$|^([1-8])\1\d{7}$/i,
			  "nl-NL": /^\d{9}$/,
			  "pl-PL": /^\d{10,11}$/,
			  "pt-BR": /(?:^\d{11}$)|(?:^\d{14}$)/,
			  "pt-PT": /^\d{9}$/,
			  "ro-RO": /^\d{13}$/,
			  "sk-SK": /^\d{6}\/{0,1}\d{3,4}$/,
			  "sl-SI": /^[1-9]\d{7}$/,
			  "sv-SE": /^(\d{6}[-+]{0,1}\d{4}|(18|19|20)\d{6}[-+]{0,1}\d{4})$/,
			  "uk-UA": /^\d{10}$/
			};
			// taxIdFormat locale aliases
			taxIdFormat["lb-LU"] = taxIdFormat["fr-LU"];
			taxIdFormat["lt-LT"] = taxIdFormat["et-EE"];
			taxIdFormat["nl-BE"] = taxIdFormat["fr-BE"];
			taxIdFormat["fr-CA"] = taxIdFormat["en-CA"];

			// Algorithmic tax id check functions for various locales
			const taxIdCheck = {
			  "bg-BG": bgBgCheck,
			  "cs-CZ": csCzCheck,
			  "de-AT": deAtCheck,
			  "de-DE": deDeCheck,
			  "dk-DK": dkDkCheck,
			  "el-CY": elCyCheck,
			  "el-GR": elGrCheck,
			  "en-CA": isCanadianSIN,
			  "en-IE": enIeCheck,
			  "en-US": enUsCheck,
			  "es-AR": esArCheck,
			  "es-ES": esEsCheck,
			  "et-EE": etEeCheck,
			  "fi-FI": fiFiCheck,
			  "fr-BE": frBeCheck,
			  "fr-FR": frFrCheck,
			  "fr-LU": frLuCheck,
			  "hr-HR": hrHrCheck,
			  "hu-HU": huHuCheck,
			  "it-IT": itItCheck,
			  "lv-LV": lvLvCheck,
			  "mt-MT": mtMtCheck,
			  "nl-NL": nlNlCheck,
			  "pl-PL": plPlCheck,
			  "pt-BR": ptBrCheck,
			  "pt-PT": ptPtCheck,
			  "ro-RO": roRoCheck,
			  "sk-SK": skSkCheck,
			  "sl-SI": slSiCheck,
			  "sv-SE": svSeCheck,
			  "uk-UA": ukUaCheck
			};
			// taxIdCheck locale aliases
			taxIdCheck["lb-LU"] = taxIdCheck["fr-LU"];
			taxIdCheck["lt-LT"] = taxIdCheck["et-EE"];
			taxIdCheck["nl-BE"] = taxIdCheck["fr-BE"];
			taxIdCheck["fr-CA"] = taxIdCheck["en-CA"];

			// Regexes for locales where characters should be omitted before checking format
			const allsymbols = /[-\\\/!@#$%\^&\*\(\)\+\=\[\]]+/g;
			const sanitizeRegexes = {
			  "de-AT": allsymbols,
			  "de-DE": /[\/\\]/g,
			  "fr-BE": allsymbols
			};
			// sanitizeRegexes locale aliases
			sanitizeRegexes["nl-BE"] = sanitizeRegexes["fr-BE"];

			/*
			 * Validator function
			 * Return true if the passed string is a valid tax identification number
			 * for the specified locale.
			 * Throw an error exception if the locale is not supported.
			 */
			function isTaxID(str) {
			  const locale = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : "en-US";
			  (0, _assertString.default)(str);
			  // Copy TIN to avoid replacement if sanitized
			  let strcopy = str.slice(0);
			  if (locale in taxIdFormat) {
			    if (locale in sanitizeRegexes) {
			      strcopy = strcopy.replace(sanitizeRegexes[locale], "");
			    }
			    if (!taxIdFormat[locale].test(strcopy)) {
			      return false;
			    }
			    if (locale in taxIdCheck) {
			      return taxIdCheck[locale](strcopy);
			    }
			    // Fallthrough; not all locales have algorithmic checks
			    return true;
			  }
			  throw new Error("Invalid locale '".concat(locale, "'"));
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isTaxID, isTaxID.exports));
		return isTaxID.exports;
	}

	const isMobilePhone = {};

	let hasRequiredIsMobilePhone;

	function requireIsMobilePhone() {
		if (hasRequiredIsMobilePhone) return isMobilePhone;
		hasRequiredIsMobilePhone = 1;

		Object.defineProperty(isMobilePhone, "__esModule", {
		  value: true
		});
		isMobilePhone.default = isMobilePhone$1;
		isMobilePhone.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}

		const phones = {
		  "am-AM": /^(\+?374|0)(33|4[134]|55|77|88|9[13-689])\d{6}$/,
		  "ar-AE": /^((\+?971)|0)?5[024568]\d{7}$/,
		  "ar-BH": /^(\+?973)?(3|6)\d{7}$/,
		  "ar-DZ": /^(\+?213|0)(5|6|7)\d{8}$/,
		  "ar-LB": /^(\+?961)?((3|81)\d{6}|7\d{7})$/,
		  "ar-EG": /^((\+?20)|0)?1[0125]\d{8}$/,
		  "ar-IQ": /^(\+?964|0)?7[0-9]\d{8}$/,
		  "ar-JO": /^(\+?962|0)?7[789]\d{7}$/,
		  "ar-KW": /^(\+?965)([569]\d{7}|41\d{6})$/,
		  "ar-LY": /^((\+?218)|0)?(9[1-6]\d{7}|[1-8]\d{7,9})$/,
		  "ar-MA": /^(?:(?:\+|00)212|0)[5-7]\d{8}$/,
		  "ar-OM": /^((\+|00)968)?([79][1-9])\d{6}$/,
		  "ar-PS": /^(\+?970|0)5[6|9](\d{7})$/,
		  "ar-SA": /^(!?(\+?966)|0)?5\d{8}$/,
		  "ar-SD": /^((\+?249)|0)?(9[012369]|1[012])\d{7}$/,
		  "ar-SY": /^(!?(\+?963)|0)?9\d{8}$/,
		  "ar-TN": /^(\+?216)?[2459]\d{7}$/,
		  "az-AZ": /^(\+994|0)(10|5[015]|7[07]|99)\d{7}$/,
		  "ar-QA": /^(\+?974|0)?([3567]\d{7})$/,
		  "bs-BA": /^((((\+|00)3876)|06))((([0-3]|[5-6])\d{6})|(4\d{7}))$/,
		  "be-BY": /^(\+?375)?(24|25|29|33|44)\d{7}$/,
		  "bg-BG": /^(\+?359|0)?8[789]\d{7}$/,
		  "bn-BD": /^(\+?880|0)1[13456789][0-9]{8}$/,
		  "ca-AD": /^(\+376)?[346]\d{5}$/,
		  "cs-CZ": /^(\+?420)? ?[1-9][0-9]{2} ?[0-9]{3} ?[0-9]{3}$/,
		  "da-DK": /^(\+?45)?\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/,
		  "de-DE": /^((\+49|0)1)(5[0-25-9]\d|6([23]|0\d?)|7([0-57-9]|6\d))\d{7,9}$/,
		  "de-AT": /^(\+43|0)\d{1,4}\d{3,12}$/,
		  "de-CH": /^(\+41|0)([1-9])\d{1,9}$/,
		  "de-LU": /^(\+352)?((6\d1)\d{6})$/,
		  "dv-MV": /^(\+?960)?(7[2-9]|9[1-9])\d{5}$/,
		  "el-GR": /^(\+?30|0)?6(8[5-9]|9(?![26])[0-9])\d{7}$/,
		  "el-CY": /^(\+?357?)?(9(9|7|6|5|4)\d{6})$/,
		  "en-AI": /^(\+?1|0)264(?:2(35|92)|4(?:6[1-2]|76|97)|5(?:3[6-9]|8[1-4])|7(?:2(4|9)|72))\d{4}$/,
		  "en-AU": /^(\+?61|0)4\d{8}$/,
		  "en-AG": /^(?:\+1|1)268(?:464|7(?:1[3-9]|[28]\d|3[0246]|64|7[0-689]))\d{4}$/,
		  "en-BM": /^(\+?1)?441(((3|7)\d{6}$)|(5[0-3][0-9]\d{4}$)|(59\d{5}$))/,
		  "en-BS": /^(\+?1[-\s]?|0)?\(?242\)?[-\s]?\d{3}[-\s]?\d{4}$/,
		  "en-GB": /^(\+?44|0)7[1-9]\d{8}$/,
		  "en-GG": /^(\+?44|0)1481\d{6}$/,
		  "en-GH": /^(\+233|0)(20|50|24|54|27|57|26|56|23|53|28|55|59)\d{7}$/,
		  "en-GY": /^(\+592|0)6\d{6}$/,
		  "en-HK": /^(\+?852[-\s]?)?[456789]\d{3}[-\s]?\d{4}$/,
		  "en-MO": /^(\+?853[-\s]?)?[6]\d{3}[-\s]?\d{4}$/,
		  "en-IE": /^(\+?353|0)8[356789]\d{7}$/,
		  "en-IN": /^(\+?91|0)?[6789]\d{9}$/,
		  "en-JM": /^(\+?876)?\d{7}$/,
		  "en-KE": /^(\+?254|0)(7|1)\d{8}$/,
		  "fr-CF": /^(\+?236| ?)(70|75|77|72|21|22)\d{6}$/,
		  "en-SS": /^(\+?211|0)(9[1257])\d{7}$/,
		  "en-KI": /^((\+686|686)?)?( )?((6|7)(2|3|8)[0-9]{6})$/,
		  "en-KN": /^(?:\+1|1)869(?:46\d|48[89]|55[6-8]|66\d|76[02-7])\d{4}$/,
		  "en-LS": /^(\+?266)(22|28|57|58|59|27|52)\d{6}$/,
		  "en-MT": /^(\+?356|0)?(99|79|77|21|27|22|25)[0-9]{6}$/,
		  "en-MU": /^(\+?230|0)?\d{8}$/,
		  "en-MW": /^(\+?265|0)(((77|88|31|99|98|21)\d{7})|(((111)|1)\d{6})|(32000\d{4}))$/,
		  "en-NA": /^(\+?264|0)(6|8)\d{7}$/,
		  "en-NG": /^(\+?234|0)?[789]\d{9}$/,
		  "en-NZ": /^(\+?64|0)[28]\d{7,9}$/,
		  "en-PG": /^(\+?675|0)?(7\d|8[18])\d{6}$/,
		  "en-PK": /^((00|\+)?92|0)3[0-6]\d{8}$/,
		  "en-PH": /^(09|\+639)\d{9}$/,
		  "en-RW": /^(\+?250|0)?[7]\d{8}$/,
		  "en-SG": /^(\+65)?[3689]\d{7}$/,
		  "en-SL": /^(\+?232|0)\d{8}$/,
		  "en-TZ": /^(\+?255|0)?[67]\d{8}$/,
		  "en-UG": /^(\+?256|0)?[7]\d{8}$/,
		  "en-US": /^((\+1|1)?( |-)?)?(\([2-9][0-9]{2}\)|[2-9][0-9]{2})( |-)?([2-9][0-9]{2}( |-)?[0-9]{4})$/,
		  "en-ZA": /^(\+?27|0)\d{9}$/,
		  "en-ZM": /^(\+?26)?0[79][567]\d{7}$/,
		  "en-ZW": /^(\+263)[0-9]{9}$/,
		  "en-BW": /^(\+?267)?(7[1-8]{1})\d{6}$/,
		  "es-AR": /^\+?549(11|[2368]\d)\d{8}$/,
		  "es-BO": /^(\+?591)?(6|7)\d{7}$/,
		  "es-CO": /^(\+?57)?3(0(0|1|2|4|5)|1\d|2[0-4]|5(0|1))\d{7}$/,
		  "es-CL": /^(\+?56|0)[2-9]\d{1}\d{7}$/,
		  "es-CR": /^(\+506)?[2-8]\d{7}$/,
		  "es-CU": /^(\+53|0053)?5\d{7}$/,
		  "es-DO": /^(\+?1)?8[024]9\d{7}$/,
		  "es-HN": /^(\+?504)?[9|8|3|2]\d{7}$/,
		  "es-EC": /^(\+?593|0)([2-7]|9[2-9])\d{7}$/,
		  "es-ES": /^(\+?34)?[6|7]\d{8}$/,
		  "es-GT": /^(\+?502)?[2|6|7]\d{7}$/,
		  "es-PE": /^(\+?51)?9\d{8}$/,
		  "es-MX": /^(\+?52)?(1|01)?\d{10,11}$/,
		  "es-NI": /^(\+?505)\d{7,8}$/,
		  "es-PA": /^(\+?507)\d{7,8}$/,
		  "es-PY": /^(\+?595|0)9[9876]\d{7}$/,
		  "es-SV": /^(\+?503)?[67]\d{7}$/,
		  "es-UY": /^(\+598|0)9[1-9][\d]{6}$/,
		  "es-VE": /^(\+?58)?(2|4)\d{9}$/,
		  "et-EE": /^(\+?372)?\s?(5|8[1-4])\s?([0-9]\s?){6,7}$/,
		  "fa-IR": /^(\+?98[\-\s]?|0)9[0-39]\d[\-\s]?\d{3}[\-\s]?\d{4}$/,
		  "fi-FI": /^(\+?358|0)\s?(4[0-6]|50)\s?(\d\s?){4,8}$/,
		  "fj-FJ": /^(\+?679)?\s?\d{3}\s?\d{4}$/,
		  "fo-FO": /^(\+?298)?\s?\d{2}\s?\d{2}\s?\d{2}$/,
		  "fr-BF": /^(\+226|0)[67]\d{7}$/,
		  "fr-BJ": /^(\+229)\d{8}$/,
		  "fr-CD": /^(\+?243|0)?(8|9)\d{8}$/,
		  "fr-CM": /^(\+?237)6[0-9]{8}$/,
		  "fr-FR": /^(\+?33|0)[67]\d{8}$/,
		  "fr-GF": /^(\+?594|0|00594)[67]\d{8}$/,
		  "fr-GP": /^(\+?590|0|00590)[67]\d{8}$/,
		  "fr-MQ": /^(\+?596|0|00596)[67]\d{8}$/,
		  "fr-PF": /^(\+?689)?8[789]\d{6}$/,
		  "fr-RE": /^(\+?262|0|00262)[67]\d{8}$/,
		  "fr-WF": /^(\+681)?\d{6}$/,
		  "he-IL": /^(\+972|0)([23489]|5[012345689]|77)[1-9]\d{6}$/,
		  "hu-HU": /^(\+?36|06)(20|30|31|50|70)\d{7}$/,
		  "id-ID": /^(\+?62|0)8(1[123456789]|2[1238]|3[1238]|5[12356789]|7[78]|9[56789]|8[123456789])([\s?|\d]{5,11})$/,
		  "ir-IR": /^(\+98|0)?9\d{9}$/,
		  "it-IT": /^(\+?39)?\s?3\d{2} ?\d{6,7}$/,
		  "it-SM": /^((\+378)|(0549)|(\+390549)|(\+3780549))?6\d{5,9}$/,
		  "ja-JP": /^(\+81[ \-]?(\(0\))?|0)[6789]0[ \-]?\d{4}[ \-]?\d{4}$/,
		  "ka-GE": /^(\+?995)?(79\d{7}|5\d{8})$/,
		  "kk-KZ": /^(\+?7|8)?7\d{9}$/,
		  "kl-GL": /^(\+?299)?\s?\d{2}\s?\d{2}\s?\d{2}$/,
		  "ko-KR": /^((\+?82)[ \-]?)?0?1([0|1|6|7|8|9]{1})[ \-]?\d{3,4}[ \-]?\d{4}$/,
		  "ky-KG": /^(\+996\s?)?(22[0-9]|50[0-9]|55[0-9]|70[0-9]|75[0-9]|77[0-9]|880|990|995|996|997|998)\s?\d{3}\s?\d{3}$/,
		  "lt-LT": /^(\+370|8)\d{8}$/,
		  "lv-LV": /^(\+?371)2\d{7}$/,
		  "mg-MG": /^((\+?261|0)(2|3)\d)?\d{7}$/,
		  "mn-MN": /^(\+|00|011)?976(77|81|88|91|94|95|96|99)\d{6}$/,
		  "my-MM": /^(\+?959|09|9)(2[5-7]|3[1-2]|4[0-5]|6[6-9]|7[5-9]|9[6-9])[0-9]{7}$/,
		  "ms-MY": /^(\+?60|0)1(([0145](-|\s)?\d{7,8})|([236-9](-|\s)?\d{7}))$/,
		  "mz-MZ": /^(\+?258)?8[234567]\d{7}$/,
		  "nb-NO": /^(\+?47)?[49]\d{7}$/,
		  "ne-NP": /^(\+?977)?9[78]\d{8}$/,
		  "nl-BE": /^(\+?32|0)4\d{8}$/,
		  "nl-NL": /^(((\+|00)?31\(0\))|((\+|00)?31)|0)6{1}\d{8}$/,
		  "nl-AW": /^(\+)?297(56|59|64|73|74|99)\d{5}$/,
		  "nn-NO": /^(\+?47)?[49]\d{7}$/,
		  "pl-PL": /^(\+?48)? ?([5-8]\d|45) ?\d{3} ?\d{2} ?\d{2}$/,
		  "pt-BR": /^((\+?55\ ?[1-9]{2}\ ?)|(\+?55\ ?\([1-9]{2}\)\ ?)|(0[1-9]{2}\ ?)|(\([1-9]{2}\)\ ?)|([1-9]{2}\ ?))((\d{4}\-?\d{4})|(9[1-9]{1}\d{3}\-?\d{4}))$/,
		  "pt-PT": /^(\+?351)?9[1236]\d{7}$/,
		  "pt-AO": /^(\+?244)?9\d{8}$/,
		  "ro-MD": /^(\+?373|0)((6(0|1|2|6|7|8|9))|(7(6|7|8|9)))\d{6}$/,
		  "ro-RO": /^(\+?40|0)\s?7\d{2}(\/|\s|\.|-)?\d{3}(\s|\.|-)?\d{3}$/,
		  "ru-RU": /^(\+?7|8)?9\d{9}$/,
		  "si-LK": /^(?:0|94|\+94)?(7(0|1|2|4|5|6|7|8)( |-)?)\d{7}$/,
		  "sl-SI": /^(\+386\s?|0)(\d{1}\s?\d{3}\s?\d{2}\s?\d{2}|\d{2}\s?\d{3}\s?\d{3})$/,
		  "sk-SK": /^(\+?421)? ?[1-9][0-9]{2} ?[0-9]{3} ?[0-9]{3}$/,
		  "so-SO": /^(\+?252|0)((6[0-9])\d{7}|(7[1-9])\d{7})$/,
		  "sq-AL": /^(\+355|0)6[2-9]\d{7}$/,
		  "sr-RS": /^(\+3816|06)[- \d]{5,9}$/,
		  "sv-SE": /^(\+?46|0)[\s\-]?7[\s\-]?[02369]([\s\-]?\d){7}$/,
		  "tg-TJ": /^(\+?992)?[5][5]\d{7}$/,
		  "th-TH": /^(\+66|66|0)\d{9}$/,
		  "tr-TR": /^(\+?90|0)?5\d{9}$/,
		  "tk-TM": /^(\+993|993|8)\d{8}$/,
		  "uk-UA": /^(\+?38)?0(50|6[36-8]|7[357]|9[1-9])\d{7}$/,
		  "uz-UZ": /^(\+?998)?(6[125-79]|7[1-69]|88|9\d)\d{7}$/,
		  "vi-VN": /^((\+?84)|0)((3([2-9]))|(5([25689]))|(7([0|6-9]))|(8([1-9]))|(9([0-9])))([0-9]{7})$/,
		  "zh-CN": /^((\+|00)86)?(1[3-9]|9[28])\d{9}$/,
		  "zh-TW": /^(\+?886\-?|0)?9\d{8}$/,
		  "dz-BT": /^(\+?975|0)?(17|16|77|02)\d{6}$/,
		  "ar-YE": /^(((\+|00)9677|0?7)[0137]\d{7}|((\+|00)967|0)[1-7]\d{6})$/,
		  "ar-EH": /^(\+?212|0)[\s\-]?(5288|5289)[\s\-]?\d{5}$/,
		  "fa-AF": /^(\+93|0)?(2{1}[0-8]{1}|[3-5]{1}[0-4]{1})(\d{7})$/,
		  "mk-MK": /^(\+?389|0)?((?:2[2-9]\d{6}|(?:3[1-4]|4[2-8])\d{6}|500\d{5}|5[2-9]\d{6}|7[0-9][2-9]\d{5}|8[1-9]\d{6}|800\d{5}|8009\d{4}))$/
		};


		// aliases
		phones["en-CA"] = phones["en-US"];
		phones["fr-CA"] = phones["en-CA"];
		phones["fr-BE"] = phones["nl-BE"];
		phones["zh-HK"] = phones["en-HK"];
		phones["zh-MO"] = phones["en-MO"];
		phones["ga-IE"] = phones["en-IE"];
		phones["fr-CH"] = phones["de-CH"];
		phones["it-CH"] = phones["fr-CH"];
		function isMobilePhone$1(str, locale, options) {
		  (0, _assertString.default)(str);
		  if (options && options.strictMode && !str.startsWith("+")) {
		    return false;
		  }
		  if (Array.isArray(locale)) {
		    return locale.some(function(key) {
		      // https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md#ignoring-code-for-coverage-purposes
		      // istanbul ignore else
		      if (phones.hasOwnProperty(key)) {
		        const phone = phones[key];
		        if (phone.test(str)) {
		          return true;
		        }
		      }
		      return false;
		    });
		  } else if (locale in phones) {
		    return phones[locale].test(str);
		    // alias falsey locale as 'any'
		  } else if (!locale || locale === "any") {
		    for (const key in phones) {
		      // istanbul ignore else
		      if (phones.hasOwnProperty(key)) {
		        const phone = phones[key];
		        if (phone.test(str)) {
		          return true;
		        }
		      }
		    }
		    return false;
		  }
		  throw new Error("Invalid locale '".concat(locale, "'"));
		}
		isMobilePhone.locales = Object.keys(phones);
		return isMobilePhone;
	}

	const isEthereumAddress = {exports: {}};

	let hasRequiredIsEthereumAddress;

	function requireIsEthereumAddress() {
		if (hasRequiredIsEthereumAddress) return isEthereumAddress.exports;
		hasRequiredIsEthereumAddress = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isEthereumAddress;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const eth = /^(0x)[0-9a-f]{40}$/i;
			function isEthereumAddress(str) {
			  (0, _assertString.default)(str);
			  return eth.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isEthereumAddress, isEthereumAddress.exports));
		return isEthereumAddress.exports;
	}

	const isCurrency = {exports: {}};

	let hasRequiredIsCurrency;

	function requireIsCurrency() {
		if (hasRequiredIsCurrency) return isCurrency.exports;
		hasRequiredIsCurrency = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isCurrency;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function currencyRegex(options) {
			  let decimal_digits = "\\d{".concat(options.digits_after_decimal[0], "}");
			  options.digits_after_decimal.forEach(function(digit, index) {
			    if (index !== 0) decimal_digits = "".concat(decimal_digits, "|\\d{").concat(digit, "}");
			  });
			  const symbol = "(".concat(options.symbol.replace(/\W/, function(m) {
			      return "\\".concat(m);
			    }), ")").concat(options.require_symbol ? "" : "?");
			    const negative = "-?";
			    const whole_dollar_amount_without_sep = "[1-9]\\d*";
			    const whole_dollar_amount_with_sep = "[1-9]\\d{0,2}(\\".concat(options.thousands_separator, "\\d{3})*");
			    const valid_whole_dollar_amounts = ["0", whole_dollar_amount_without_sep, whole_dollar_amount_with_sep];
			    const whole_dollar_amount = "(".concat(valid_whole_dollar_amounts.join("|"), ")?");
			    const decimal_amount = "(\\".concat(options.decimal_separator, "(").concat(decimal_digits, "))").concat(options.require_decimal ? "" : "?");
			  let pattern = whole_dollar_amount + (options.allow_decimal || options.require_decimal ? decimal_amount : "");

			  // default is negative sign before symbol, but there are two other options (besides parens)
			  if (options.allow_negatives && !options.parens_for_negatives) {
			    if (options.negative_sign_after_digits) {
			      pattern += negative;
			    } else if (options.negative_sign_before_digits) {
			      pattern = negative + pattern;
			    }
			  }

			  // South African Rand, for example, uses R 123 (space) and R-123 (no space)
			  if (options.allow_negative_sign_placeholder) {
			    pattern = "( (?!\\-))?".concat(pattern);
			  } else if (options.allow_space_after_symbol) {
			    pattern = " ?".concat(pattern);
			  } else if (options.allow_space_after_digits) {
			    pattern += "( (?!$))?";
			  }
			  if (options.symbol_after_digits) {
			    pattern += symbol;
			  } else {
			    pattern = symbol + pattern;
			  }
			  if (options.allow_negatives) {
			    if (options.parens_for_negatives) {
			      pattern = "(\\(".concat(pattern, "\\)|").concat(pattern, ")");
			    } else if (!(options.negative_sign_before_digits || options.negative_sign_after_digits)) {
			      pattern = negative + pattern;
			    }
			  }

			  // ensure there's a dollar and/or decimal amount, and that
			  // it doesn't start with a space or a negative sign followed by a space
			  return new RegExp("^(?!-? )(?=.*\\d)".concat(pattern, "$"));
			}
			const default_currency_options = {
			  symbol: "$",
			  require_symbol: false,
			  allow_space_after_symbol: false,
			  symbol_after_digits: false,
			  allow_negatives: true,
			  parens_for_negatives: false,
			  negative_sign_before_digits: false,
			  negative_sign_after_digits: false,
			  allow_negative_sign_placeholder: false,
			  thousands_separator: ",",
			  decimal_separator: ".",
			  allow_decimal: true,
			  require_decimal: false,
			  digits_after_decimal: [2],
			  allow_space_after_digits: false
			};
			function isCurrency(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, default_currency_options);
			  return currencyRegex(options).test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isCurrency, isCurrency.exports));
		return isCurrency.exports;
	}

	const isBtcAddress = {exports: {}};

	let hasRequiredIsBtcAddress;

	function requireIsBtcAddress() {
		if (hasRequiredIsBtcAddress) return isBtcAddress.exports;
		hasRequiredIsBtcAddress = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBtcAddress;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const bech32 = /^(bc1|tb1|bc1p|tb1p)[ac-hj-np-z02-9]{39,58}$/;
			const base58 = /^(1|2|3|m)[A-HJ-NP-Za-km-z1-9]{25,39}$/;
			function isBtcAddress(str) {
			  (0, _assertString.default)(str);
			  return bech32.test(str) || base58.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBtcAddress, isBtcAddress.exports));
		return isBtcAddress.exports;
	}

	const isISO6346 = {};

	let hasRequiredIsISO6346;

	function requireIsISO6346() {
		if (hasRequiredIsISO6346) return isISO6346;
		hasRequiredIsISO6346 = 1;

		Object.defineProperty(isISO6346, "__esModule", {
		  value: true
		});
		isISO6346.isFreightContainerID = void 0;
		isISO6346.isISO6346 = isISO6346$1;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		// https://en.wikipedia.org/wiki/ISO_6346
		// according to ISO6346 standard, checksum digit is mandatory for freight container but recommended
		// for other container types (J and Z)
		const isISO6346Str = /^[A-Z]{3}(U[0-9]{7})|([J,Z][0-9]{6,7})$/;
		const isDigit = /^[0-9]$/;
		function isISO6346$1(str) {
		  (0, _assertString.default)(str);
		  str = str.toUpperCase();
		  if (!isISO6346Str.test(str)) return false;
		  if (str.length === 11) {
		    let sum = 0;
		    for (let i = 0; i < str.length - 1; i++) {
		      if (!isDigit.test(str[i])) {
		        let convertedCode = void 0;
		        const letterCode = str.charCodeAt(i) - 55;
		        if (letterCode < 11) convertedCode = letterCode; else if (letterCode >= 11 && letterCode <= 20) convertedCode = 12 + letterCode % 11; else if (letterCode >= 21 && letterCode <= 30) convertedCode = 23 + letterCode % 21; else convertedCode = 34 + letterCode % 31;
		        sum += convertedCode * Math.pow(2, i);
		      } else sum += str[i] * Math.pow(2, i);
		    }
		    let checkSumDigit = sum % 11;
		    if (checkSumDigit === 10) checkSumDigit = 0;
		    return Number(str[str.length - 1]) === checkSumDigit;
		  }
		  return true;
		}
		isISO6346.isFreightContainerID = isISO6346$1;
		return isISO6346;
	}

	const isISO6391 = {exports: {}};

	let hasRequiredIsISO6391;

	function requireIsISO6391() {
		if (hasRequiredIsISO6391) return isISO6391.exports;
		hasRequiredIsISO6391 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISO6391;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const isISO6391Set = new Set(["aa", "ab", "ae", "af", "ak", "am", "an", "ar", "as", "av", "ay", "az", "az", "ba", "be", "bg", "bh", "bi", "bm", "bn", "bo", "br", "bs", "ca", "ce", "ch", "co", "cr", "cs", "cu", "cv", "cy", "da", "de", "dv", "dz", "ee", "el", "en", "eo", "es", "et", "eu", "fa", "ff", "fi", "fj", "fo", "fr", "fy", "ga", "gd", "gl", "gn", "gu", "gv", "ha", "he", "hi", "ho", "hr", "ht", "hu", "hy", "hz", "ia", "id", "ie", "ig", "ii", "ik", "io", "is", "it", "iu", "ja", "jv", "ka", "kg", "ki", "kj", "kk", "kl", "km", "kn", "ko", "kr", "ks", "ku", "kv", "kw", "ky", "la", "lb", "lg", "li", "ln", "lo", "lt", "lu", "lv", "mg", "mh", "mi", "mk", "ml", "mn", "mr", "ms", "mt", "my", "na", "nb", "nd", "ne", "ng", "nl", "nn", "no", "nr", "nv", "ny", "oc", "oj", "om", "or", "os", "pa", "pi", "pl", "ps", "pt", "qu", "rm", "rn", "ro", "ru", "rw", "sa", "sc", "sd", "se", "sg", "si", "sk", "sl", "sm", "sn", "so", "sq", "sr", "ss", "st", "su", "sv", "sw", "ta", "te", "tg", "th", "ti", "tk", "tl", "tn", "to", "tr", "ts", "tt", "tw", "ty", "ug", "uk", "ur", "uz", "ve", "vi", "vo", "wa", "wo", "xh", "yi", "yo", "za", "zh", "zu"]);
			function isISO6391(str) {
			  (0, _assertString.default)(str);
			  return isISO6391Set.has(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISO6391, isISO6391.exports));
		return isISO6391.exports;
	}

	const isISO8601 = {exports: {}};

	let hasRequiredIsISO8601;

	function requireIsISO8601() {
		if (hasRequiredIsISO8601) return isISO8601.exports;
		hasRequiredIsISO8601 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISO8601;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}

			// from http://goo.gl/0ejHHW
			const iso8601 = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-3])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;
			// same as above, except with a strict 'T' separator between date and time
			const iso8601StrictSeparator = /^([\+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-3])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([\.,]\d+(?!:))?)?(\17[0-5]\d([\.,]\d+)?)?([zZ]|([\+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/;

			const isValidDate = function isValidDate(str) {
			  // str must have passed the ISO8601 check
			  // this check is meant to catch invalid dates
			  // like 2009-02-31
			  // first check for ordinal dates
			  const ordinalMatch = str.match(/^(\d{4})-?(\d{3})([ T]{1}\.*|$)/);
			  if (ordinalMatch) {
			    const oYear = Number(ordinalMatch[1]);
			    const oDay = Number(ordinalMatch[2]);
			    // if is leap year
			    if (oYear % 4 === 0 && oYear % 100 !== 0 || oYear % 400 === 0) return oDay <= 366;
			    return oDay <= 365;
			  }
			  const match = str.match(/(\d{4})-?(\d{0,2})-?(\d*)/).map(Number);
			  const year = match[1];
			  const month = match[2];
			  const day = match[3];
			  const monthString = month ? "0".concat(month).slice(-2) : month;
			  const dayString = day ? "0".concat(day).slice(-2) : day;

			  // create a date object and compare
			  const d = new Date("".concat(year, "-").concat(monthString || "01", "-").concat(dayString || "01"));
			  if (month && day) {
			    return d.getUTCFullYear() === year && d.getUTCMonth() + 1 === month && d.getUTCDate() === day;
			  }
			  return true;
			};
			function isISO8601(str) {
			  const options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
			  (0, _assertString.default)(str);
			  const check = options.strictSeparator ? iso8601StrictSeparator.test(str) : iso8601.test(str);
			  if (check && options.strict) return isValidDate(str);
			  return check;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISO8601, isISO8601.exports));
		return isISO8601.exports;
	}

	const isRFC3339 = {exports: {}};

	let hasRequiredIsRFC3339;

	function requireIsRFC3339() {
		if (hasRequiredIsRFC3339) return isRFC3339.exports;
		hasRequiredIsRFC3339 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isRFC3339;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/* Based on https://tools.ietf.org/html/rfc3339#section-5.6 */

			const dateFullYear = /[0-9]{4}/;
			const dateMonth = /(0[1-9]|1[0-2])/;
			const dateMDay = /([12]\d|0[1-9]|3[01])/;
			const timeHour = /([01][0-9]|2[0-3])/;
			const timeMinute = /[0-5][0-9]/;
			const timeSecond = /([0-5][0-9]|60)/;
			const timeSecFrac = /(\.[0-9]+)?/;
			const timeNumOffset = new RegExp("[-+]".concat(timeHour.source, ":").concat(timeMinute.source));
			const timeOffset = new RegExp("([zZ]|".concat(timeNumOffset.source, ")"));
			const partialTime = new RegExp("".concat(timeHour.source, ":").concat(timeMinute.source, ":").concat(timeSecond.source).concat(timeSecFrac.source));
			const fullDate = new RegExp("".concat(dateFullYear.source, "-").concat(dateMonth.source, "-").concat(dateMDay.source));
			const fullTime = new RegExp("".concat(partialTime.source).concat(timeOffset.source));
			const rfc3339 = new RegExp("^".concat(fullDate.source, "[ tT]").concat(fullTime.source, "$"));
			function isRFC3339(str) {
			  (0, _assertString.default)(str);
			  return rfc3339.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isRFC3339, isRFC3339.exports));
		return isRFC3339.exports;
	}

	const isISO15924 = {};

	let hasRequiredIsISO15924;

	function requireIsISO15924() {
		if (hasRequiredIsISO15924) return isISO15924;
		hasRequiredIsISO15924 = 1;

		Object.defineProperty(isISO15924, "__esModule", {
		  value: true
		});
		isISO15924.ScriptCodes = void 0;
		isISO15924.default = isISO15924$1;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		// from https://www.unicode.org/iso15924/iso15924-codes.html
		const validISO15924Codes = new Set(["Adlm", "Afak", "Aghb", "Ahom", "Arab", "Aran", "Armi", "Armn", "Avst", "Bali", "Bamu", "Bass", "Batk", "Beng", "Bhks", "Blis", "Bopo", "Brah", "Brai", "Bugi", "Buhd", "Cakm", "Cans", "Cari", "Cham", "Cher", "Chis", "Chrs", "Cirt", "Copt", "Cpmn", "Cprt", "Cyrl", "Cyrs", "Deva", "Diak", "Dogr", "Dsrt", "Dupl", "Egyd", "Egyh", "Egyp", "Elba", "Elym", "Ethi", "Gara", "Geok", "Geor", "Glag", "Gong", "Gonm", "Goth", "Gran", "Grek", "Gujr", "Gukh", "Guru", "Hanb", "Hang", "Hani", "Hano", "Hans", "Hant", "Hatr", "Hebr", "Hira", "Hluw", "Hmng", "Hmnp", "Hrkt", "Hung", "Inds", "Ital", "Jamo", "Java", "Jpan", "Jurc", "Kali", "Kana", "Kawi", "Khar", "Khmr", "Khoj", "Kitl", "Kits", "Knda", "Kore", "Kpel", "Krai", "Kthi", "Lana", "Laoo", "Latf", "Latg", "Latn", "Leke", "Lepc", "Limb", "Lina", "Linb", "Lisu", "Loma", "Lyci", "Lydi", "Mahj", "Maka", "Mand", "Mani", "Marc", "Maya", "Medf", "Mend", "Merc", "Mero", "Mlym", "Modi", "Mong", "Moon", "Mroo", "Mtei", "Mult", "Mymr", "Nagm", "Nand", "Narb", "Nbat", "Newa", "Nkdb", "Nkgb", "Nkoo", "Nshu", "Ogam", "Olck", "Onao", "Orkh", "Orya", "Osge", "Osma", "Ougr", "Palm", "Pauc", "Pcun", "Pelm", "Perm", "Phag", "Phli", "Phlp", "Phlv", "Phnx", "Plrd", "Piqd", "Prti", "Psin", "Qaaa", "Qaab", "Qaac", "Qaad", "Qaae", "Qaaf", "Qaag", "Qaah", "Qaai", "Qaaj", "Qaak", "Qaal", "Qaam", "Qaan", "Qaao", "Qaap", "Qaaq", "Qaar", "Qaas", "Qaat", "Qaau", "Qaav", "Qaaw", "Qaax", "Qaay", "Qaaz", "Qaba", "Qabb", "Qabc", "Qabd", "Qabe", "Qabf", "Qabg", "Qabh", "Qabi", "Qabj", "Qabk", "Qabl", "Qabm", "Qabn", "Qabo", "Qabp", "Qabq", "Qabr", "Qabs", "Qabt", "Qabu", "Qabv", "Qabw", "Qabx", "Ranj", "Rjng", "Rohg", "Roro", "Runr", "Samr", "Sara", "Sarb", "Saur", "Sgnw", "Shaw", "Shrd", "Shui", "Sidd", "Sidt", "Sind", "Sinh", "Sogd", "Sogo", "Sora", "Soyo", "Sund", "Sunu", "Sylo", "Syrc", "Syre", "Syrj", "Syrn", "Tagb", "Takr", "Tale", "Talu", "Taml", "Tang", "Tavt", "Tayo", "Telu", "Teng", "Tfng", "Tglg", "Thaa", "Thai", "Tibt", "Tirh", "Tnsa", "Todr", "Tols", "Toto", "Tutg", "Ugar", "Vaii", "Visp", "Vith", "Wara", "Wcho", "Wole", "Xpeo", "Xsux", "Yezi", "Yiii", "Zanb", "Zinh", "Zmth", "Zsye", "Zsym", "Zxxx", "Zyyy", "Zzzz"]);
		function isISO15924$1(str) {
		  (0, _assertString.default)(str);
		  return validISO15924Codes.has(str);
		}
		isISO15924.ScriptCodes = validISO15924Codes;
		return isISO15924;
	}

	const isISO31661Alpha3 = {exports: {}};

	let hasRequiredIsISO31661Alpha3;

	function requireIsISO31661Alpha3() {
		if (hasRequiredIsISO31661Alpha3) return isISO31661Alpha3.exports;
		hasRequiredIsISO31661Alpha3 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISO31661Alpha3;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// from https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3
			const validISO31661Alpha3CountriesCodes = new Set(["AFG", "ALA", "ALB", "DZA", "ASM", "AND", "AGO", "AIA", "ATA", "ATG", "ARG", "ARM", "ABW", "AUS", "AUT", "AZE", "BHS", "BHR", "BGD", "BRB", "BLR", "BEL", "BLZ", "BEN", "BMU", "BTN", "BOL", "BES", "BIH", "BWA", "BVT", "BRA", "IOT", "BRN", "BGR", "BFA", "BDI", "KHM", "CMR", "CAN", "CPV", "CYM", "CAF", "TCD", "CHL", "CHN", "CXR", "CCK", "COL", "COM", "COG", "COD", "COK", "CRI", "CIV", "HRV", "CUB", "CUW", "CYP", "CZE", "DNK", "DJI", "DMA", "DOM", "ECU", "EGY", "SLV", "GNQ", "ERI", "EST", "ETH", "FLK", "FRO", "FJI", "FIN", "FRA", "GUF", "PYF", "ATF", "GAB", "GMB", "GEO", "DEU", "GHA", "GIB", "GRC", "GRL", "GRD", "GLP", "GUM", "GTM", "GGY", "GIN", "GNB", "GUY", "HTI", "HMD", "VAT", "HND", "HKG", "HUN", "ISL", "IND", "IDN", "IRN", "IRQ", "IRL", "IMN", "ISR", "ITA", "JAM", "JPN", "JEY", "JOR", "KAZ", "KEN", "KIR", "PRK", "KOR", "KWT", "KGZ", "LAO", "LVA", "LBN", "LSO", "LBR", "LBY", "LIE", "LTU", "LUX", "MAC", "MKD", "MDG", "MWI", "MYS", "MDV", "MLI", "MLT", "MHL", "MTQ", "MRT", "MUS", "MYT", "MEX", "FSM", "MDA", "MCO", "MNG", "MNE", "MSR", "MAR", "MOZ", "MMR", "NAM", "NRU", "NPL", "NLD", "NCL", "NZL", "NIC", "NER", "NGA", "NIU", "NFK", "MNP", "NOR", "OMN", "PAK", "PLW", "PSE", "PAN", "PNG", "PRY", "PER", "PHL", "PCN", "POL", "PRT", "PRI", "QAT", "REU", "ROU", "RUS", "RWA", "BLM", "SHN", "KNA", "LCA", "MAF", "SPM", "VCT", "WSM", "SMR", "STP", "SAU", "SEN", "SRB", "SYC", "SLE", "SGP", "SXM", "SVK", "SVN", "SLB", "SOM", "ZAF", "SGS", "SSD", "ESP", "LKA", "SDN", "SUR", "SJM", "SWZ", "SWE", "CHE", "SYR", "TWN", "TJK", "TZA", "THA", "TLS", "TGO", "TKL", "TON", "TTO", "TUN", "TUR", "TKM", "TCA", "TUV", "UGA", "UKR", "ARE", "GBR", "USA", "UMI", "URY", "UZB", "VUT", "VEN", "VNM", "VGB", "VIR", "WLF", "ESH", "YEM", "ZMB", "ZWE"]);
			function isISO31661Alpha3(str) {
			  (0, _assertString.default)(str);
			  return validISO31661Alpha3CountriesCodes.has(str.toUpperCase());
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISO31661Alpha3, isISO31661Alpha3.exports));
		return isISO31661Alpha3.exports;
	}

	const isISO31661Numeric = {exports: {}};

	let hasRequiredIsISO31661Numeric;

	function requireIsISO31661Numeric() {
		if (hasRequiredIsISO31661Numeric) return isISO31661Numeric.exports;
		hasRequiredIsISO31661Numeric = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isISO31661Numeric;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// from https://en.wikipedia.org/wiki/ISO_3166-1_numeric
			const validISO31661NumericCountriesCodes = new Set(["004", "008", "010", "012", "016", "020", "024", "028", "031", "032", "036", "040", "044", "048", "050", "051", "052", "056", "060", "064", "068", "070", "072", "074", "076", "084", "086", "090", "092", "096", "100", "104", "108", "112", "116", "120", "124", "132", "136", "140", "144", "148", "152", "156", "158", "162", "166", "170", "174", "175", "178", "180", "184", "188", "191", "192", "196", "203", "204", "208", "212", "214", "218", "222", "226", "231", "232", "233", "234", "238", "239", "242", "246", "248", "250", "254", "258", "260", "262", "266", "268", "270", "275", "276", "288", "292", "296", "300", "304", "308", "312", "316", "320", "324", "328", "332", "334", "336", "340", "344", "348", "352", "356", "360", "364", "368", "372", "376", "380", "384", "388", "392", "398", "400", "404", "408", "410", "414", "417", "418", "422", "426", "428", "430", "434", "438", "440", "442", "446", "450", "454", "458", "462", "466", "470", "474", "478", "480", "484", "492", "496", "498", "499", "500", "504", "508", "512", "516", "520", "524", "528", "531", "533", "534", "535", "540", "548", "554", "558", "562", "566", "570", "574", "578", "580", "581", "583", "584", "585", "586", "591", "598", "600", "604", "608", "612", "616", "620", "624", "626", "630", "634", "638", "642", "643", "646", "652", "654", "659", "660", "662", "663", "666", "670", "674", "678", "682", "686", "688", "690", "694", "702", "703", "704", "705", "706", "710", "716", "724", "728", "729", "732", "740", "744", "748", "752", "756", "760", "762", "764", "768", "772", "776", "780", "784", "788", "792", "795", "796", "798", "800", "804", "807", "818", "826", "831", "832", "833", "834", "840", "850", "854", "858", "860", "862", "876", "882", "887", "894"]);
			function isISO31661Numeric(str) {
			  (0, _assertString.default)(str);
			  return validISO31661NumericCountriesCodes.has(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isISO31661Numeric, isISO31661Numeric.exports));
		return isISO31661Numeric.exports;
	}

	const isISO4217 = {};

	let hasRequiredIsISO4217;

	function requireIsISO4217() {
		if (hasRequiredIsISO4217) return isISO4217;
		hasRequiredIsISO4217 = 1;

		Object.defineProperty(isISO4217, "__esModule", {
		  value: true
		});
		isISO4217.CurrencyCodes = void 0;
		isISO4217.default = isISO4217$1;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		// from https://en.wikipedia.org/wiki/ISO_4217
		const validISO4217CurrencyCodes = new Set(["AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BOV", "BRL", "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF", "CHW", "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG", "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR", "MZN", "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SLL", "SOS", "SRD", "SSP", "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYI", "UYU", "UYW", "UZS", "VED", "VES", "VND", "VUV", "WST", "XAF", "XAG", "XAU", "XBA", "XBB", "XBC", "XBD", "XCD", "XDR", "XOF", "XPD", "XPF", "XPT", "XSU", "XTS", "XUA", "XXX", "YER", "ZAR", "ZMW", "ZWL"]);
		function isISO4217$1(str) {
		  (0, _assertString.default)(str);
		  return validISO4217CurrencyCodes.has(str.toUpperCase());
		}
		isISO4217.CurrencyCodes = validISO4217CurrencyCodes;
		return isISO4217;
	}

	const isBase32 = {exports: {}};

	let hasRequiredIsBase32;

	function requireIsBase32() {
		if (hasRequiredIsBase32) return isBase32.exports;
		hasRequiredIsBase32 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBase32;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const base32 = /^[A-Z2-7]+=*$/;
			const crockfordBase32 = /^[A-HJKMNP-TV-Z0-9]+$/;
			const defaultBase32Options = {
			  crockford: false
			};
			function isBase32(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, defaultBase32Options);
			  if (options.crockford) {
			    return crockfordBase32.test(str);
			  }
			  const len = str.length;
			  if (len % 8 === 0 && base32.test(str)) {
			    return true;
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBase32, isBase32.exports));
		return isBase32.exports;
	}

	const isBase58 = {exports: {}};

	let hasRequiredIsBase58;

	function requireIsBase58() {
		if (hasRequiredIsBase58) return isBase58.exports;
		hasRequiredIsBase58 = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isBase58;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			// Accepted chars - 123456789ABCDEFGH JKLMN PQRSTUVWXYZabcdefghijk mnopqrstuvwxyz
			const base58Reg = /^[A-HJ-NP-Za-km-z1-9]*$/;
			function isBase58(str) {
			  (0, _assertString.default)(str);
			  if (base58Reg.test(str)) {
			    return true;
			  }
			  return false;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isBase58, isBase58.exports));
		return isBase58.exports;
	}

	const isDataURI = {exports: {}};

	let hasRequiredIsDataURI;

	function requireIsDataURI() {
		if (hasRequiredIsDataURI) return isDataURI.exports;
		hasRequiredIsDataURI = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isDataURI;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const validMediaType = /^[a-z]+\/[a-z0-9\-\+\._]+$/i;
			const validAttribute = /^[a-z\-]+=[a-z0-9\-]+$/i;
			const validData = /^[a-z0-9!\$&'\(\)\*\+,;=\-\._~:@\/\?%\s]*$/i;
			function isDataURI(str) {
			  (0, _assertString.default)(str);
			  const data = str.split(",");
			  if (data.length < 2) {
			    return false;
			  }
			  const attributes = data.shift().trim().split(";");
			  const schemeAndMediaType = attributes.shift();
			  if (schemeAndMediaType.slice(0, 5) !== "data:") {
			    return false;
			  }
			  const mediaType = schemeAndMediaType.slice(5);
			  if (mediaType !== "" && !validMediaType.test(mediaType)) {
			    return false;
			  }
			  for (let i = 0; i < attributes.length; i++) {
			    if (!(i === attributes.length - 1 && attributes[i].toLowerCase() === "base64") && !validAttribute.test(attributes[i])) {
			      return false;
			    }
			  }
			  for (let _i = 0; _i < data.length; _i++) {
			    if (!validData.test(data[_i])) {
			      return false;
			    }
			  }
			  return true;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isDataURI, isDataURI.exports));
		return isDataURI.exports;
	}

	const isMagnetURI = {exports: {}};

	let hasRequiredIsMagnetURI;

	function requireIsMagnetURI() {
		if (hasRequiredIsMagnetURI) return isMagnetURI.exports;
		hasRequiredIsMagnetURI = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMagnetURI;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const magnetURIComponent = /(?:^magnet:\?|[^?&]&)xt(?:\.1)?=urn:(?:(?:aich|bitprint|btih|ed2k|ed2khash|kzhash|md5|sha1|tree:tiger):[a-z0-9]{32}(?:[a-z0-9]{8})?|btmh:1220[a-z0-9]{64})(?:$|&)/i;
			function isMagnetURI(url) {
			  (0, _assertString.default)(url);
			  if (url.indexOf("magnet:?") !== 0) {
			    return false;
			  }
			  return magnetURIComponent.test(url);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMagnetURI, isMagnetURI.exports));
		return isMagnetURI.exports;
	}

	const isMailtoURI = {exports: {}};

	const trim = {exports: {}};

	const rtrim = {exports: {}};

	let hasRequiredRtrim;

	function requireRtrim() {
		if (hasRequiredRtrim) return rtrim.exports;
		hasRequiredRtrim = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = rtrim;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function rtrim(str, chars) {
			  (0, _assertString.default)(str);
			  if (chars) {
			    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
			    const pattern = new RegExp("[".concat(chars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "]+$"), "g");
			    return str.replace(pattern, "");
			  }
			  // Use a faster and more safe than regex trim method https://blog.stevenlevithan.com/archives/faster-trim-javascript
			  let strIndex = str.length - 1;
			  while (/\s/.test(str.charAt(strIndex))) {
			    strIndex -= 1;
			  }
			  return str.slice(0, strIndex + 1);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(rtrim, rtrim.exports));
		return rtrim.exports;
	}

	const ltrim = {exports: {}};

	let hasRequiredLtrim;

	function requireLtrim() {
		if (hasRequiredLtrim) return ltrim.exports;
		hasRequiredLtrim = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = ltrim;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function ltrim(str, chars) {
			  (0, _assertString.default)(str);
			  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Escaping
			  const pattern = chars ? new RegExp("^[".concat(chars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "]+"), "g") : /^\s+/g;
			  return str.replace(pattern, "");
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(ltrim, ltrim.exports));
		return ltrim.exports;
	}

	let hasRequiredTrim;

	function requireTrim() {
		if (hasRequiredTrim) return trim.exports;
		hasRequiredTrim = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = trim;
			const _rtrim = _interopRequireDefault(/* @__PURE__*/ requireRtrim());
			const _ltrim = _interopRequireDefault(/* @__PURE__*/ requireLtrim());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function trim(str, chars) {
			  return (0, _rtrim.default)((0, _ltrim.default)(str, chars), chars);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(trim, trim.exports));
		return trim.exports;
	}

	let hasRequiredIsMailtoURI;

	function requireIsMailtoURI() {
		if (hasRequiredIsMailtoURI) return isMailtoURI.exports;
		hasRequiredIsMailtoURI = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMailtoURI;
			const _trim = _interopRequireDefault(/* @__PURE__*/ requireTrim());
			const _isEmail = _interopRequireDefault(/* @__PURE__*/ requireIsEmail());
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function _slicedToArray(r, e) {
				return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest();
			}
			function _nonIterableRest() {
				throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
			}
			function _iterableToArrayLimit(r, l) {
				let t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) {
					let e; let n; let i; let u; const a = []; let f = true; let o = false; try {
						if (i = (t = t.call(r)).next, 0 === l) ; else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0);
					} catch (r) {
						o = true, n = r;
					} finally {
						try {
							if (!f && null != t.return && (u = t.return(), Object(u) !== u)) return;
						} finally {
							if (o) throw n;
						}
					} return a;
				}
			}
			function _arrayWithHoles(r) {
				if (Array.isArray(r)) return r;
			}
			function _createForOfIteratorHelper(r, e) {
				let t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) {
					if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
						t && (r = t); let _n = 0; const F = function F() {}; return {s: F, n: function n() {
							return _n >= r.length ? {done: true} : {done: false, value: r[_n++]};
						}, e: function e(r) {
							throw r;
						}, f: F};
					} throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
				} let o; let a = true; let u = false; return {s: function s() {
					t = t.call(r);
				}, n: function n() {
					const r = t.next(); return a = r.done, r;
				}, e: function e(r) {
					u = true, o = r;
				}, f: function f() {
					try {
						a || null == t.return || t.return();
					} finally {
						if (u) throw o;
					}
				}};
			}
			function _unsupportedIterableToArray(r, a) {
				if (r) {
					if ("string" == typeof r) return _arrayLikeToArray(r, a); let t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
				}
			}
			function _arrayLikeToArray(r, a) {
				(null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n;
			}
			function parseMailtoQueryString(queryString) {
			  const allowedParams = new Set(["subject", "body", "cc", "bcc"]);
			    const query = {
			      cc: "",
			      bcc: ""
			    };
			  let isParseFailed = false;
			  const queryParams = queryString.split("&");
			  if (queryParams.length > 4) {
			    return false;
			  }
			  const _iterator = _createForOfIteratorHelper(queryParams);
			    let _step;
			  try {
			    for (_iterator.s(); !(_step = _iterator.n()).done;) {
			      const q = _step.value;
			      const _q$split = q.split("=");
			        const _q$split2 = _slicedToArray(_q$split, 2);
			        const key = _q$split2[0];
			        const value = _q$split2[1];

			      // checked for invalid and duplicated query params
			      if (key && !allowedParams.has(key)) {
			        isParseFailed = true;
			        break;
			      }
			      if (value && (key === "cc" || key === "bcc")) {
			        query[key] = value;
			      }
			      if (key) {
			        allowedParams.delete(key);
			      }
			    }
			  } catch (err) {
			    _iterator.e(err);
			  } finally {
			    _iterator.f();
			  }
			  return isParseFailed ? false : query;
			}
			function isMailtoURI(url, options) {
			  (0, _assertString.default)(url);
			  if (url.indexOf("mailto:") !== 0) {
			    return false;
			  }
			  const _url$replace$split = url.replace("mailto:", "").split("?");
			    const _url$replace$split2 = _slicedToArray(_url$replace$split, 2);
			    const to = _url$replace$split2[0];
			    const _url$replace$split2$ = _url$replace$split2[1];
			    const queryString = _url$replace$split2$ === void 0 ? "" : _url$replace$split2$;
			  if (!to && !queryString) {
			    return true;
			  }
			  const query = parseMailtoQueryString(queryString);
			  if (!query) {
			    return false;
			  }
			  return "".concat(to, ",").concat(query.cc, ",").concat(query.bcc).split(",").every(function(email) {
			    email = (0, _trim.default)(email, " ");
			    if (email) {
			      return (0, _isEmail.default)(email, options);
			    }
			    return true;
			  });
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMailtoURI, isMailtoURI.exports));
		return isMailtoURI.exports;
	}

	const isMimeType = {exports: {}};

	let hasRequiredIsMimeType;

	function requireIsMimeType() {
		if (hasRequiredIsMimeType) return isMimeType.exports;
		hasRequiredIsMimeType = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isMimeType;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			/*
			  Checks if the provided string matches to a correct Media type format (MIME type)

			  This function only checks is the string format follows the
			  established rules by the according RFC specifications.
			  This function supports 'charset' in textual media types
			  (https://tools.ietf.org/html/rfc6657).

			  This function does not check against all the media types listed
			  by the IANA (https://www.iana.org/assignments/media-types/media-types.xhtml)
			  because of lightness purposes : it would require to include
			  all these MIME types in this library, which would weigh it
			  significantly. This kind of effort maybe is not worth for the use that
			  this function has in this entire library.

			  More information in the RFC specifications :
			  - https://tools.ietf.org/html/rfc2045
			  - https://tools.ietf.org/html/rfc2046
			  - https://tools.ietf.org/html/rfc7231#section-3.1.1.1
			  - https://tools.ietf.org/html/rfc7231#section-3.1.1.5
			*/

			// Match simple MIME types
			// NB :
			//   Subtype length must not exceed 100 characters.
			//   This rule does not comply to the RFC specs (what is the max length ?).
			const mimeTypeSimple = /^(application|audio|font|image|message|model|multipart|text|video)\/[a-zA-Z0-9\.\-\+_]{1,100}$/i;

			// Handle "charset" in "text/*"
			const mimeTypeText = /^text\/[a-zA-Z0-9\.\-\+]{1,100};\s?charset=("[a-zA-Z0-9\.\-\+\s]{0,70}"|[a-zA-Z0-9\.\-\+]{0,70})(\s?\([a-zA-Z0-9\.\-\+\s]{1,20}\))?$/i;

			// Handle "boundary" in "multipart/*"
			const mimeTypeMultipart = /^multipart\/[a-zA-Z0-9\.\-\+]{1,100}(;\s?(boundary|charset)=("[a-zA-Z0-9\.\-\+\s]{0,70}"|[a-zA-Z0-9\.\-\+]{0,70})(\s?\([a-zA-Z0-9\.\-\+\s]{1,20}\))?){0,2}$/i;

			function isMimeType(str) {
			  (0, _assertString.default)(str);
			  return mimeTypeSimple.test(str) || mimeTypeText.test(str) || mimeTypeMultipart.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isMimeType, isMimeType.exports));
		return isMimeType.exports;
	}

	const isLatLong = {exports: {}};

	let hasRequiredIsLatLong;

	function requireIsLatLong() {
		if (hasRequiredIsLatLong) return isLatLong.exports;
		hasRequiredIsLatLong = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLatLong;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			const _includesString = _interopRequireDefault(/* @__PURE__*/ requireIncludesString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const lat = /^\(?[+-]?(90(\.0+)?|[1-8]?\d(\.\d+)?)$/;
			const long = /^\s?[+-]?(180(\.0+)?|1[0-7]\d(\.\d+)?|\d{1,2}(\.\d+)?)\)?$/;
			const latDMS = /^(([1-8]?\d)\D+([1-5]?\d|60)\D+([1-5]?\d|60)(\.\d+)?|90\D+0\D+0)\D+[NSns]?$/i;
			const longDMS = /^\s*([1-7]?\d{1,2}\D+([1-5]?\d|60)\D+([1-5]?\d|60)(\.\d+)?|180\D+0\D+0)\D+[EWew]?$/i;
			const defaultLatLongOptions = {
			  checkDMS: false
			};
			function isLatLong(str, options) {
			  (0, _assertString.default)(str);
			  options = (0, _merge.default)(options, defaultLatLongOptions);
			  if (!(0, _includesString.default)(str, ",")) return false;
			  const pair = str.split(",");
			  if (pair[0].startsWith("(") && !pair[1].endsWith(")") || pair[1].endsWith(")") && !pair[0].startsWith("(")) return false;
			  if (options.checkDMS) {
			    return latDMS.test(pair[0]) && longDMS.test(pair[1]);
			  }
			  return lat.test(pair[0]) && long.test(pair[1]);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLatLong, isLatLong.exports));
		return isLatLong.exports;
	}

	const isPostalCode = {};

	let hasRequiredIsPostalCode;

	function requireIsPostalCode() {
		if (hasRequiredIsPostalCode) return isPostalCode;
		hasRequiredIsPostalCode = 1;

		Object.defineProperty(isPostalCode, "__esModule", {
		  value: true
		});
		isPostalCode.default = isPostalCode$1;
		isPostalCode.locales = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		// common patterns
		const threeDigit = /^\d{3}$/;
		const fourDigit = /^\d{4}$/;
		const fiveDigit = /^\d{5}$/;
		const sixDigit = /^\d{6}$/;
		const patterns = {
		  AD: /^AD\d{3}$/,
		  AT: fourDigit,
		  AU: fourDigit,
		  AZ: /^AZ\d{4}$/,
		  BA: /^([7-8]\d{4}$)/,
		  BD: /^([1-8][0-9]{3}|9[0-4][0-9]{2})$/,
		  BE: fourDigit,
		  BG: fourDigit,
		  BR: /^\d{5}-?\d{3}$/,
		  BY: /^2[1-4]\d{4}$/,
		  CA: /^[ABCEGHJKLMNPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][\s\-]?\d[ABCEGHJ-NPRSTV-Z]\d$/i,
		  CH: fourDigit,
		  CN: /^(0[1-7]|1[012356]|2[0-7]|3[0-6]|4[0-7]|5[1-7]|6[1-7]|7[1-5]|8[1345]|9[09])\d{4}$/,
		  CO: /^(05|08|11|13|15|17|18|19|20|23|25|27|41|44|47|50|52|54|63|66|68|70|73|76|81|85|86|88|91|94|95|97|99)(\d{4})$/,
		  CZ: /^\d{3}\s?\d{2}$/,
		  DE: fiveDigit,
		  DK: fourDigit,
		  DO: fiveDigit,
		  DZ: fiveDigit,
		  EE: fiveDigit,
		  ES: /^(5[0-2]{1}|[0-4]{1}\d{1})\d{3}$/,
		  FI: fiveDigit,
		  FR: /^(?:(?:0[1-9]|[1-8]\d|9[0-5])\d{3}|97[1-46]\d{2})$/,
		  GB: /^(gir\s?0aa|[a-z]{1,2}\d[\da-z]?\s?(\d[a-z]{2})?)$/i,
		  GR: /^\d{3}\s?\d{2}$/,
		  HR: /^([1-5]\d{4}$)/,
		  HT: /^HT\d{4}$/,
		  HU: fourDigit,
		  ID: fiveDigit,
		  IE: /^(?!.*(?:o))[A-Za-z]\d[\dw]\s\w{4}$/i,
		  IL: /^(\d{5}|\d{7})$/,
		  IN: /^((?!10|29|35|54|55|65|66|86|87|88|89)[1-9][0-9]{5})$/,
		  IR: /^(?!(\d)\1{3})[13-9]{4}[1346-9][013-9]{5}$/,
		  IS: threeDigit,
		  IT: fiveDigit,
		  JP: /^\d{3}\-\d{4}$/,
		  KE: fiveDigit,
		  KR: /^(\d{5}|\d{6})$/,
		  LI: /^(948[5-9]|949[0-7])$/,
		  LT: /^LT\-\d{5}$/,
		  LU: fourDigit,
		  LV: /^LV\-\d{4}$/,
		  LK: fiveDigit,
		  MG: threeDigit,
		  MX: fiveDigit,
		  MT: /^[A-Za-z]{3}\s{0,1}\d{4}$/,
		  MY: fiveDigit,
		  NL: /^[1-9]\d{3}\s?(?!sa|sd|ss)[a-z]{2}$/i,
		  NO: fourDigit,
		  NP: /^(10|21|22|32|33|34|44|45|56|57)\d{3}$|^(977)$/i,
		  NZ: fourDigit,
		  // https://www.pakpost.gov.pk/postcodes.php
		  PK: fiveDigit,
		  PL: /^\d{2}\-\d{3}$/,
		  PR: /^00[679]\d{2}([ -]\d{4})?$/,
		  PT: /^\d{4}\-\d{3}?$/,
		  RO: sixDigit,
		  RU: sixDigit,
		  SA: fiveDigit,
		  SE: /^[1-9]\d{2}\s?\d{2}$/,
		  SG: sixDigit,
		  SI: fourDigit,
		  SK: /^\d{3}\s?\d{2}$/,
		  TH: fiveDigit,
		  TN: fourDigit,
		  TW: /^\d{3}(\d{2,3})?$/,
		  UA: fiveDigit,
		  US: /^\d{5}(-\d{4})?$/,
		  ZA: fourDigit,
		  ZM: fiveDigit
		};
		isPostalCode.locales = Object.keys(patterns);
		function isPostalCode$1(str, locale) {
		  (0, _assertString.default)(str);
		  if (locale in patterns) {
		    return patterns[locale].test(str);
		  } else if (locale === "any") {
		    for (const key in patterns) {
		      // https://github.com/gotwarlost/istanbul/blob/master/ignoring-code-for-coverage.md#ignoring-code-for-coverage-purposes
		      // istanbul ignore else
		      if (patterns.hasOwnProperty(key)) {
		        const pattern = patterns[key];
		        if (pattern.test(str)) {
		          return true;
		        }
		      }
		    }
		    return false;
		  }
		  throw new Error("Invalid locale '".concat(locale, "'"));
		}
		return isPostalCode;
	}

	const _escape = {exports: {}};

	let hasRequired_escape;

	function require_escape() {
		if (hasRequired_escape) return _escape.exports;
		hasRequired_escape = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = escape;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function escape(str) {
			  (0, _assertString.default)(str);
			  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\//g, "&#x2F;").replace(/\\/g, "&#x5C;").replace(/`/g, "&#96;");
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(_escape, _escape.exports));
		return _escape.exports;
	}

	const _unescape = {exports: {}};

	let hasRequired_unescape;

	function require_unescape() {
		if (hasRequired_unescape) return _unescape.exports;
		hasRequired_unescape = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = unescape;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function unescape(str) {
			  (0, _assertString.default)(str);
			  return str.replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x2F;/g, "/").replace(/&#x5C;/g, "\\").replace(/&#96;/g, "`").replace(/&amp;/g, "&");
			  // &amp; replacement has to be the last one to prevent
			  // bugs with intermediate strings containing escape sequences
			  // See: https://github.com/validatorjs/validator.js/issues/1827
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(_unescape, _unescape.exports));
		return _unescape.exports;
	}

	const stripLow = {exports: {}};

	const blacklist = {exports: {}};

	let hasRequiredBlacklist;

	function requireBlacklist() {
		if (hasRequiredBlacklist) return blacklist.exports;
		hasRequiredBlacklist = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = blacklist;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function blacklist(str, chars) {
			  (0, _assertString.default)(str);
			  return str.replace(new RegExp("[".concat(chars, "]+"), "g"), "");
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(blacklist, blacklist.exports));
		return blacklist.exports;
	}

	let hasRequiredStripLow;

	function requireStripLow() {
		if (hasRequiredStripLow) return stripLow.exports;
		hasRequiredStripLow = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = stripLow;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			const _blacklist = _interopRequireDefault(/* @__PURE__*/ requireBlacklist());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function stripLow(str, keep_new_lines) {
			  (0, _assertString.default)(str);
			  const chars = keep_new_lines ? "\\x00-\\x09\\x0B\\x0C\\x0E-\\x1F\\x7F" : "\\x00-\\x1F\\x7F";
			  return (0, _blacklist.default)(str, chars);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(stripLow, stripLow.exports));
		return stripLow.exports;
	}

	const whitelist = {exports: {}};

	let hasRequiredWhitelist;

	function requireWhitelist() {
		if (hasRequiredWhitelist) return whitelist.exports;
		hasRequiredWhitelist = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = whitelist;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function whitelist(str, chars) {
			  (0, _assertString.default)(str);
			  return str.replace(new RegExp("[^".concat(chars, "]+"), "g"), "");
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(whitelist, whitelist.exports));
		return whitelist.exports;
	}

	const isWhitelisted = {exports: {}};

	let hasRequiredIsWhitelisted;

	function requireIsWhitelisted() {
		if (hasRequiredIsWhitelisted) return isWhitelisted.exports;
		hasRequiredIsWhitelisted = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isWhitelisted;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			function isWhitelisted(str, chars) {
			  (0, _assertString.default)(str);
			  for (let i = str.length - 1; i >= 0; i--) {
			    if (chars.indexOf(str[i]) === -1) {
			      return false;
			    }
			  }
			  return true;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isWhitelisted, isWhitelisted.exports));
		return isWhitelisted.exports;
	}

	const normalizeEmail = {exports: {}};

	let hasRequiredNormalizeEmail;

	function requireNormalizeEmail() {
		if (hasRequiredNormalizeEmail) return normalizeEmail.exports;
		hasRequiredNormalizeEmail = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = normalizeEmail;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const default_normalize_email_options = {
			  // The following options apply to all email addresses
			  // Lowercases the local part of the email address.
			  // Please note this may violate RFC 5321 as per http://stackoverflow.com/a/9808332/192024).
			  // The domain is always lowercased, as per RFC 1035
			  all_lowercase: true,
			  // The following conversions are specific to GMail
			  // Lowercases the local part of the GMail address (known to be case-insensitive)
			  gmail_lowercase: true,
			  // Removes dots from the local part of the email address, as that's ignored by GMail
			  gmail_remove_dots: true,
			  // Removes the subaddress (e.g. "+foo") from the email address
			  gmail_remove_subaddress: true,
			  // Conversts the googlemail.com domain to gmail.com
			  gmail_convert_googlemaildotcom: true,
			  // The following conversions are specific to Outlook.com / Windows Live / Hotmail
			  // Lowercases the local part of the Outlook.com address (known to be case-insensitive)
			  outlookdotcom_lowercase: true,
			  // Removes the subaddress (e.g. "+foo") from the email address
			  outlookdotcom_remove_subaddress: true,
			  // The following conversions are specific to Yahoo
			  // Lowercases the local part of the Yahoo address (known to be case-insensitive)
			  yahoo_lowercase: true,
			  // Removes the subaddress (e.g. "-foo") from the email address
			  yahoo_remove_subaddress: true,
			  // The following conversions are specific to Yandex
			  // Lowercases the local part of the Yandex address (known to be case-insensitive)
			  yandex_lowercase: true,
			  // all yandex domains are equal, this explicitly sets the domain to 'yandex.ru'
			  yandex_convert_yandexru: true,
			  // The following conversions are specific to iCloud
			  // Lowercases the local part of the iCloud address (known to be case-insensitive)
			  icloud_lowercase: true,
			  // Removes the subaddress (e.g. "+foo") from the email address
			  icloud_remove_subaddress: true
			};

			// List of domains used by iCloud
			const icloud_domains = ["icloud.com", "me.com"];

			// List of domains used by Outlook.com and its predecessors
			// This list is likely incomplete.
			// Partial reference:
			// https://blogs.office.com/2013/04/17/outlook-com-gets-two-step-verification-sign-in-by-alias-and-new-international-domains/
			const outlookdotcom_domains = ["hotmail.at", "hotmail.be", "hotmail.ca", "hotmail.cl", "hotmail.co.il", "hotmail.co.nz", "hotmail.co.th", "hotmail.co.uk", "hotmail.com", "hotmail.com.ar", "hotmail.com.au", "hotmail.com.br", "hotmail.com.gr", "hotmail.com.mx", "hotmail.com.pe", "hotmail.com.tr", "hotmail.com.vn", "hotmail.cz", "hotmail.de", "hotmail.dk", "hotmail.es", "hotmail.fr", "hotmail.hu", "hotmail.id", "hotmail.ie", "hotmail.in", "hotmail.it", "hotmail.jp", "hotmail.kr", "hotmail.lv", "hotmail.my", "hotmail.ph", "hotmail.pt", "hotmail.sa", "hotmail.sg", "hotmail.sk", "live.be", "live.co.uk", "live.com", "live.com.ar", "live.com.mx", "live.de", "live.es", "live.eu", "live.fr", "live.it", "live.nl", "msn.com", "outlook.at", "outlook.be", "outlook.cl", "outlook.co.il", "outlook.co.nz", "outlook.co.th", "outlook.com", "outlook.com.ar", "outlook.com.au", "outlook.com.br", "outlook.com.gr", "outlook.com.pe", "outlook.com.tr", "outlook.com.vn", "outlook.cz", "outlook.de", "outlook.dk", "outlook.es", "outlook.fr", "outlook.hu", "outlook.id", "outlook.ie", "outlook.in", "outlook.it", "outlook.jp", "outlook.kr", "outlook.lv", "outlook.my", "outlook.ph", "outlook.pt", "outlook.sa", "outlook.sg", "outlook.sk", "passport.com"];

			// List of domains used by Yahoo Mail
			// This list is likely incomplete
			const yahoo_domains = ["rocketmail.com", "yahoo.ca", "yahoo.co.uk", "yahoo.com", "yahoo.de", "yahoo.fr", "yahoo.in", "yahoo.it", "ymail.com"];

			// List of domains used by yandex.ru
			const yandex_domains = ["yandex.ru", "yandex.ua", "yandex.kz", "yandex.com", "yandex.by", "ya.ru"];

			// replace single dots, but not multiple consecutive dots
			function dotsReplacer(match) {
			  if (match.length > 1) {
			    return match;
			  }
			  return "";
			}
			function normalizeEmail(email, options) {
			  options = (0, _merge.default)(options, default_normalize_email_options);
			  const raw_parts = email.split("@");
			  const domain = raw_parts.pop();
			  const user = raw_parts.join("@");
			  const parts = [user, domain];

			  // The domain is always lowercased, as it's case-insensitive per RFC 1035
			  parts[1] = parts[1].toLowerCase();
			  if (parts[1] === "gmail.com" || parts[1] === "googlemail.com") {
			    // Address is GMail
			    if (options.gmail_remove_subaddress) {
			      parts[0] = parts[0].split("+")[0];
			    }
			    if (options.gmail_remove_dots) {
			      // this does not replace consecutive dots like example..email@gmail.com
			      parts[0] = parts[0].replace(/\.+/g, dotsReplacer);
			    }
			    if (!parts[0].length) {
			      return false;
			    }
			    if (options.all_lowercase || options.gmail_lowercase) {
			      parts[0] = parts[0].toLowerCase();
			    }
			    parts[1] = options.gmail_convert_googlemaildotcom ? "gmail.com" : parts[1];
			  } else if (icloud_domains.indexOf(parts[1]) >= 0) {
			    // Address is iCloud
			    if (options.icloud_remove_subaddress) {
			      parts[0] = parts[0].split("+")[0];
			    }
			    if (!parts[0].length) {
			      return false;
			    }
			    if (options.all_lowercase || options.icloud_lowercase) {
			      parts[0] = parts[0].toLowerCase();
			    }
			  } else if (outlookdotcom_domains.indexOf(parts[1]) >= 0) {
			    // Address is Outlook.com
			    if (options.outlookdotcom_remove_subaddress) {
			      parts[0] = parts[0].split("+")[0];
			    }
			    if (!parts[0].length) {
			      return false;
			    }
			    if (options.all_lowercase || options.outlookdotcom_lowercase) {
			      parts[0] = parts[0].toLowerCase();
			    }
			  } else if (yahoo_domains.indexOf(parts[1]) >= 0) {
			    // Address is Yahoo
			    if (options.yahoo_remove_subaddress) {
			      const components = parts[0].split("-");
			      parts[0] = components.length > 1 ? components.slice(0, -1).join("-") : components[0];
			    }
			    if (!parts[0].length) {
			      return false;
			    }
			    if (options.all_lowercase || options.yahoo_lowercase) {
			      parts[0] = parts[0].toLowerCase();
			    }
			  } else if (yandex_domains.indexOf(parts[1]) >= 0) {
			    if (options.all_lowercase || options.yandex_lowercase) {
			      parts[0] = parts[0].toLowerCase();
			    }
			    parts[1] = options.yandex_convert_yandexru ? "yandex.ru" : parts[1];
			  } else if (options.all_lowercase) {
			    // Any other address
			    parts[0] = parts[0].toLowerCase();
			  }
			  return parts.join("@");
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(normalizeEmail, normalizeEmail.exports));
		return normalizeEmail.exports;
	}

	const isSlug = {exports: {}};

	let hasRequiredIsSlug;

	function requireIsSlug() {
		if (hasRequiredIsSlug) return isSlug.exports;
		hasRequiredIsSlug = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isSlug;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const charsetRegex = /^[^\s-_](?!.*?[-_]{2,})[a-z0-9-\\][^\s]*[^-_\s]$/;
			function isSlug(str) {
			  (0, _assertString.default)(str);
			  return charsetRegex.test(str);
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isSlug, isSlug.exports));
		return isSlug.exports;
	}

	const isLicensePlate = {exports: {}};

	let hasRequiredIsLicensePlate;

	function requireIsLicensePlate() {
		if (hasRequiredIsLicensePlate) return isLicensePlate.exports;
		hasRequiredIsLicensePlate = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isLicensePlate;
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const validators = {
			  "cs-CZ": function csCZ(str) {
			    return /^(([ABCDEFHIJKLMNPRSTUVXYZ]|[0-9])-?){5,8}$/.test(str);
			  },
			  "de-DE": function deDE(str) {
			    return /^((A|AA|AB|AC|AE|AH|AK|AM|AN|AÖ|AP|AS|AT|AU|AW|AZ|B|BA|BB|BC|BE|BF|BH|BI|BK|BL|BM|BN|BO|BÖ|BS|BT|BZ|C|CA|CB|CE|CO|CR|CW|D|DA|DD|DE|DH|DI|DL|DM|DN|DO|DU|DW|DZ|E|EA|EB|ED|EE|EF|EG|EH|EI|EL|EM|EN|ER|ES|EU|EW|F|FB|FD|FF|FG|FI|FL|FN|FO|FR|FS|FT|FÜ|FW|FZ|G|GA|GC|GD|GE|GF|GG|GI|GK|GL|GM|GN|GÖ|GP|GR|GS|GT|GÜ|GV|GW|GZ|H|HA|HB|HC|HD|HE|HF|HG|HH|HI|HK|HL|HM|HN|HO|HP|HR|HS|HU|HV|HX|HY|HZ|IK|IL|IN|IZ|J|JE|JL|K|KA|KB|KC|KE|KF|KG|KH|KI|KK|KL|KM|KN|KO|KR|KS|KT|KU|KW|KY|L|LA|LB|LC|LD|LF|LG|LH|LI|LL|LM|LN|LÖ|LP|LR|LU|M|MA|MB|MC|MD|ME|MG|MH|MI|MK|ML|MM|MN|MO|MQ|MR|MS|MÜ|MW|MY|MZ|N|NB|ND|NE|NF|NH|NI|NK|NM|NÖ|NP|NR|NT|NU|NW|NY|NZ|OA|OB|OC|OD|OE|OF|OG|OH|OK|OL|OP|OS|OZ|P|PA|PB|PE|PF|PI|PL|PM|PN|PR|PS|PW|PZ|R|RA|RC|RD|RE|RG|RH|RI|RL|RM|RN|RO|RP|RS|RT|RU|RV|RW|RZ|S|SB|SC|SE|SG|SI|SK|SL|SM|SN|SO|SP|SR|ST|SU|SW|SY|SZ|TE|TF|TG|TO|TP|TR|TS|TT|TÜ|ÜB|UE|UH|UL|UM|UN|V|VB|VG|VK|VR|VS|W|WA|WB|WE|WF|WI|WK|WL|WM|WN|WO|WR|WS|WT|WÜ|WW|WZ|Z|ZE|ZI|ZP|ZR|ZW|ZZ)[- ]?[A-Z]{1,2}[- ]?\d{1,4}|(ABG|ABI|AIB|AIC|ALF|ALZ|ANA|ANG|ANK|APD|ARN|ART|ASL|ASZ|AUR|AZE|BAD|BAR|BBG|BCH|BED|BER|BGD|BGL|BID|BIN|BIR|BIT|BIW|BKS|BLB|BLK|BNA|BOG|BOH|BOR|BOT|BRA|BRB|BRG|BRK|BRL|BRV|BSB|BSK|BTF|BÜD|BUL|BÜR|BÜS|BÜZ|CAS|CHA|CLP|CLZ|COC|COE|CUX|DAH|DAN|DAU|DBR|DEG|DEL|DGF|DIL|DIN|DIZ|DKB|DLG|DON|DUD|DÜW|EBE|EBN|EBS|ECK|EIC|EIL|EIN|EIS|EMD|EMS|ERB|ERH|ERK|ERZ|ESB|ESW|FDB|FDS|FEU|FFB|FKB|FLÖ|FOR|FRG|FRI|FRW|FTL|FÜS|GAN|GAP|GDB|GEL|GEO|GER|GHA|GHC|GLA|GMN|GNT|GOA|GOH|GRA|GRH|GRI|GRM|GRZ|GTH|GUB|GUN|GVM|HAB|HAL|HAM|HAS|HBN|HBS|HCH|HDH|HDL|HEB|HEF|HEI|HER|HET|HGN|HGW|HHM|HIG|HIP|HMÜ|HOG|HOH|HOL|HOM|HOR|HÖS|HOT|HRO|HSK|HST|HVL|HWI|IGB|ILL|JÜL|KEH|KEL|KEM|KIB|KLE|KLZ|KÖN|KÖT|KÖZ|KRU|KÜN|KUS|KYF|LAN|LAU|LBS|LBZ|LDK|LDS|LEO|LER|LEV|LIB|LIF|LIP|LÖB|LOS|LRO|LSZ|LÜN|LUP|LWL|MAB|MAI|MAK|MAL|MED|MEG|MEI|MEK|MEL|MER|MET|MGH|MGN|MHL|MIL|MKK|MOD|MOL|MON|MOS|MSE|MSH|MSP|MST|MTK|MTL|MÜB|MÜR|MYK|MZG|NAB|NAI|NAU|NDH|NEA|NEB|NEC|NEN|NES|NEW|NMB|NMS|NOH|NOL|NOM|NOR|NVP|NWM|OAL|OBB|OBG|OCH|OHA|ÖHR|OHV|OHZ|OPR|OSL|OVI|OVL|OVP|PAF|PAN|PAR|PCH|PEG|PIR|PLÖ|PRÜ|QFT|QLB|RDG|REG|REH|REI|RID|RIE|ROD|ROF|ROK|ROL|ROS|ROT|ROW|RSL|RÜD|RÜG|SAB|SAD|SAN|SAW|SBG|SBK|SCZ|SDH|SDL|SDT|SEB|SEE|SEF|SEL|SFB|SFT|SGH|SHA|SHG|SHK|SHL|SIG|SIM|SLE|SLF|SLK|SLN|SLS|SLÜ|SLZ|SMÜ|SOB|SOG|SOK|SÖM|SON|SPB|SPN|SRB|SRO|STA|STB|STD|STE|STL|SUL|SÜW|SWA|SZB|TBB|TDO|TET|TIR|TÖL|TUT|UEM|UER|UFF|USI|VAI|VEC|VER|VIB|VIE|VIT|VOH|WAF|WAK|WAN|WAR|WAT|WBS|WDA|WEL|WEN|WER|WES|WHV|WIL|WIS|WIT|WIZ|WLG|WMS|WND|WOB|WOH|WOL|WOR|WOS|WRN|WSF|WST|WSW|WTL|WTM|WUG|WÜM|WUN|WUR|WZL|ZEL|ZIG)[- ]?(([A-Z][- ]?\d{1,4})|([A-Z]{2}[- ]?\d{1,3})))[- ]?(E|H)?$/.test(str);
			  },
			  "de-LI": function deLI(str) {
			    return /^FL[- ]?\d{1,5}[UZ]?$/.test(str);
			  },
			  "en-IN": function enIN(str) {
			    return /^[A-Z]{2}[ -]?[0-9]{1,2}(?:[ -]?[A-Z])(?:[ -]?[A-Z]*)?[ -]?[0-9]{4}$/.test(str);
			  },
			  "en-SG": function enSG(str) {
			    return /^[A-Z]{3}[ -]?[\d]{4}[ -]?[A-Z]{1}$/.test(str);
			  },
			  "es-AR": function esAR(str) {
			    return /^(([A-Z]{2} ?[0-9]{3} ?[A-Z]{2})|([A-Z]{3} ?[0-9]{3}))$/.test(str);
			  },
			  "fi-FI": function fiFI(str) {
			    return /^(?=.{4,7})(([A-Z]{1,3}|[0-9]{1,3})[\s-]?([A-Z]{1,3}|[0-9]{1,5}))$/.test(str);
			  },
			  "hu-HU": function huHU(str) {
			    return /^((((?!AAA)(([A-NPRSTVZWXY]{1})([A-PR-Z]{1})([A-HJ-NPR-Z]))|(A[ABC]I)|A[ABC]O|A[A-W]Q|BPI|BPO|UCO|UDO|XAO)-(?!000)\d{3})|(M\d{6})|((CK|DT|CD|HC|H[ABEFIKLMNPRSTVX]|MA|OT|R[A-Z]) \d{2}-\d{2})|(CD \d{3}-\d{3})|(C-(C|X) \d{4})|(X-(A|B|C) \d{4})|(([EPVZ]-\d{5}))|(S A[A-Z]{2} \d{2})|(SP \d{2}-\d{2}))$/.test(str);
			  },
			  "pt-BR": function ptBR(str) {
			    return /^[A-Z]{3}[ -]?[0-9][A-Z][0-9]{2}|[A-Z]{3}[ -]?[0-9]{4}$/.test(str);
			  },
			  "pt-PT": function ptPT(str) {
			    return /^(([A-Z]{2}[ -·]?[0-9]{2}[ -·]?[0-9]{2})|([0-9]{2}[ -·]?[A-Z]{2}[ -·]?[0-9]{2})|([0-9]{2}[ -·]?[0-9]{2}[ -·]?[A-Z]{2})|([A-Z]{2}[ -·]?[0-9]{2}[ -·]?[A-Z]{2}))$/.test(str);
			  },
			  "sq-AL": function sqAL(str) {
			    return /^[A-Z]{2}[- ]?((\d{3}[- ]?(([A-Z]{2})|T))|(R[- ]?\d{3}))$/.test(str);
			  },
			  "sv-SE": function svSE(str) {
			    return /^[A-HJ-PR-UW-Z]{3} ?[\d]{2}[A-HJ-PR-UW-Z1-9]$|(^[A-ZÅÄÖ ]{2,7}$)/.test(str.trim());
			  },
			  "en-PK": function enPK(str) {
			    return /(^[A-Z]{2}((\s|-){0,1})[0-9]{3,4}((\s|-)[0-9]{2}){0,1}$)|(^[A-Z]{3}((\s|-){0,1})[0-9]{3,4}((\s|-)[0-9]{2}){0,1}$)|(^[A-Z]{4}((\s|-){0,1})[0-9]{3,4}((\s|-)[0-9]{2}){0,1}$)|(^[A-Z]((\s|-){0,1})[0-9]{4}((\s|-)[0-9]{2}){0,1}$)/.test(str.trim());
			  }
			};
			function isLicensePlate(str, locale) {
			  (0, _assertString.default)(str);
			  if (locale in validators) {
			    return validators[locale](str);
			  } else if (locale === "any") {
			    for (const key in validators) {
			      /* eslint guard-for-in: 0 */
			      const validator = validators[key];
			      if (validator(str)) {
			        return true;
			      }
			    }
			    return false;
			  }
			  throw new Error("Invalid locale '".concat(locale, "'"));
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isLicensePlate, isLicensePlate.exports));
		return isLicensePlate.exports;
	}

	const isStrongPassword = {exports: {}};

	let hasRequiredIsStrongPassword;

	function requireIsStrongPassword() {
		if (hasRequiredIsStrongPassword) return isStrongPassword.exports;
		hasRequiredIsStrongPassword = 1;
		(function(module, exports$1) {
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = isStrongPassword;
			const _merge = _interopRequireDefault(/* @__PURE__*/ requireMerge());
			const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const upperCaseRegex = /^[A-Z]$/;
			const lowerCaseRegex = /^[a-z]$/;
			const numberRegex = /^[0-9]$/;
			const symbolRegex = /^[-#!$@£%^&*()_+|~=`{}\[\]:";'<>?,.\/\\ ]$/;
			const defaultOptions = {
			  minLength: 8,
			  minLowercase: 1,
			  minUppercase: 1,
			  minNumbers: 1,
			  minSymbols: 1,
			  returnScore: false,
			  pointsPerUnique: 1,
			  pointsPerRepeat: 0.5,
			  pointsForContainingLower: 10,
			  pointsForContainingUpper: 10,
			  pointsForContainingNumber: 10,
			  pointsForContainingSymbol: 10
			};

			/* Counts number of occurrences of each char in a string
			 * could be moved to util/ ?
			*/
			function countChars(str) {
			  const result = {};
			  Array.from(str).forEach(function(char) {
			    const curVal = result[char];
			    if (curVal) {
			      result[char] += 1;
			    } else {
			      result[char] = 1;
			    }
			  });
			  return result;
			}

			/* Return information about a password */
			function analyzePassword(password) {
			  const charMap = countChars(password);
			  const analysis = {
			    length: password.length,
			    uniqueChars: Object.keys(charMap).length,
			    uppercaseCount: 0,
			    lowercaseCount: 0,
			    numberCount: 0,
			    symbolCount: 0
			  };
			  Object.keys(charMap).forEach(function(char) {
			    /* istanbul ignore else */
			    if (upperCaseRegex.test(char)) {
			      analysis.uppercaseCount += charMap[char];
			    } else if (lowerCaseRegex.test(char)) {
			      analysis.lowercaseCount += charMap[char];
			    } else if (numberRegex.test(char)) {
			      analysis.numberCount += charMap[char];
			    } else if (symbolRegex.test(char)) {
			      analysis.symbolCount += charMap[char];
			    }
			  });
			  return analysis;
			}
			function scorePassword(analysis, scoringOptions) {
			  let points = 0;
			  points += analysis.uniqueChars * scoringOptions.pointsPerUnique;
			  points += (analysis.length - analysis.uniqueChars) * scoringOptions.pointsPerRepeat;
			  if (analysis.lowercaseCount > 0) {
			    points += scoringOptions.pointsForContainingLower;
			  }
			  if (analysis.uppercaseCount > 0) {
			    points += scoringOptions.pointsForContainingUpper;
			  }
			  if (analysis.numberCount > 0) {
			    points += scoringOptions.pointsForContainingNumber;
			  }
			  if (analysis.symbolCount > 0) {
			    points += scoringOptions.pointsForContainingSymbol;
			  }
			  return points;
			}
			function isStrongPassword(str) {
			  let options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
			  (0, _assertString.default)(str);
			  const analysis = analyzePassword(str);
			  options = (0, _merge.default)(options || {}, defaultOptions);
			  if (options.returnScore) {
			    return scorePassword(analysis, options);
			  }
			  return analysis.length >= options.minLength && analysis.lowercaseCount >= options.minLowercase && analysis.uppercaseCount >= options.minUppercase && analysis.numberCount >= options.minNumbers && analysis.symbolCount >= options.minSymbols;
			}
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(isStrongPassword, isStrongPassword.exports));
		return isStrongPassword.exports;
	}

	const isVAT = {};

	let hasRequiredIsVAT;

	function requireIsVAT() {
		if (hasRequiredIsVAT) return isVAT;
		hasRequiredIsVAT = 1;

		function _typeof(o) {
			"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
				return typeof o;
			} : function(o) {
				return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
			}, _typeof(o);
		}
		Object.defineProperty(isVAT, "__esModule", {
		  value: true
		});
		isVAT.default = isVAT$1;
		isVAT.vatMatchers = void 0;
		const _assertString = _interopRequireDefault(/* @__PURE__*/ requireAssertString());
		const algorithms = _interopRequireWildcard(/* @__PURE__*/ requireAlgorithms());
		function _interopRequireWildcard(e, t) {
			if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) {
				if (!t && e && e.__esModule) return e; let o; let i; const f = {__proto__: null, default: e}; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) {
					if (o.has(e)) return o.get(e); o.set(e, f);
				} for (const _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f;
			})(e, t);
		}
		function _interopRequireDefault(e) {
			return e && e.__esModule ? e : {default: e};
		}
		const AU = function AU(str) {
		  const match = str.match(/^(AU)?(\d{11})$/);
		  if (!match) {
		    return false;
		  }
		  // @see {@link https://abr.business.gov.au/Help/AbnFormat}
		  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
		  str = str.replace(/^AU/, "");
		  const ABN = (parseInt(str.slice(0, 1), 10) - 1).toString() + str.slice(1);
		  let total = 0;
		  for (let i = 0; i < 11; i++) {
		    total += weights[i] * ABN.charAt(i);
		  }
		  return total !== 0 && total % 89 === 0;
		};
		const CH = function CH(str) {
		  // @see {@link https://www.ech.ch/de/ech/ech-0097/5.2.0}
		  const hasValidCheckNumber = function hasValidCheckNumber(digits) {
		    const lastDigit = digits.pop(); // used as check number
		    const weights = [5, 4, 3, 2, 7, 6, 5, 4];
		    const calculatedCheckNumber = (11 - digits.reduce(function(acc, el, idx) {
		      return acc + el * weights[idx];
		    }, 0) % 11) % 11;
		    return lastDigit === calculatedCheckNumber;
		  };

		  // @see {@link https://www.estv.admin.ch/estv/de/home/mehrwertsteuer/uid/mwst-uid-nummer.html}
		  return /^(CHE[- ]?)?(\d{9}|(\d{3}\.\d{3}\.\d{3})|(\d{3} \d{3} \d{3})) ?(TVA|MWST|IVA)?$/.test(str) && hasValidCheckNumber(str.match(/\d/g).map(function(el) {
		    return +el;
		  }));
		};
		const PT = function PT(str) {
		  const match = str.match(/^(PT)?(\d{9})$/);
		  if (!match) {
		    return false;
		  }
		  const tin = match[2];
		  const checksum = 11 - algorithms.reverseMultiplyAndSum(tin.split("").slice(0, 8).map(function(a) {
		    return parseInt(a, 10);
		  }), 9) % 11;
		  if (checksum > 9) {
		    return parseInt(tin[8], 10) === 0;
		  }
		  return checksum === parseInt(tin[8], 10);
		};
		const vatMatchers = isVAT.vatMatchers = {
		  /**
		   * European Union VAT identification numbers
		   *
		   * @param str
		   */
		  AT: function AT(str) {
		    return /^(AT)?U\d{8}$/.test(str);
		  },
		  BE: function BE(str) {
		    return /^(BE)?\d{10}$/.test(str);
		  },
		  BG: function BG(str) {
		    return /^(BG)?\d{9,10}$/.test(str);
		  },
		  HR: function HR(str) {
		    return /^(HR)?\d{11}$/.test(str);
		  },
		  CY: function CY(str) {
		    return /^(CY)?\w{9}$/.test(str);
		  },
		  CZ: function CZ(str) {
		    return /^(CZ)?\d{8,10}$/.test(str);
		  },
		  DK: function DK(str) {
		    return /^(DK)?\d{8}$/.test(str);
		  },
		  EE: function EE(str) {
		    return /^(EE)?\d{9}$/.test(str);
		  },
		  FI: function FI(str) {
		    return /^(FI)?\d{8}$/.test(str);
		  },
		  FR: function FR(str) {
		    return /^(FR)([A-Z0-9]{2}\d{9})$/.test(str);
		  },
		  DE: function DE(str) {
		    return /^(DE)?\d{9}$/.test(str);
		  },
		  EL: function EL(str) {
		    return /^(EL)?\d{9}$/.test(str);
		  },
		  HU: function HU(str) {
		    return /^(HU)?\d{8}$/.test(str);
		  },
		  IE: function IE(str) {
		    return /^(IE)?\d{7}\w{1}(W)?$/.test(str);
		  },
		  IT: function IT(str) {
		    return /^(IT)?\d{11}$/.test(str);
		  },
		  LV: function LV(str) {
		    return /^(LV)?\d{11}$/.test(str);
		  },
		  LT: function LT(str) {
		    return /^(LT)?\d{9,12}$/.test(str);
		  },
		  LU: function LU(str) {
		    return /^(LU)?\d{8}$/.test(str);
		  },
		  MT: function MT(str) {
		    return /^(MT)?\d{8}$/.test(str);
		  },
		  NL: function NL(str) {
		    return /^(NL)?\d{9}B\d{2}$/.test(str);
		  },
		  PL: function PL(str) {
		    return /^(PL)?(\d{10}|(\d{3}-\d{3}-\d{2}-\d{2})|(\d{3}-\d{2}-\d{2}-\d{3}))$/.test(str);
		  },
		  PT: PT,
		  RO: function RO(str) {
		    return /^(RO)?\d{2,10}$/.test(str);
		  },
		  SK: function SK(str) {
		    return /^(SK)?\d{10}$/.test(str);
		  },
		  SI: function SI(str) {
		    return /^(SI)?\d{8}$/.test(str);
		  },
		  ES: function ES(str) {
		    return /^(ES)?\w\d{7}[A-Z]$/.test(str);
		  },
		  SE: function SE(str) {
		    return /^(SE)?\d{12}$/.test(str);
		  },
		  /**
		   * VAT numbers of non-EU countries
		   *
		   * @param str
		   */
		  AL: function AL(str) {
		    return /^(AL)?\w{9}[A-Z]$/.test(str);
		  },
		  MK: function MK(str) {
		    return /^(MK)?\d{13}$/.test(str);
		  },
		  AU: AU,
		  BY: function BY(str) {
		    return /^(УНП )?\d{9}$/.test(str);
		  },
		  CA: function CA(str) {
		    return /^(CA)?\d{9}$/.test(str);
		  },
		  IS: function IS(str) {
		    return /^(IS)?\d{5,6}$/.test(str);
		  },
		  IN: function IN(str) {
		    return /^(IN)?\d{15}$/.test(str);
		  },
		  ID: function ID(str) {
		    return /^(ID)?(\d{15}|(\d{2}.\d{3}.\d{3}.\d{1}-\d{3}.\d{3}))$/.test(str);
		  },
		  IL: function IL(str) {
		    return /^(IL)?\d{9}$/.test(str);
		  },
		  KZ: function KZ(str) {
		    return /^(KZ)?\d{12}$/.test(str);
		  },
		  NZ: function NZ(str) {
		    return /^(NZ)?\d{9}$/.test(str);
		  },
		  NG: function NG(str) {
		    return /^(NG)?(\d{12}|(\d{8}-\d{4}))$/.test(str);
		  },
		  NO: function NO(str) {
		    return /^(NO)?\d{9}MVA$/.test(str);
		  },
		  PH: function PH(str) {
		    return /^(PH)?(\d{12}|\d{3} \d{3} \d{3} \d{3})$/.test(str);
		  },
		  RU: function RU(str) {
		    return /^(RU)?(\d{10}|\d{12})$/.test(str);
		  },
		  SM: function SM(str) {
		    return /^(SM)?\d{5}$/.test(str);
		  },
		  SA: function SA(str) {
		    return /^(SA)?\d{15}$/.test(str);
		  },
		  RS: function RS(str) {
		    return /^(RS)?\d{9}$/.test(str);
		  },
		  CH: CH,
		  TR: function TR(str) {
		    return /^(TR)?\d{10}$/.test(str);
		  },
		  UA: function UA(str) {
		    return /^(UA)?\d{12}$/.test(str);
		  },
		  GB: function GB(str) {
		    return /^GB((\d{3} \d{4} ([0-8][0-9]|9[0-6]))|(\d{9} \d{3})|(((GD[0-4])|(HA[5-9]))[0-9]{2}))$/.test(str);
		  },
		  UZ: function UZ(str) {
		    return /^(UZ)?\d{9}$/.test(str);
		  },
		  /**
		   * VAT numbers of Latin American countries
		   *
		   * @param str
		   */
		  AR: function AR(str) {
		    return /^(AR)?\d{11}$/.test(str);
		  },
		  BO: function BO(str) {
		    return /^(BO)?\d{7}$/.test(str);
		  },
		  BR: function BR(str) {
		    return /^(BR)?((\d{2}.\d{3}.\d{3}\/\d{4}-\d{2})|(\d{3}.\d{3}.\d{3}-\d{2}))$/.test(str);
		  },
		  CL: function CL(str) {
		    return /^(CL)?\d{8}-\d{1}$/.test(str);
		  },
		  CO: function CO(str) {
		    return /^(CO)?\d{10}$/.test(str);
		  },
		  CR: function CR(str) {
		    return /^(CR)?\d{9,12}$/.test(str);
		  },
		  EC: function EC(str) {
		    return /^(EC)?\d{13}$/.test(str);
		  },
		  SV: function SV(str) {
		    return /^(SV)?\d{4}-\d{6}-\d{3}-\d{1}$/.test(str);
		  },
		  GT: function GT(str) {
		    return /^(GT)?\d{7}-\d{1}$/.test(str);
		  },
		  HN: function HN(str) {
		    return /^(HN)?$/.test(str);
		  },
		  MX: function MX(str) {
		    return /^(MX)?\w{3,4}\d{6}\w{3}$/.test(str);
		  },
		  NI: function NI(str) {
		    return /^(NI)?\d{3}-\d{6}-\d{4}\w{1}$/.test(str);
		  },
		  PA: function PA(str) {
		    return /^(PA)?$/.test(str);
		  },
		  PY: function PY(str) {
		    return /^(PY)?\d{6,8}-\d{1}$/.test(str);
		  },
		  PE: function PE(str) {
		    return /^(PE)?\d{11}$/.test(str);
		  },
		  DO: function DO(str) {
		    return /^(DO)?(\d{11}|(\d{3}-\d{7}-\d{1})|[1,4,5]{1}\d{8}|([1,4,5]{1})-\d{2}-\d{5}-\d{1})$/.test(str);
		  },
		  UY: function UY(str) {
		    return /^(UY)?\d{12}$/.test(str);
		  },
		  VE: function VE(str) {
		    return /^(VE)?[J,G,V,E]{1}-(\d{9}|(\d{8}-\d{1}))$/.test(str);
		  }
		};
		function isVAT$1(str, countryCode) {
		  (0, _assertString.default)(str);
		  (0, _assertString.default)(countryCode);
		  if (countryCode in vatMatchers) {
		    return vatMatchers[countryCode](str);
		  }
		  throw new Error("Invalid country code: '".concat(countryCode, "'"));
		}
		return isVAT;
	}

	let hasRequiredValidator;

	function requireValidator() {
		if (hasRequiredValidator) return validator.exports;
		hasRequiredValidator = 1;
		(function(module, exports$1) {
			function _typeof(o) {
				"@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function(o) {
					return typeof o;
				} : function(o) {
					return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o;
				}, _typeof(o);
			}
			Object.defineProperty(exports$1, "__esModule", {
			  value: true
			});
			exports$1.default = void 0;
			const _toDate = _interopRequireDefault(/* @__PURE__*/ requireToDate());
			const _toFloat = _interopRequireDefault(/* @__PURE__*/ requireToFloat());
			const _toInt = _interopRequireDefault(/* @__PURE__*/ requireToInt());
			const _toBoolean = _interopRequireDefault(/* @__PURE__*/ requireToBoolean());
			const _equals = _interopRequireDefault(/* @__PURE__*/ requireEquals());
			const _contains = _interopRequireDefault(/* @__PURE__*/ requireContains());
			const _matches = _interopRequireDefault(/* @__PURE__*/ requireMatches());
			const _isEmail = _interopRequireDefault(/* @__PURE__*/ requireIsEmail());
			const _isURL = _interopRequireDefault(/* @__PURE__*/ requireIsURL());
			const _isMACAddress = _interopRequireDefault(/* @__PURE__*/ requireIsMACAddress());
			const _isIP = _interopRequireDefault(/* @__PURE__*/ requireIsIP());
			const _isIPRange = _interopRequireDefault(/* @__PURE__*/ requireIsIPRange());
			const _isFQDN = _interopRequireDefault(/* @__PURE__*/ requireIsFQDN());
			const _isDate = _interopRequireDefault(/* @__PURE__*/ requireIsDate());
			const _isTime = _interopRequireDefault(/* @__PURE__*/ requireIsTime());
			const _isBoolean = _interopRequireDefault(/* @__PURE__*/ requireIsBoolean());
			const _isLocale = _interopRequireDefault(/* @__PURE__*/ requireIsLocale());
			const _isAbaRouting = _interopRequireDefault(/* @__PURE__*/ requireIsAbaRouting());
			const _isAlpha = _interopRequireWildcard(/* @__PURE__*/ requireIsAlpha());
			const _isAlphanumeric = _interopRequireWildcard(/* @__PURE__*/ requireIsAlphanumeric());
			const _isNumeric = _interopRequireDefault(/* @__PURE__*/ requireIsNumeric());
			const _isPassportNumber = _interopRequireWildcard(/* @__PURE__*/ requireIsPassportNumber());
			const _isPort = _interopRequireDefault(/* @__PURE__*/ requireIsPort());
			const _isLowercase = _interopRequireDefault(/* @__PURE__*/ requireIsLowercase());
			const _isUppercase = _interopRequireDefault(/* @__PURE__*/ requireIsUppercase());
			const _isIMEI = _interopRequireDefault(/* @__PURE__*/ requireIsIMEI());
			const _isAscii = _interopRequireDefault(/* @__PURE__*/ requireIsAscii());
			const _isFullWidth = _interopRequireDefault(/* @__PURE__*/ requireIsFullWidth());
			const _isHalfWidth = _interopRequireDefault(/* @__PURE__*/ requireIsHalfWidth());
			const _isVariableWidth = _interopRequireDefault(/* @__PURE__*/ requireIsVariableWidth());
			const _isMultibyte = _interopRequireDefault(/* @__PURE__*/ requireIsMultibyte());
			const _isSemVer = _interopRequireDefault(/* @__PURE__*/ requireIsSemVer());
			const _isSurrogatePair = _interopRequireDefault(/* @__PURE__*/ requireIsSurrogatePair());
			const _isInt = _interopRequireDefault(/* @__PURE__*/ requireIsInt());
			const _isFloat = _interopRequireWildcard(/* @__PURE__*/ requireIsFloat());
			const _isDecimal = _interopRequireDefault(/* @__PURE__*/ requireIsDecimal());
			const _isHexadecimal = _interopRequireDefault(/* @__PURE__*/ requireIsHexadecimal());
			const _isOctal = _interopRequireDefault(/* @__PURE__*/ requireIsOctal());
			const _isDivisibleBy = _interopRequireDefault(/* @__PURE__*/ requireIsDivisibleBy());
			const _isHexColor = _interopRequireDefault(/* @__PURE__*/ requireIsHexColor());
			const _isRgbColor = _interopRequireDefault(/* @__PURE__*/ requireIsRgbColor());
			const _isHSL = _interopRequireDefault(/* @__PURE__*/ requireIsHSL());
			const _isISRC = _interopRequireDefault(/* @__PURE__*/ requireIsISRC());
			const _isIBAN = _interopRequireWildcard(/* @__PURE__*/ requireIsIBAN());
			const _isBIC = _interopRequireDefault(/* @__PURE__*/ requireIsBIC());
			const _isMD = _interopRequireDefault(/* @__PURE__*/ requireIsMD5());
			const _isHash = _interopRequireDefault(/* @__PURE__*/ requireIsHash());
			const _isJWT = _interopRequireDefault(/* @__PURE__*/ requireIsJWT());
			const _isJSON = _interopRequireDefault(/* @__PURE__*/ requireIsJSON());
			const _isEmpty = _interopRequireDefault(/* @__PURE__*/ requireIsEmpty());
			const _isLength = _interopRequireDefault(/* @__PURE__*/ requireIsLength());
			const _isByteLength = _interopRequireDefault(/* @__PURE__*/ requireIsByteLength());
			const _isULID = _interopRequireDefault(/* @__PURE__*/ requireIsULID());
			const _isUUID = _interopRequireDefault(/* @__PURE__*/ requireIsUUID());
			const _isMongoId = _interopRequireDefault(/* @__PURE__*/ requireIsMongoId());
			const _isAfter = _interopRequireDefault(/* @__PURE__*/ requireIsAfter());
			const _isBefore = _interopRequireDefault(/* @__PURE__*/ requireIsBefore());
			const _isIn = _interopRequireDefault(/* @__PURE__*/ requireIsIn());
			const _isLuhnNumber = _interopRequireDefault(/* @__PURE__*/ requireIsLuhnNumber());
			const _isCreditCard = _interopRequireDefault(/* @__PURE__*/ requireIsCreditCard());
			const _isIdentityCard = _interopRequireDefault(/* @__PURE__*/ requireIsIdentityCard());
			const _isEAN = _interopRequireDefault(/* @__PURE__*/ requireIsEAN());
			const _isISIN = _interopRequireDefault(/* @__PURE__*/ requireIsISIN());
			const _isISBN = _interopRequireDefault(/* @__PURE__*/ requireIsISBN());
			const _isISSN = _interopRequireDefault(/* @__PURE__*/ requireIsISSN());
			const _isTaxID = _interopRequireDefault(/* @__PURE__*/ requireIsTaxID());
			const _isMobilePhone = _interopRequireWildcard(/* @__PURE__*/ requireIsMobilePhone());
			const _isEthereumAddress = _interopRequireDefault(/* @__PURE__*/ requireIsEthereumAddress());
			const _isCurrency = _interopRequireDefault(/* @__PURE__*/ requireIsCurrency());
			const _isBtcAddress = _interopRequireDefault(/* @__PURE__*/ requireIsBtcAddress());
			const _isISO = /* @__PURE__*/ requireIsISO6346();
			const _isISO2 = _interopRequireDefault(/* @__PURE__*/ requireIsISO6391());
			const _isISO3 = _interopRequireDefault(/* @__PURE__*/ requireIsISO8601());
			const _isRFC = _interopRequireDefault(/* @__PURE__*/ requireIsRFC3339());
			const _isISO4 = _interopRequireDefault(/* @__PURE__*/ requireIsISO15924());
			const _isISO31661Alpha = _interopRequireDefault(/* @__PURE__*/ requireIsISO31661Alpha2());
			const _isISO31661Alpha2 = _interopRequireDefault(/* @__PURE__*/ requireIsISO31661Alpha3());
			const _isISO31661Numeric = _interopRequireDefault(/* @__PURE__*/ requireIsISO31661Numeric());
			const _isISO5 = _interopRequireDefault(/* @__PURE__*/ requireIsISO4217());
			const _isBase = _interopRequireDefault(/* @__PURE__*/ requireIsBase32());
			const _isBase2 = _interopRequireDefault(/* @__PURE__*/ requireIsBase58());
			const _isBase3 = _interopRequireDefault(/* @__PURE__*/ requireIsBase64());
			const _isDataURI = _interopRequireDefault(/* @__PURE__*/ requireIsDataURI());
			const _isMagnetURI = _interopRequireDefault(/* @__PURE__*/ requireIsMagnetURI());
			const _isMailtoURI = _interopRequireDefault(/* @__PURE__*/ requireIsMailtoURI());
			const _isMimeType = _interopRequireDefault(/* @__PURE__*/ requireIsMimeType());
			const _isLatLong = _interopRequireDefault(/* @__PURE__*/ requireIsLatLong());
			const _isPostalCode = _interopRequireWildcard(/* @__PURE__*/ requireIsPostalCode());
			const _ltrim = _interopRequireDefault(/* @__PURE__*/ requireLtrim());
			const _rtrim = _interopRequireDefault(/* @__PURE__*/ requireRtrim());
			const _trim = _interopRequireDefault(/* @__PURE__*/ requireTrim());
			const _escape = _interopRequireDefault(/* @__PURE__*/ require_escape());
			const _unescape = _interopRequireDefault(/* @__PURE__*/ require_unescape());
			const _stripLow = _interopRequireDefault(/* @__PURE__*/ requireStripLow());
			const _whitelist = _interopRequireDefault(/* @__PURE__*/ requireWhitelist());
			const _blacklist = _interopRequireDefault(/* @__PURE__*/ requireBlacklist());
			const _isWhitelisted = _interopRequireDefault(/* @__PURE__*/ requireIsWhitelisted());
			const _normalizeEmail = _interopRequireDefault(/* @__PURE__*/ requireNormalizeEmail());
			const _isSlug = _interopRequireDefault(/* @__PURE__*/ requireIsSlug());
			const _isLicensePlate = _interopRequireDefault(/* @__PURE__*/ requireIsLicensePlate());
			const _isStrongPassword = _interopRequireDefault(/* @__PURE__*/ requireIsStrongPassword());
			const _isVAT = _interopRequireDefault(/* @__PURE__*/ requireIsVAT());
			function _interopRequireWildcard(e, t) {
				if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) {
					if (!t && e && e.__esModule) return e; let o; let i; const f = {__proto__: null, default: e}; if (null === e || "object" != _typeof(e) && "function" != typeof e) return f; if (o = t ? n : r) {
						if (o.has(e)) return o.get(e); o.set(e, f);
					} for (const _t in e) "default" !== _t && {}.hasOwnProperty.call(e, _t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, _t)) && (i.get || i.set) ? o(f, _t, i) : f[_t] = e[_t]); return f;
				})(e, t);
			}
			function _interopRequireDefault(e) {
				return e && e.__esModule ? e : {default: e};
			}
			const version = "13.15.26";
			const validator = {
			  version: version,
			  toDate: _toDate.default,
			  toFloat: _toFloat.default,
			  toInt: _toInt.default,
			  toBoolean: _toBoolean.default,
			  equals: _equals.default,
			  contains: _contains.default,
			  matches: _matches.default,
			  isEmail: _isEmail.default,
			  isURL: _isURL.default,
			  isMACAddress: _isMACAddress.default,
			  isIP: _isIP.default,
			  isIPRange: _isIPRange.default,
			  isFQDN: _isFQDN.default,
			  isBoolean: _isBoolean.default,
			  isIBAN: _isIBAN.default,
			  isBIC: _isBIC.default,
			  isAbaRouting: _isAbaRouting.default,
			  isAlpha: _isAlpha.default,
			  isAlphaLocales: _isAlpha.locales,
			  isAlphanumeric: _isAlphanumeric.default,
			  isAlphanumericLocales: _isAlphanumeric.locales,
			  isNumeric: _isNumeric.default,
			  isPassportNumber: _isPassportNumber.default,
			  passportNumberLocales: _isPassportNumber.locales,
			  isPort: _isPort.default,
			  isLowercase: _isLowercase.default,
			  isUppercase: _isUppercase.default,
			  isAscii: _isAscii.default,
			  isFullWidth: _isFullWidth.default,
			  isHalfWidth: _isHalfWidth.default,
			  isVariableWidth: _isVariableWidth.default,
			  isMultibyte: _isMultibyte.default,
			  isSemVer: _isSemVer.default,
			  isSurrogatePair: _isSurrogatePair.default,
			  isInt: _isInt.default,
			  isIMEI: _isIMEI.default,
			  isFloat: _isFloat.default,
			  isFloatLocales: _isFloat.locales,
			  isDecimal: _isDecimal.default,
			  isHexadecimal: _isHexadecimal.default,
			  isOctal: _isOctal.default,
			  isDivisibleBy: _isDivisibleBy.default,
			  isHexColor: _isHexColor.default,
			  isRgbColor: _isRgbColor.default,
			  isHSL: _isHSL.default,
			  isISRC: _isISRC.default,
			  isMD5: _isMD.default,
			  isHash: _isHash.default,
			  isJWT: _isJWT.default,
			  isJSON: _isJSON.default,
			  isEmpty: _isEmpty.default,
			  isLength: _isLength.default,
			  isLocale: _isLocale.default,
			  isByteLength: _isByteLength.default,
			  isULID: _isULID.default,
			  isUUID: _isUUID.default,
			  isMongoId: _isMongoId.default,
			  isAfter: _isAfter.default,
			  isBefore: _isBefore.default,
			  isIn: _isIn.default,
			  isLuhnNumber: _isLuhnNumber.default,
			  isCreditCard: _isCreditCard.default,
			  isIdentityCard: _isIdentityCard.default,
			  isEAN: _isEAN.default,
			  isISIN: _isISIN.default,
			  isISBN: _isISBN.default,
			  isISSN: _isISSN.default,
			  isMobilePhone: _isMobilePhone.default,
			  isMobilePhoneLocales: _isMobilePhone.locales,
			  isPostalCode: _isPostalCode.default,
			  isPostalCodeLocales: _isPostalCode.locales,
			  isEthereumAddress: _isEthereumAddress.default,
			  isCurrency: _isCurrency.default,
			  isBtcAddress: _isBtcAddress.default,
			  isISO6346: _isISO.isISO6346,
			  isFreightContainerID: _isISO.isFreightContainerID,
			  isISO6391: _isISO2.default,
			  isISO8601: _isISO3.default,
			  isISO15924: _isISO4.default,
			  isRFC3339: _isRFC.default,
			  isISO31661Alpha2: _isISO31661Alpha.default,
			  isISO31661Alpha3: _isISO31661Alpha2.default,
			  isISO31661Numeric: _isISO31661Numeric.default,
			  isISO4217: _isISO5.default,
			  isBase32: _isBase.default,
			  isBase58: _isBase2.default,
			  isBase64: _isBase3.default,
			  isDataURI: _isDataURI.default,
			  isMagnetURI: _isMagnetURI.default,
			  isMailtoURI: _isMailtoURI.default,
			  isMimeType: _isMimeType.default,
			  isLatLong: _isLatLong.default,
			  ltrim: _ltrim.default,
			  rtrim: _rtrim.default,
			  trim: _trim.default,
			  escape: _escape.default,
			  unescape: _unescape.default,
			  stripLow: _stripLow.default,
			  whitelist: _whitelist.default,
			  blacklist: _blacklist.default,
			  isWhitelisted: _isWhitelisted.default,
			  normalizeEmail: _normalizeEmail.default,
			  toString: toString,
			  isSlug: _isSlug.default,
			  isStrongPassword: _isStrongPassword.default,
			  isTaxID: _isTaxID.default,
			  isDate: _isDate.default,
			  isTime: _isTime.default,
			  isLicensePlate: _isLicensePlate.default,
			  isVAT: _isVAT.default,
			  ibanLocales: _isIBAN.locales
			};
			exports$1.default = validator;
			module.exports = exports$1.default;
			module.exports.default = exports$1.default;
		}(validator, validator.exports));
		return validator.exports;
	}

	const validatorExports = requireValidator();
	const index = /* @__PURE__*/getDefaultExportFromCjs(validatorExports);

	return index;
}));
