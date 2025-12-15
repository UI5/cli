/* eslint-disable indent */
const file = "dist/api/module-@ui5_server.html";

import {parse as parseHTML} from "parse5";
import fs from "fs";

class HTMLUtils {
    ignoredTags = [
        "header"
    ];

    /**
     * Finds an HTML tag in the given html
     *
     * @param {object} html - HTML where the tag is
     * @param {string} name - The name of the tag
     * @param {object} attributes - Map of attributes the tag should have
     * @param {object} reasons - (INTERNAL) Keeps track of reasons why tag doesn't match
     */
    findHTMLTag(html, name, attributes = null, reasons = []) {
        if (this.ignoredTags.includes(html.nodeName)) {
            return {found: false, node: null, reason: "Tag is ignored"};
        }

        if (html.nodeName === name) {
            if (attributes != null && !this.matchAttributes(html, attributes)) {
                return {found: false, nodes: null, reason: "Attributes mismatch"};
            }
            return {found: true, node: html};
        }

        if (!Object.keys(html).includes("childNodes")) {
            return {found: false, node: null, reason: "Not found", reasons: reasons};
        }

        for (const child of html.childNodes) {
            const searchResult = this.findHTMLTag(child, name, attributes, reasons);
            if (searchResult.found) {
                return searchResult;
            }
            reasons.push(searchResult.reason);
        }

        return {found: false, node: null, reason: "Not found", reasons: reasons};
    }

    matchAttributes(tag, attributes) {
        if (tag["attrs"] == undefined) {
            return false;
        }

        for (const attribute of tag.attrs) {
            if (attributes[attribute.name] === attribute.value) {
                return true;
            }
        }

        return false;
    }

    isNodeOnlyWhitespace(node) {
        if (node.value.trim().length == 0) return true;
        return false;
    }
}

class MarkdownElement {
    /**
     * @type {string}
     */
    name;

    parse(html) {
    }
}

class MarkdownSection extends MarkdownElement {
    parse(sectionElements) {

    }
}


class MarkdownDocFile extends HTMLUtils {
     /**
     * @type {string}
     */
    title;

	/**
     *@type {[]}
     */
    markdownElements;

    #parseSections(articleElement) {
        const sections = [];
        let elements = [];
        for (const child of articleElement.childNodes) {
            if (child.nodeName === "#text" && this.isNodeOnlyWhitespace(child)) continue;
            if (child.nodeName === "h3" &&
                child.attrs[0].name === "class" &&
                child.attrs[0].value === "subsection-title") {
                if (elements.length !== 0) {
                    sections.push(new MarkdownSection().parse(elements));
                    elements = [];
                }
            } else {
                elements.push(child);
            }
        }
        return sections;
    }

    /**
     * Parses the given html file to markdown object
     *
     * @param {*} html - HTML to convert to markdown
     */
    parse(html) {
        // 1. Find title
        this.title = this.findHTMLTag(html, "h1", {
            "class": "page-title"
        });

        // 2. Parse content
        this.markdownElements = this.#parseSections(this.findHTMLTag(html, "article").node);

        return this;
    }
}

const parsed = parseHTML(fs.readFileSync(file, {encoding: "utf-8"}));

new MarkdownDocFile().parse(parsed);
