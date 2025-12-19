## Modified by SAP
* Output Markdown instead of HTML (Modified all templates)
* Removed navbar functionality from publish.js
* Removed static files functionality from publish.js
* Modified js links to link to GitHub 
* Modified internal linking

## Version 2.0.2
* [feature] added noURLEncode option to not url encode links in the menu for unicode texts
## Version 2.0.1
* [fix] Removed old backwards compatability fix to fix in page linking

## Version 2.0.0
* [feature] BREAKING: updated the system to work with JSdoc 4.x https://github.com/clenemt/docdash/pull/110
* [feature] Added custom classes to h5 headers for customization
* [feature] Added Global into section order
* [feature] Added possibility to exclude package scope/name and version from output path https://github.com/clenemt/docdash/pull/78
* [feature] Added type signature specific classes for CSS customization
* [feature] Adjusted layout for namespace https://github.com/clenemt/docdash/pull/86
* [feature] Common Navigation HTML generated https://github.com/clenemt/docdash/pull/95
* [feature] Collapsible top level menu
* [feature] Shorten types https://github.com/clenemt/docdash/pull/104
* [feature] Update CSS for pre https://github.com/clenemt/docdash/pull/103
* [fix] Added double quotes to README for consistency https://github.com/clenemt/docdash/pull/96
* [fix] Fixed extra scroll bar on large code blocks https://github.com/clenemt/docdash/pull/99
* [fix] Fixed regular expression in README.md https://github.com/clenemt/docdash/pull/81

## Version 1.2.0

* [feature] host fonts locally https://github.com/clenemt/docdash/pull/63
* [feature] separate styles for headers inside user markdown https://github.com/clenemt/docdash/pull/64
* [feature] hide static/private method depending of the config https://github.com/clenemt/docdash/pull/72
* [fix] fix empty source code lines in some browsers
* [fix] improved viewing theme on smaller screens https://github.com/clenemt/docdash/pull/62

## Version 1.1.1

* [feature] scroll to currently opened method on page load https://github.com/clenemt/docdash/pull/60
* [fix] fixed searching in IE11
* [fix] hiding/showing find exact match to open only single relevant section

## Version 1.1.0

* [scripts] remove jQuery as dependency https://github.com/clenemt/docdash/pull/54
* [feature] allow aliasing event names https://github.com/clenemt/docdash/pull/59

## Version 1.0.3

* [style] break headers into multiple lines
* [style] break links in descriptions into multiple lines
* [fix] fix ancestor check when there are none, like including tutorials
* [fix] remove unnecessary files from published package
* [fix] stop crashing on incorrect params JSDoc comments
* [feature] add displaying version from package.json when it is provided
* [feature] add support for yield
* [feature] add support for namepsaces that are functions
* [feature] add support for interfaces
* [feature] add support for modifies

## Version 1.0.2

* [styles] increase space between custom menu items
* [option] Added `wrap` option to wrap long names instead of trimming them
* [option] Added `navLevel` option to control depth level to show in navbar, starting at 0
* [option] Added `private` option to show/hide @private in navbar

## Version 1.0.1

* Allow adding custom menu items
* Remove line-height: 160%

## Version 1.0.0

* Add option to add disqus comments to each page
* Add option to filter through navigation items
* Add option to have menus collapsed by default and only open the one for the current page
* Add option to provide custom site title
* Add option to provide meta information for the website
* Add option to provide opengraph information for the website
* Add viewport meta data
* Added global table styles
* Added support for @hidecontainer (jsdoc 3.5.0)
* Added support for useLongnameInNav
* Allow including typedefs in the menu
* Allow inclusion of custom CSS
* Allow injecting external or local copied scripts into HTML
* Allow removing single and double quotes from pathnames
* Fix crash when @example is empty or undefined
* Fix issue with node 8.5
* Fixing copyFile problem on some systems or nodejs versions
* Removes arbitrary width property
* Support ordering of the main navbar sections
