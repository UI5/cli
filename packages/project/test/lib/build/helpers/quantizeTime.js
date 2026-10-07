import test from "ava";
import {quantizeTime, TIME_GRANULARITIES} from "../../../../lib/build/helpers/quantizeTime.js";

// A fixed local point in time: 25 September 2026, 14:07:03. Month, day and hour are all two digits
// here; a separate test covers zero-padding of single-digit values.
const fixedDate = new Date(2026, 8, 25, 14, 7, 3);

test("quantizes each granularity to its bucket string", (t) => {
	t.is(quantizeTime("year", fixedDate), "2026");
	t.is(quantizeTime("month", fixedDate), "2026-09");
	t.is(quantizeTime("day", fixedDate), "2026-09-25");
	t.is(quantizeTime("hour", fixedDate), "2026-09-25T14");
});

test("zero-pads single-digit month, day and hour", (t) => {
	// 3 February 2026, 05:00 local.
	const earlyDate = new Date(2026, 1, 3, 5, 0, 0);
	t.is(quantizeTime("month", earlyDate), "2026-02");
	t.is(quantizeTime("day", earlyDate), "2026-02-03");
	t.is(quantizeTime("hour", earlyDate), "2026-02-03T05");
});

test("coarser buckets are a prefix of finer buckets", (t) => {
	const year = quantizeTime("year", fixedDate);
	const month = quantizeTime("month", fixedDate);
	const day = quantizeTime("day", fixedDate);
	const hour = quantizeTime("hour", fixedDate);
	t.true(month.startsWith(year));
	t.true(day.startsWith(month));
	t.true(hour.startsWith(day));
});

test("two dates in the same bucket quantize equally, a rolled-over bucket differs", (t) => {
	const jan1 = new Date(2026, 0, 1, 0, 0, 0);
	const dec31 = new Date(2026, 11, 31, 23, 59, 59);
	const nextYear = new Date(2027, 0, 1, 0, 0, 0);
	t.is(quantizeTime("year", jan1), quantizeTime("year", dec31), "same year -> same bucket");
	t.not(quantizeTime("year", dec31), quantizeTime("year", nextYear), "year boundary -> different bucket");
});

test("throws when the date argument is missing", (t) => {
	// The date is mandatory so callers pass the build run's shared timestamp rather than silently
	// falling back to a fresh new Date().
	const err = t.throws(() => quantizeTime("year"));
	t.is(err.message, `Missing or invalid 'date' argument: expected a Date instance`);
});

test("throws when the date argument is not a Date", (t) => {
	const err = t.throws(() => quantizeTime("year", 2026));
	t.is(err.message, `Missing or invalid 'date' argument: expected a Date instance`);
});

test("throws for an unknown granularity", (t) => {
	const err = t.throws(() => quantizeTime("minute", fixedDate));
	t.is(err.message, `Invalid time granularity "minute". Expected one of: year, month, day, hour`);
});

test("TIME_GRANULARITIES lists the supported buckets", (t) => {
	t.deepEqual(TIME_GRANULARITIES, ["year", "month", "day", "hour"]);
});
