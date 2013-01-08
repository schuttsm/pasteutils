/**
 * editable_selects.js
 *
 * Copyright 2009, Moxiecode Systems AB
 * Released under LGPL License.
 *
 * License: http://tinymce.moxiecode.com/license
 * Contributing: http://tinymce.moxiecode.com/contributing
 * by Stephen Schutt & Peter Rust
 * 
 * Pasteutils began as a fork of the paste plugin for TinyMCE - it converts list html pasted from MS Word into 
 * 		semantic html list elements more useable html.  Basically all this does is convert tags that look like <o:mso> 
 *    into <ul>, <ol> & <li>'s.  This code removed the dependency on TinyMCE and introduced a dependency on jQuery.
 *    
 * This file was copied & heavily adapted from 
 *    editor_plugin_src.js - line 660: function _convertLists, line 338: function _preProcess & line 586 function _postProcess
 *    DOMUtils.js
 */
 
(function($) {
	window.pasteutils = window.pasteutils || {};

	pasteutils.cleanHTML = function cleanHTML(text) {
		var container = document.createElement('div');
		container.innerHTML = text;
		$(container).addClass('__paste__container__');
		this._preprocess(container);
		this._postprocess(container);
		return container.innerHTML;
	};

	pasteutils._preprocess = function _preprocess(container) {

		var h = container.innerHTML, len, stripClass;

		// Detect Word content and process it more aggressive
		if (/class="?Mso|style="[^"]*\bmso-|w:WordDocument/i.test(h)) {
			// Process away some basic content
			h = this._process([
				/^\s*(&nbsp;)+/gi,				// &nbsp; entities at the start of contents
				/(&nbsp;|<br[^>]*>)+\s*$/gi,		// &nbsp; entities at the end of contents
			], h);

			h = this._process([[new RegExp(String.fromCharCode(194), 'ig'), '']], h);

			h = this._process([
				[/<!--\[if !supportLists\]-->/gi, '$&__MCE_ITEM__'],					// Convert supportLists to a list item marker
				[/(<span[^>]+(?:mso-list:|:\s*symbol)[^>]+>)/gi, '$1__MCE_ITEM__'],		// Convert mso-list and symbol spans to item markers
				[/(<p[^>]+(?:MsoListParagraph)[^>]+>)/gi, '$1__MCE_ITEM__']				// Convert mso-list and symbol paragraphs to item markers (FF)
			], h);

			h = this._process([
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
				h = h.replace(/(<[a-z][^>]*\s)(?:id|name|language|on\w+|\w+:\w+)=(?:"[^"]*"|\w+)\s?/gi, "$1");
			} while (len != h.length);

			h = h.replace(/<\/?span[^>]*>/gi, "");
		}

		h = this._process([
			// Copy paste from Java like Open Office will produce this junk on FF
			[/Version:[\d.]+\nStartHTML:\d+\nEndHTML:\d+\nStartFragment:\d+\nEndFragment:\d+/gi, '']
		], h);

		// Class attribute options are: leave all as-is ("none"), remove all ("all"), or remove only those starting with mso ("mso").
		// Note:-  paste_strip_class_attributes: "none", verify_css_classes: true is also a good variation.
		this.stripClass = 'mso';

		if (stripClass !== "none") {
			h = h.replace(/ class="([^"]+)"/gi, this._removeClasses.bind(this));
			h = h.replace(/ class=([\-\w]+)/gi, this._removeClasses.bind(this));
		}

		h = h.replace(/<\/?span[^>]*>/gi, "");

		container.innerHTML = h;
	};

	pasteutils._postprocess = function _postprocess(container) {
		this.styleProps = 'none';

		// Remove named anchors or TOC links
		$(container).find('a').each(function(a) {
			if (!a.href || a.href.indexOf('#_Toc') != -1)
				this._remove(a, 1);
		});

		this._convertLists(container);
	};

	pasteutils._convertLists = function _convertLists(container) {
		var html;
		var lastMargin = lastType = levels = listElm = null;

		// Convert middot lists into real semantic lists
		$(container).find('p').each(this._parseParagraph.bind(this));

		// Remove any left over makers
		html = container.innerHTML;
		if (html.indexOf('__MCE_ITEM__') != -1)
			container.innerHTML = html.replace(/__MCE_ITEM__/g, '');
	};

	pasteutils._parseParagraph = function _parseParagraph(index, p) {
		var sib, val = '', type, html, idx, parents, margin, ol_type;
		var container = $(p).closest('.__paste__container__');
		lastType = lastType || [];

		// Get text node value at beginning of paragraph
		for (sib = p.firstChild; sib && sib.nodeType == 3; sib = sib.nextSibling)
			val += sib.nodeValue;

		val = p.innerHTML.replace(/<\/?\w+[^>]*>/gi, '').replace(/&nbsp;/g, '\u00a0');

		// Detect unordered lists look for bullets
		if (/^(__MCE_ITEM__)+[\u2022\u00b7\u00a7\u00d8o\u25CF]\s*\u00a0*/.test(val))
			type = 'ul';

		// Detect ordered lists 1., a. or ixv.
		if (/^[__MCE_ITEM__]+\s*\w+(\.|\))\s*\u00a0+/.test(val)) {
			type = 'ol';
			if (/^[__MCE_ITEM__]+\s*[i]+(\.|\))\s*\u00a0+/.test(val))
				ol_type = 'i';
			else if (/^[__MCE_ITEM__]+\s*[I]+(\.|\))\s*\u00a0+/.test(val))
				ol_type = 'I';
			else if (/^[__MCE_ITEM__]+\s*\d+(\.|\))\s*\u00a0+/.test(val))
				ol_type = '1';
			else if (/^[__MCE_ITEM__]+\s*[a-z]+(\.|\))\s*\u00a0+/.test(val))
				ol_type = 'a';
			else if (/^[__MCE_ITEM__]+\s*[A-Z]+(\.|\))\s*\u00a0+/.test(val))
				ol_type = 'A';
		}

		// Check if node value matches the list pattern: o&nbsp;&nbsp;
		if (type) {
			var style_attr = $(p).attr('style');
			var level_matches = /level(\d?)/i.exec(style_attr);
			margin = parseFloat(level_matches[1] || 0);

			if (!listElm || type != lastType[margin] && margin == lastMargin) {
				listElm = $('<' + type + '>');
				if (ol_type) listElm.attr('type', ol_type);
				listElm.insertBefore(p);
			}
			else {
				// Nested list element
				if (margin > lastMargin) {
					var child_menu = $('<' + type + '>');
					if (ol_type) child_menu.attr('type', ol_type);
					$(listElm).find('li:last').append(child_menu);
					listElm = child_menu;
				}
				else if (margin < lastMargin) {
					// if current element is one level in
					while (margin < lastMargin && lastMargin > 0) {
						var closest_li = $(listElm).closest('li');
						if (closest_li) {
							listElm = $(closest_li).closest(lastType[margin]) || container;
							lastType.pop();
						}
						lastMargin--;							
					}
				}
			}

			// Remove middot or number spans if they exists
			$(container).find('span').each(function(span) {
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
				html = p.innerHTML.replace(/__MCE_ITEM__/g, '').replace(/^[\s|&nbsp;]*\w+[\.|\)](&nbsp;|\u00a0)+\s*/, '');

			// Create li and add paragraph data into the new li
			var li = $('<li>');
			li.html(html);
			li = $(listElm).append(li);
			$(p).remove();

			lastMargin = margin;
			lastType[margin] = type;
		}
		else {
			listElm = lastMargin = 0;
		}
	};

	pasteutils._process = function _process(items, h) {
		items.forEach(function(v) {
			// Remove or replace
			if (v.constructor == RegExp)
				h = h.replace(v, '');
			else
				h = h.replace(v[0], v[1]);
		});
		return h;
	};

	pasteutils._grep = function _grep(a, f) {
		var o = [];

		a.forEach(function(v) {
			if (!f || f(v))
				o.push(v);
		});

		return o;
	};
		
	pasteutils._explode = function _explode(s, d) {
		if (!s || this._is(s, 'array')) {
			return s;
		}

		return this._map(s.split(d || ','), this._trim);
	};
		
	pasteutils._trim = function _trim(s) {
		return (s ? '' + s : '').replace(/^\s*|\s*$/g, '');
	};

	pasteutils._is = function _is(o, t) {
		if (!t)
			return o;

		if (t == 'array' && this._isArray(o))
			return true;

		return typeof(o) == t;
	};

	pasteutils._isArray = function _isArray(obj) {
		return Object.prototype.toString.call(obj) === "[object Array]";
	};

	pasteutils._removeClasses = function _removeClasses(match, g1) {
		var cls = this._grep(this._explode(g1.replace(/^(["'])(.*)\1$/, "$2"), " "),
			function(v) {
				return (/^(?!mso)/i.test(v));
			}
		);

		return cls.length ? ' class="' + cls.join(" ") + '"' : '';
	};

	pasteutils._map = function _map(a, f) {
		var o = [];

		a.forEach(function(v) { o.push(f(v));});

		return o;
	};

	pasteutils._remove = function _remove(node, keep_children) {
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
	};
})(window.jQuery);