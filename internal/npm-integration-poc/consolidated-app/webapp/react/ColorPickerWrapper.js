/**
 * React Color Picker Wrapper for UI5 Integration
 * 
 * Plain JavaScript implementation (no JSX transpilation required).
 * Uses React.createElement for component creation.
 */
import React from "react";
import { createRoot } from "react-dom/client";
import { HexColorPicker } from "react-colorful";

const { useState, useEffect, createElement: h } = React;

/**
 * Color Picker React Component (Plain JS)
 */
function ColorPicker({ initialColor, onChange }) {
	const [color, setColor] = useState(initialColor || "#0854a0");

	useEffect(() => {
		if (onChange) {
			onChange(color);
		}
	}, [color, onChange]);

	return h("div", { style: { padding: "16px" } },
		h(HexColorPicker, { color, onChange: setColor }),
		h("div", { 
			style: { 
				marginTop: "12px", 
				display: "flex", 
				alignItems: "center", 
				gap: "8px" 
			} 
		},
			h("div", {
				style: {
					width: "32px",
					height: "32px",
					borderRadius: "4px",
					backgroundColor: color,
					border: "1px solid #ccc"
				}
			}),
			h("span", { 
				style: { fontFamily: "monospace", fontSize: "14px" } 
			}, color)
		)
	);
}

/**
 * Mount the color picker to a DOM element
 * 
 * @param {string|HTMLElement} container - DOM element or selector
 * @param {Object} options - Configuration options
 * @param {string} options.initialColor - Initial color value (hex)
 * @param {Function} options.onChange - Callback when color changes
 * @returns {Object} Controller with unmount method
 */
export function mountColorPicker(container, options = {}) {
	const element = typeof container === "string" 
		? document.querySelector(container) 
		: container;

	if (!element) {
		console.error("ColorPicker: Container not found", container);
		return null;
	}

	const root = createRoot(element);
	
	root.render(h(ColorPicker, {
		initialColor: options.initialColor,
		onChange: options.onChange
	}));

	return {
		unmount: () => root.unmount(),
		setColor: (color) => {
			root.render(h(ColorPicker, {
				initialColor: color,
				onChange: options.onChange
			}));
		}
	};
}

export default { mountColorPicker };
