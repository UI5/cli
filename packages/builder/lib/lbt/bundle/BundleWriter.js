"use strict";


const NL = "\n";
const ENDS_WITH_NEW_LINE = /(^|\r\n|\r|\n)[ \t]*$/;

/**
 * A filtering writer that can count written chars and provides some convenience
 * methods when writing Javascript files.
 *
 * Most methods have been extracted from JSMergeWriter.
 *
 * @author Frank Weigel
 * @since 1.27.0
 * @private
 */
class BundleWriter {
	constructor() {
		this.buf = "";
		this.segments = [];
		this.currentSegment = null;
		this.currentSourceIndex = 0;
	}

	write(...str) {
		for ( let i = 0; i < str.length; i++ ) {
			this.buf += str[i];
		}
	}

	writeln(...str) {
		for ( let i = 0; i < str.length; i++ ) {
			this.buf += str[i];
		}
		this.buf += NL;
	}

	ensureNewLine() {
		// TODO this regexp might be quite expensive (use of $ anchor on long strings)
		if ( !ENDS_WITH_NEW_LINE.test(this.buf) ) {
			this.buf += NL;
		}
	}

	toString() {
		return this.buf;
	}

	get length() {
		return this.buf.length;
	}

	startSegment(module) {
		if ( this.currentSegment ) {
			throw new Error("trying to start a segment while another segment is still open");
		}
		this.currentSegment = {
			module: module,
			startIndex: this.length,
		};
		this.currentSourceIndex = this.segments.length;
	}

	endSegment() {
		if ( !this.currentSegment ) {
			throw new Error("trying to end a segment while no segment is open");
		}
		this.currentSegment.endIndex = this.length;
		this.segments.push(this.currentSegment);
		const targetSize = this.currentSegment.endIndex - this.currentSegment.startIndex;
		this.currentSegment = null;
		this.currentSourceIndex = -1;
		return targetSize;
	}
}

module.exports = BundleWriter;

