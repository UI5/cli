import test from "ava";
import {Readable} from "node:stream";
import stringReplacer from "../../../lib/processors/stringReplacer.js";

const getStringFromStream = (stream) => {
	return new Promise((resolve, reject) => {
		const buffers = [];
		stream.on("data", (data) => {
			buffers.push(data);
		});
		stream.on("error", (err) => {
			reject(err);
		});
		stream.on("end", () => {
			const buffer = Buffer.concat(buffers);
			resolve(buffer.toString());
		});
	});
};

test.serial("Replaces string pattern from resource stream", async (t) => {
	const input = `foo bar foo`;
	const expected = `foo foo foo`;

	let output;

	const resource = {
		getStream: () => {
			const stream = new Readable();
			stream.push(Buffer.from(input));
			stream.push(null);
			return stream;
		},
		setStream: (outputStream) => {
			output = getStringFromStream(outputStream);
		}
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: "bar",
			replacement: "foo"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");
	t.deepEqual(await output, expected, "Correct file content should be set");
});

test.serial("Correctly processes utf8 characters within separate chunks", async (t) => {
	const utf8string = "Κυ";
	const expected = utf8string;

	let output;

	const resource = {
		getStream: () => {
			const stream = new Readable();
			const utf8stringAsBuffer = Buffer.from(utf8string, "utf8");
			// Pushing each byte separately makes content unreadable
			// if stream encoding is not set to utf8
			// This might happen when reading large files with utf8 characters
			stream.push(Buffer.from([utf8stringAsBuffer[0]]));
			stream.push(Buffer.from([utf8stringAsBuffer[1]]));
			stream.push(Buffer.from([utf8stringAsBuffer[2]]));
			stream.push(Buffer.from([utf8stringAsBuffer[3]]));
			stream.push(null);
			return stream;
		},
		setStream: (outputStream) => {
			output = getStringFromStream(outputStream);
		}
	};

	const processedResources = await stringReplacer({
		resources: [resource],
		options: {
			pattern: "n/a",
			replacement: "n/a"
		}
	});

	t.deepEqual(processedResources, [resource], "Input resource is returned");
	t.deepEqual(await output, expected, "Correct file content should be set");
});
