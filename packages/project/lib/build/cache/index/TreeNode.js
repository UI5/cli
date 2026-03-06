import path from "node:path/posix";

/**
 * Represents a node in the directory-based Merkle tree
 */
export default class TreeNode {
	constructor(name, type, options = {}) {
		this.name = name; // resource name or directory name
		this.type = type; // 'resource' | 'directory'
		this.hash = options.hash || null; // Buffer

		// Resource node properties
		this.integrity = options.integrity; // Resource content hash
		this.lastModified = options.lastModified; // Last modified timestamp
		this.size = options.size; // File size in bytes
		this.inode = options.inode; // File system inode number

		// Directory node properties
		this.children = options.children || new Map(); // name -> TreeNode
	}

	/**
	 * Get full path from root to this node
	 *
	 * @param {string} parentPath
	 * @returns {string}
	 */
	getPath(parentPath = "") {
		return parentPath ? path.join(parentPath, this.name) : this.name;
	}

	/**
	 * Serialize to JSON
	 *
	 * @returns {object}
	 */
	toJSON() {
		const obj = {
			name: this.name,
			type: this.type,
			hash: this.hash ? this.hash.toString("hex") : null
		};

		if (this.type === "resource") {
			obj.integrity = this.integrity;
			obj.lastModified = this.lastModified;
			obj.size = this.size;
			obj.inode = this.inode;
		} else {
			obj.children = {};
			for (const [name, child] of this.children) {
				obj.children[name] = child.toJSON();
			}
		}

		return obj;
	}

	/**
	 * Deserialize from JSON
	 *
	 * @param {object} data
	 * @returns {TreeNode}
	 */
	static fromJSON(data) {
		const options = {
			hash: data.hash ? Buffer.from(data.hash, "hex") : null,
			integrity: data.integrity,
			lastModified: data.lastModified,
			size: data.size,
			inode: data.inode
		};

		if (data.type === "directory" && data.children) {
			options.children = new Map();
			for (const [name, childData] of Object.entries(data.children)) {
				options.children.set(name, TreeNode.fromJSON(childData));
			}
		}

		return new TreeNode(data.name, data.type, options);
	}

	/**
	 * Create a deep copy of this node
	 *
	 * @returns {TreeNode}
	 */
	clone() {
		const options = {
			hash: this.hash ? Buffer.from(this.hash) : null,
			integrity: this.integrity,
			lastModified: this.lastModified,
			size: this.size,
			inode: this.inode
		};

		if (this.type === "directory") {
			options.children = new Map();
			for (const [name, child] of this.children) {
				options.children.set(name, child.clone());
			}
		}

		return new TreeNode(this.name, this.type, options);
	}
}
