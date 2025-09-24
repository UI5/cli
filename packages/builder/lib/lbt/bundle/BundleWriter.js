

const NL = "\n";
const ENDS_WITH_NEW_LINE = /(\r\n|\r|\n)[ \t]*$/;
const SPACES_OR_TABS_ONLY = /^[ \t]+$/;

/**
 * A filtering writer that can count written chars and provides some convenience
 * methods when writing Javascript files.
 *
 * Most methods have been extracted from JSMergeWriter.
 *
 * columnOffset and lineOffset are used for sourcemap merging as reference to where we are at a given point in time
 *
 * @author Frank Weigel
 * @since 1.27.0
 * @private
 */
class BundleWriter {
	constructor() {
		this.buf = "";
		this.lineOffset = 0;
		this.columnOffset = 0;
		this.segments = [];
		this.currentSegment = null;
		this.currentSourceIndex = 0;
		this.endsWithNewLine = true; // Initially we don't need a new line
	}

	write(...str) {
		let writeBuf = "";
		for ( let i = 0; i < str.length; i++ ) {
			writeBuf += str[i];
			if (str[i] != null && str[i].split) {
				const strSplit = str[i].split(NL);
				this.lineOffset += strSplit.length - 1;
				this.columnOffset += strSplit[strSplit.length - 1].length;
			}
		}
		if ( writeBuf.length >= 1 ) {
			this.buf += writeBuf;
			this.endsWithNewLine =
				ENDS_WITH_NEW_LINE.test(writeBuf) ||
				(this.endsWithNewLine && SPACES_OR_TABS_ONLY.test(writeBuf));
		}
	}

	writeln(...str) {
		for ( let i = 0; i < str.length; i++ ) {
			this.buf += str[i];
			if (str[i] != null && str[i].split) {
				const strSplit = str[i].split(NL);
				this.lineOffset += strSplit.length - 1;
			}
		}
		this.buf += NL;
		this.endsWithNewLine = true;
		this.lineOffset += 1;
		this.columnOffset = 0;
	}

	ensureNewLine() {
		if ( !this.endsWithNewLine ) {
			this.buf += NL;
			this.endsWithNewLine = true;
			this.lineOffset += 1;
			this.columnOffset = 0;
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

export default BundleWriter;
