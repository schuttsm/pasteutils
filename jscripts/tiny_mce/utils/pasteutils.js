/**
 * pasteutils.js
 *
 * Copyright 2009, Moxiecode Systems AB
 * Released under LGPL License.
 *
 * License: http://tinymce.moxiecode.com/license
 * Contributing: http://tinymce.moxiecode.com/contributing
 * adapted by Stephen Schutt & Peter Rust
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
	pasteutils.patterns = {
		'a_bullet_type' : /^[__MCE_ITEM__]+\s*[a-z]+(\.|\))\s*\u00a0+/,
		'A_bullet_type' : /^[__MCE_ITEM__]+\s*[A-Z]+(\.|\))\s*\u00a0+/,
		'bad_attrs': /(<[a-z][^>]*\s)(?:id|name|language|on\w+|\w+:\w+)=(?:"[^"]*"|\w+)\s?/gi,
		'beginning_nbsps': /^\s*(&nbsp;)+/gi,
		'conditional_comments': /<!--[\s\S]+?-->/gi,
		'ending_nbsps': /(&nbsp;|<br[^>]*>)+\s*$/gi,
		'i_bullet_type' : /^[__MCE_ITEM__]+\s*[i]+(\.|\))\s*\u00a0+/,
		'I_bullet_type' : /^[__MCE_ITEM__]+\s*[I]+(\.|\))\s*\u00a0+/,
		'indent_match' : /level(\d?)/i,
		'middot_match' : /^[\u2022\u00b7\u00a7\u00d8o\u25CF]\s*(&nbsp;|\u00a0)+\s*/,
		'middot_other_match' : /^[\s|&nbsp;]*\w+[\.|\)](&nbsp;|\u00a0)+\s*/,
		'middot_span_match' : /^__MCE_ITEM__[\u2022\u00b7\u00a7\u00d8o\u25CF]/,
		'middot_span_other_match' : /^__MCE_ITEM__[\s\S]*\w+\.(&nbsp;|\u00a0)*\s*/,
		'ms_strike': /<(\/?)s>/gi,
		'mso_list_marker':  '/(<span[^>]+(?:mso-list:|:\s*symbol)[^>]+>)/gi',
		'mso_list_symbol_marker': /(<p[^>]+(?:MsoListParagraph)[^>]+>)/gi,
		'nbsp_marker': /&nbsp;/gi,
		'ol_match' : /^[__MCE_ITEM__]+\s*\w+(\.|\))\s*\u00a0+/,
		'one_bullet_type' : /^[__MCE_ITEM__]+\s*\d+(\.|\))\s*\u00a0+/,
		'open_office_scrub': /Version:[\d.]+\nStartHTML:\d+\nEndHTML:\d+\nStartFragment:\d+\nEndFragment:\d+/gi,
		'other_comments': /<(!|script[^>]*>.*?<\/script(?=[>\s])|\/?(\?xml(:\w+)?|img|meta|link|style|\w:\w+)(?=[\s\/>]))[^>]*>/gi,
		'scrub_A_char': new RegExp(String.fromCharCode(194), 'ig'),
		'span_marker' : /<\/?span[^>]*>/gi,
		'support_list_marker': '/<!--\[if !supportLists\]-->/gi',
		'ul_match' : /^(__MCE_ITEM__)+[\u2022\u00b7\u00a7\u00d8o\u25CF]\s*\u00a0*/,
		'word_content': /class="?Mso|style="[^"]*\bmso-|w:WordDocument/i
	};

	pasteutils.strings = {
		'bad_attrs_marker' : '$1',
		'list_item_marker' : '$&__MCE_ITEM__',
		'mso_list_marker' : '$1__MCE_ITEM__',
		'nbsp' : '\u00a0',
		'strike_through' : '<$1strike>'
	};

	pasteutils.cleanHTML = function cleanHTML(text) {
		var container = $('<div>');
		container.html(text);
		pasteutils._preprocess(container);
		pasteutils._postprocess(container);
		return container.html();
	};

	pasteutils._preprocess = function _preprocess(container) {
		pasteutils.processed_html = container.html();

		// Detect Word content and process it more aggressive
		if (pasteutils.patterns.word_content.test(pasteutils.processed_html)) {
			pasteutils._process([
				pasteutils.patterns.beginning_nbsps,
				pasteutils.patterns.ending_nbsps,
				[pasteutils.patterns.scrub_A_char],
				[pasteutils.patterns.support_list_marker, pasteutils.strings.list_item_marker],
				[pasteutils.patterns.mso_list_marker, pasteutils.strings.mso_list_marker],
				[pasteutils.patterns.mso_list_symbol_marker, pasteutils.strings.mso_list_marker],
				pasteutils.patterns.conditional_comments,
				// Remove comments, scripts (e.g., msoShowComment), XML tag, VML content, MS Office namespaced tags, and a few other tags
				pasteutils.patterns.other_comments,
				[pasteutils.patterns.ms_strike, pasteutils.strings.strike_through],
				[pasteutils.patterns.nbsp_marker, pasteutils.strings.nbsp]
			]);

			while (pasteutils.patterns.bad_attrs.test(pasteutils.processed_html))
			  pasteutils._process([pasteutils.patterns.bad_attrs, '$1']);

			pasteutils._process([[pasteutils.patterns.span_marker]]);
		}

		pasteutils._process([
			// Copy paste from Java like Open Office will produce this junk on FF
			pasteutils.patterns.open_office_scrub,
			pasteutils.patterns.span_marker
		]);

		container.html(pasteutils.processed_html);
	};

	pasteutils._process = function _process(items) {
		items.forEach(function(v) {
			pasteutils.processed_html = pasteutils.processed_html.replace(v[0], v[1] || '');
		}.bind(this));
	};

	pasteutils._postprocess = function _postprocess(container) {
		// Remove named anchors or TOC links
		container.find('a').each(function(a) {
			if (!a.href || a.href.indexOf('#_Toc') != -1)
				pasteutils._remove(a, 1);
		});

		pasteutils._convertLists(container);
	};

	pasteutils._convertLists = function _convertLists(container) {
		var html;
		var lastLevel = lastType = listElm = null;

		// Convert middot lists into real semantic lists
		container.find('p').each(pasteutils._parseParagraph.bind(this));

		// Remove any left over makers
		html = container.html();
		if (html.indexOf('__MCE_ITEM__') != -1)
			container.html(html.replace(/__MCE_ITEM__/g, ''));
	};

	pasteutils._parseParagraph = function _parseParagraph(index, p) {
		var val = '', type, html, level, ol_type;
		var container = $(p).parents().last();
		lastType = lastType || [];

		val = $(p).text().replace(pasteutils.patterns.nbsp_marker, pasteutils.strings.nbsp);

		if (pasteutils.patterns.ul_match.test(val))
			type = 'ul';

		if (pasteutils.patterns.ol_match.test(val)) {
			type = 'ol';
			ol_type = pasteutils._getOlType(val);
		}

		if (type) {
			level = pasteutils._getLevel(p);

			if (pasteutils._isNewList(listElm, lastType, type, level)) {
				listElm = pasteutils._createNewList(type, ol_type);
				listElm.insertBefore(p);
			}
			else if (pasteutils._isDeeper(level, lastLevel)) {
				var child_menu = pasteutils._createNewList(type, ol_type);
				listElm.find('li:last').append(child_menu);
				listElm = child_menu;
			}
			else if (pasteutils._isShallower(level, lastLevel)) {
				var num_levels_to_pop = lastLevel - level;
				_.range(num_levels_to_pop).forEach(function() {
				  var closest_li = $(listElm).closest('li');
					if (closest_li) {
						listElm = $(closest_li).closest(lastType[level - 1]) || container;
						lastType.pop();
					}
				});
			}

			// Remove middot or number spans if they exists
			container.find('span').each(function(span) {
				pasteutils._removeMiddotSpan(span, type);
			});

			html = $(p).html();
			html = pasteutils._paragraphMiddotFilter(type, p);
			$(listElm).append($('<li>').html(html));
			$(p).remove();

			lastLevel = level;
			lastType[level - 1] = type;
		}
		else {
			listElm = lastLevel = 0;
		}
	};

	pasteutils._getLevel = function _getLevel(p) {
		var style_attr = $(p).attr('style');
		var level_matches = pasteutils.patterns.indent_match.exec(style_attr);
		return parseFloat(level_matches[1] || 0);
	};

	pasteutils._isDeeper = function _isDeeper(level, lastLevel) {
		return level > lastLevel;
	};

	pasteutils._isShallower = function _isShallower(level, lastLevel) {
		return level < lastLevel;
	};

	pasteutils._getOlType = function _getOlType(val) {
		var ol_type;
		if (pasteutils.patterns.i_bullet_type.test(val))
			ol_type = 'i';
		else if (pasteutils.patterns.I_bullet_type.test(val))
			ol_type = 'I';
		else if (pasteutils.patterns.one_bullet_type.test(val))
			ol_type = '1';
		else if (pasteutils.patterns.a_bullet_type.test(val))
			ol_type = 'a';
		else if (pasteutils.patterns.A_bullet_type.test(val))
			ol_type = 'A';
		return ol_type;
	};

	pasteutils._isNewList = function _isNewList(listElm, lastType, type, level) {
		return !listElm || type != lastType[level - 1] && level == lastLevel
	};

	pasteutils._createNewList = function _createNewList(type, ol_type) {
		var list = $('<' + type + '>');
		if (ol_type) list.attr('type', ol_type);
		return list;
	};

	pasteutils._removeMiddotSpan = function _removeMiddotSpan(span, type) {
		var html = $(span).text();

		// Remove span with the middot or the number
		if (type == 'ul' && pasteutils.patterns.middot_span_match.test(html))
			span.remove();
		else if (pasteutils.patterns.middot_span_other_match.test(html))
			span.remove();
	};

	pasteutils._paragraphMiddotFilter = function _paragraphMiddotFilter(type, p) {
		if (type == 'ul')
			return p.innerHTML.replace(/__MCE_ITEM__/g, '').replace(pasteutils.patterns.middot_match, '');
		else
			return p.innerHTML.replace(/__MCE_ITEM__/g, '').replace(pasteutils.patterns.middot_other_match, '');
	}

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