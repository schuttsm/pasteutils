/**
 * editable_selects.js
 *
 * Copyright 2009, Moxiecode Systems AB
 * Released under LGPL License.
 *
 * License: http://tinymce.moxiecode.com/license
 * Contributing: http://tinymce.moxiecode.com/contributing
 * 
 * Pasteutils was created by Stephen Schutt & Peter Rust as a way to parse a string pasted from word string into 
 *    more useable html.  Basically all this does is convert tags that look like <o:mso> into <ul> & <ol> & li's.
 *    It is good at handling in 
 *    
 * This file was copied & heavily adapted from 
 *    editor_plugin_src.js - line 660: function _convertLists, line 338: function _preProcess & line 586 function _postProcess
 *    DOMUtils.js
 */
(function($) {
	var whiteSpaceRe = /^\s*|\s*$/g;

	window.pasteutils = window.pasteutils || {};

	var pasteutils = {
		
		'parseText' : function parseText(text) {
			this.container = document.createElement('div');
			this.container.innerHTML = text;
			this.preprocess();
			this.postprocess();
			return this.container.innerHTML;
		},

		'preprocess' : function preprocess() {
			var h = this.container.innerHTML, len, stripClass;

			// Detect Word content and process it more aggressive
			if (/class="?Mso|style="[^"]*\bmso-|w:WordDocument/i.test(h)) {
				// Process away some basic content
				h = this.process([
					/^\s*(&nbsp;)+/gi,				// &nbsp; entities at the start of contents
					/(&nbsp;|<br[^>]*>)+\s*$/gi		// &nbsp; entities at the end of contents
				], h);

				h = this.process([
					[/<!--\[if !supportLists\]-->/gi, '$&__MCE_ITEM__'],					// Convert supportLists to a list item marker
					[/(<span[^>]+(?:mso-list:|:\s*symbol)[^>]+>)/gi, '$1__MCE_ITEM__'],		// Convert mso-list and symbol spans to item markers
					[/(<p[^>]+(?:MsoListParagraph)[^>]+>)/gi, '$1__MCE_ITEM__']				// Convert mso-list and symbol paragraphs to item markers (FF)
				], h);

				h = this.process([
					// Word comments like conditional comments etc
					/<!--[\s\S]+?-->/gi,

					// Remove comments, scripts (e.g., msoShowComment), XML tag, VML content, MS Office namespaced tags, and a few other tags
					/<(!|script[^>]*>.*?<\/script(?=[>\s])|\/?(\?xml(:\w+)?|img|meta|link|style|\w:\w+)(?=[\s\/>]))[^>]*>/gi,

					// Convert <s> into <strike> for line-though
					[/<(\/?)s>/gi, "<$1strike>"],

					// Replace nsbp entites to char since it's easier to handle
					[/&nbsp;/gi, "\u00a0"]
				], h);

				// Remove bad attributes, with or without quotes, ensuring that attribute text is really inside a tag.
				// If JavaScript had a RegExp look-behind, we could have integrated this with the last process() array and got rid of the loop. But alas, it does not, so we cannot.
				do {
					len = h.length;
					h = h.replace(/(<[a-z][^>]*\s)(?:id|name|language|type|on\w+|\w+:\w+)=(?:"[^"]*"|\w+)\s?/gi, "$1");
				} while (len != h.length);

				h = h.replace(/<\/?span[^>]*>/gi, "");
			}

			h = this.process([
				// Copy paste from Java like Open Office will produce this junk on FF
				[/Version:[\d.]+\nStartHTML:\d+\nEndHTML:\d+\nStartFragment:\d+\nEndFragment:\d+/gi, '']
			], h);

			// Class attribute options are: leave all as-is ("none"), remove all ("all"), or remove only those starting with mso ("mso").
			// Note:-  paste_strip_class_attributes: "none", verify_css_classes: true is also a good variation.
			this.stripClass = 'mso';

			if (stripClass !== "none") {
				h = h.replace(/ class="([^"]+)"/gi, this.removeClasses.bind(this));
				h = h.replace(/ class=([\-\w]+)/gi, this.removeClasses.bind(this));
			}

			h = h.replace(/<\/?span[^>]*>/gi, "");

			this.container.innerHTML = h;
		},

		'postprocess' : function postprocess() {
			this.styleProps = 'none';

			// Remove named anchors or TOC links
			this.select('a', this.container).each(function(a) {
				if (!a.href || a.href.indexOf('#_Toc') != -1)
					this.remove(a, 1);
			});

			this.convertLists();

			// Process only if a string was specified and not equal to "all" or "*"
			if ((this.is(this.styleProps, "string")) && (this.styleProps !== "all") && (this.styleProps !== "*")) {
				this.styleProps = this.explode(this.styleProps.replace(/^none$/i, ""));

				// Retains some style properties
				this.each(this.select('*', this.container), this.applyStyles.bind(this));
			}
		},

		'convertLists' : function convertLists() {
			var html;

			// Convert middot lists into real semantic lists
			this.select('p', this.container).each(this.parseParagraph.bind(this));

			// Remove any left over makers
			html = this.container.innerHTML;
			if (html.indexOf('__MCE_ITEM__') != -1)
				this.container.innerHTML = html.replace(/__MCE_ITEM__/g, '');
		},

		'parseParagraph' : function parseParagraph(index, p) {
			var li, sib, val = '', type, html, idx, parents, levels = [], margin;

			// Get text node value at beginning of paragraph
			for (sib = p.firstChild; sib && sib.nodeType == 3; sib = sib.nextSibling)
				val += sib.nodeValue;

			val = p.innerHTML.replace(/<\/?\w+[^>]*>/gi, '').replace(/&nbsp;/g, '\u00a0');

			// Detect unordered lists look for bullets
			if (/^(__MCE_ITEM__)+[\u2022\u00b7\u00a7\u00d8o\u25CF]\s*\u00a0*/.test(val))
				type = 'ul';

			// Detect ordered lists 1., a. or ixv.
			if (/^__MCE_ITEM__\s*\w+\.\s*\u00a0+/.test(val))
				type = 'ol';

			// Check if node value matches the list pattern: o&nbsp;&nbsp;
			if (type) {
				var style_attr = $(p).attr('style');
				var level_matches = /level(\d?)/i.exec(style_attr);
				margin = parseFloat(level_matches[1] || 0);

				if (margin > this.lastMargin)
					levels.push(margin);

				if (!this.listElm || type != this.lastType) {
					this.listElm = this.create(type);
					this.insertAfter(this.listElm, p);
				} else {
					// Nested list element
					if (margin > this.lastMargin) {
						var child_menu = this.create(type);
						$(this.listElm).find('li:last').append(child_menu);
						this.listElm = child_menu;
					} else if (margin < this.lastMargin) {
						// Find parent level based on margin value
						idx = tinymce.inArray(levels, margin);
						parents = this.getParents(this.listElm.parentNode, type);
						this.listElm = parents[parents.length - 1 - idx] || this.listElm;
					}
				}

				// Remove middot or number spans if they exists
				this.select('span', p).each(function(span) {
					var html = span.innerHTML.replace(/<\/?\w+[^>]*>/gi, '');

					// Remove span with the middot or the number
					if (type == 'ul' && /^__MCE_ITEM__[\u2022\u00b7\u00a7\u00d8o\u25CF]/.test(html))
						span.remove();
					else if (/^__MCE_ITEM__[\s\S]*\w+\.(&nbsp;|\u00a0)*\s*/.test(html))
						span.remove();
				});

				html = p.innerHTML;

				// Remove middot/list items
				if (type == 'ul')
					html = p.innerHTML.replace(/__MCE_ITEM__/g, '').replace(/^[\u2022\u00b7\u00a7\u00d8o\u25CF]\s*(&nbsp;|\u00a0)+\s*/, '');
				else
					html = p.innerHTML.replace(/__MCE_ITEM__/g, '').replace(/^\s*\w+\.(&nbsp;|\u00a0)+\s*/, '');

				// Create li and add paragraph data into the new li
				var li = $('<li>');
				li.html(html);
				li = $(this.listElm).append(li);
				$(p).remove();

				this.lastMargin = margin;
				this.lastType = type;
			} else
				listElm = this.lastMargin = 0; // End list element
		},

		'process' : function process(items, h) {
			this.each(items, function(v) {
				// Remove or replace
				if (v.constructor == RegExp)
					h = h.replace(v, '');
				else
					h = h.replace(v[0], v[1]);
			});
			return h;
		},

		'insertAfter' : function insertAfter(node, reference_node) {
			reference_node = this.get(reference_node);

			return this.run(node, function(node) {
				var parent, nextSibling;

				parent = reference_node.parentNode;
				nextSibling = reference_node.nextSibling;

				if (nextSibling)
					parent.insertBefore(node, nextSibling);
				else
					parent.appendChild(node);

				return node;
			});
		},

		'grep' : function grep(a, f) {
			var o = [];

			this.each(a, function(v) {
				if (!f || f(v))
					o.push(v);
			});

			return o;
		},

		'explode' : function explode(s, d) {
			if (!s || this.is(s, 'array')) {
				return s;
			}

			return this.map(s.split(d || ','), this.trim);
		},

		'trim' : function trim(s) {
			return (s ? '' + s : '').replace(whiteSpaceRe, '');
		},

		'is' : function is(o, t) {
			if (!t)
				return o;

			if (t == 'array' && this.isArray(o))
				return true;

			return typeof(o) == t;
		},

		'isArray' : function isArray(obj) {
			return Object.prototype.toString.call(obj) === "[object Array]";
		},

		'each' : function each(o, cb, s) {
			var n, l;
			if (!o)
				return 0;

			s = s || o;

			if (o.length) {
				// Indexed arrays, needed for Safari
				for (n=0, l = o.length; n < l; n++) {
					if (cb.call(s, o[n], n, o) === false)
						return 0;
				}
			} else {
				// Hashtables
				for (n in o) {
					if (o.hasOwnProperty(n)) {
						if (cb.call(s, o[n], n, o) === false)
							return 0;
					}
				}
			}
			return 1;
		},

		'create' : function create(n, a, h) {
			return this.add(document.createElement(n), n, a, h, 1);
		},

		'add' : function add(p, n, a, h, c) {
			var t = this;

			return this.run(p, function(p) {
				var e, k;

				e = this.is(n, 'string') ? document.createElement(n) : n;
				t.setAttribs(e, a);

				if (h) {
					if (h.nodeType)
						e.appendChild(h);
					else
						t.setHTML(e, h);
				}

				return !c ? p.appendChild(e) : e;
			}.bind(this));
		},

		'setAttribs' : function setAttribs(e, o) {
			var t = this;

			return this.run(e, function(e) {
				this.each(o, function(v, n) {
					t.setAttrib(e, n, v);
				});
			});
		},

		'setHTML' : function setHTML(element, html) {
			var self = this;

			return self.run(element, function(element) {
				element.innerHTML = html;
				return html;
			});
		},

		'removeClasses' : function removeClasses(match, g1) {
			var cls = this.grep(this.explode(g1.replace(/^(["'])(.*)\1$/, "$2"), " "),
				function(v) {
					return (/^(?!mso)/i.test(v));
				}
			);

			return cls.length ? ' class="' + cls.join(" ") + '"' : '';
		},

		'map' : function map(a, f) {
			var o = [];

			this.each(a, function(v) {
				o.push(f(v));
			});

			return o;
		},

		'applyStyles': function applyStyles(el) {
			var newStyle = {}, npc = 0, i, sp, sv;

			// Store a subset of the existing styles
			if (this.styleProps) {
				for (i = 0; i < this.styleProps.length; i++) {
					sp = this.styleProps[i];
					sv = this.getStyle(el, sp);

					if (sv) {
						newStyle[sp] = sv;
						npc++;
					}
				}
			}

			// Remove all of the existing styles
			this.setAttrib(el, 'style', '');

			if (this.styleProps && npc > 0)
				this.setStyles(el, newStyle); // Add back the stored subset of styles
			else // Remove empty span tags that do not have class attributes
				if (el.nodeName == 'SPAN' && !el.className)
					this.remove(el, true);
		},

		'select' : function select(pa, s) {
			return $(s).find(pa);
		},

		'remove' : function remove(node, keep_children) {
			return this.run(node, function(node) {
				var child, parent = node.parentNode;

				if (!parent)
					return null;

				if (keep_children) {
					while (child = node.firstChild) {
						// IE 8 will crash if you don't remove completely empty text nodes
						if (!tinymce.isIE || child.nodeType !== 3 || child.nodeValue)
							parent.insertBefore(child, node);
						else
							node.removeChild(child);
					}
				}

				return parent.removeChild(node);
			});
		},

		'get' : function get(e) {
			var n;
			if (e && this.container && typeof(e) == 'string') {
				n = e;
				e = this.container.getElementById(e);
				// IE and Opera returns meta elements when they match the specified input ID, but getElementsByName seems to do the trick
				if (e && e.id !== n)
					return this.container.getElementsByName(n)[1];
			}
			return e;
		},

		'setAttrib' : function setAttrib(el, attr) {
			$(el).attr(attr);
		},

		'run' : function run(e, f, s) {
			var t = this, o;

			if (t.doc && typeof(e) === 'string')
				e = t.get(e);

			if (!e)
				return false;

			s = s || this;
			if (!e.nodeType && (e.length || e.length === 0)) {
				o = [];

				each(e, function(e, i) {
					if (e) {
						if (typeof(e) == 'string')
							e = t.doc.getElementById(e);

						o.push(f.call(s, e, i));
					}
				});

				return o;
			}

			return f.call(s, e);
		},

		'inArray': function inArray(a, v) {
			var i, l;

			if (a) {
				for (i = 0, l = a.length; i < l; i++) {
					if (a[i] === v)
						return i;
				}
			}

			return -1;
		}
	};

	window.pasteutils = pasteutils;
})(window.jQuery);