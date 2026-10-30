import {createServer} from "node:http";
import {once} from "node:events";
import {deflateRawSync, crc32} from "node:zlib";

export async function serve(t, handler) {
	const server = createServer(handler);
	server.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.teardown(async () => {
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
	});
	return `http://127.0.0.1:${server.address().port}/`;
}

// Build DEFLATE archives without a ZIP writer dependency. An override can understate declared output sizes.
export function archive(files) {
	const local = [];
	const central = [];
	let offset = 0;
	for (const {name, content = "", declaredSize, descriptor = false} of files) {
		const filename = Buffer.from(name);
		const data = Buffer.from(content);
		const compressed = deflateRawSync(data);
		const crc = crc32(data);
		const size = declaredSize ?? data.length;
		const flags = descriptor ? 8 : 0;
		const header = Buffer.alloc(30);
		header.writeUInt32LE(0x04034b50, 0);
		header.writeUInt16LE(20, 4);
		header.writeUInt16LE(flags, 6);
		header.writeUInt16LE(8, 8);
		if (!descriptor) {
			header.writeUInt32LE(crc, 14);
			header.writeUInt32LE(compressed.length, 18);
			header.writeUInt32LE(size, 22);
		}
		header.writeUInt16LE(filename.length, 26);
		const directory = Buffer.alloc(46);
		directory.writeUInt32LE(0x02014b50, 0);
		directory.writeUInt16LE(20, 4);
		directory.writeUInt16LE(20, 6);
		directory.writeUInt16LE(flags, 8);
		directory.writeUInt16LE(8, 10);
		directory.writeUInt32LE(crc, 16);
		directory.writeUInt32LE(compressed.length, 20);
		directory.writeUInt32LE(size, 24);
		directory.writeUInt16LE(filename.length, 28);
		directory.writeUInt32LE(offset, 42);
		const trailer = Buffer.alloc(descriptor ? 16 : 0);
		if (descriptor) {
			trailer.writeUInt32LE(0x08074b50, 0);
			trailer.writeUInt32LE(crc, 4);
			trailer.writeUInt32LE(compressed.length, 8);
			trailer.writeUInt32LE(size, 12);
		}
		local.push(header, filename, compressed, trailer);
		central.push(directory, filename);
		offset += header.length + filename.length + compressed.length + trailer.length;
	}
	const directory = Buffer.concat(central);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(files.length, 8);
	end.writeUInt16LE(files.length, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(offset, 16);
	return Buffer.concat([...local, directory, end]);
}
