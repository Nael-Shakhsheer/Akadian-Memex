'use strict';
/* Renders LaTeX inside already-escaped text nodes using the locally vendored KaTeX.
   Text reaches the DOM as escaped text first, so nothing here can introduce markup from
   model output; KaTeX itself runs in trusted mode off and never evaluates input as HTML. */
window.MemexMath = (() => {
 // $$…$$ and \[…\] are display; $…$ and \(…\) are inline. Escaped \$ is left alone.
 const PATTERN = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<![\\$])\$(?!\s)((?:[^$\\\n]|\\.)+?)(?<!\s)\$(?!\$)|\\\(([\s\S]+?)\\\)/g;
 const ready = () => typeof katex !== 'undefined';

 function renderOne(tex, display) {
  const span = document.createElement('span');
  try {
   katex.render(tex, span, { displayMode: display, throwOnError: false, output: 'html', trust: false, strict: false });
  } catch {
   // Malformed LaTeX stays readable as its original source rather than disappearing.
   span.className = 'math-raw';
   span.textContent = (display ? '$$' : '$') + tex + (display ? '$$' : '$');
  }
  return span;
 }

 // Walks text nodes only, so existing markup and event handlers are untouched.
 function render(root) {
  if (!root || !ready()) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
   acceptNode: n => (n.nodeValue.includes('$') || n.nodeValue.includes('\\(') || n.nodeValue.includes('\\['))
    && !n.parentElement?.closest('.katex,script,style,textarea,input,code,pre')
    ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
  });
  const targets = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) targets.push(n);
  for (const node of targets) {
   const text = node.nodeValue;
   PATTERN.lastIndex = 0;
   let match, cursor = 0, frag = null;
   while ((match = PATTERN.exec(text))) {
    const tex = match[1] ?? match[2] ?? match[3] ?? match[4];
    if (tex == null || !tex.trim()) continue;
    frag = frag || document.createDocumentFragment();
    if (match.index > cursor) frag.append(text.slice(cursor, match.index));
    frag.append(renderOne(tex.trim(), match[1] != null || match[2] != null));
    cursor = match.index + match[0].length;
   }
   if (!frag) continue;
   if (cursor < text.length) frag.append(text.slice(cursor));
   node.parentNode.replaceChild(frag, node);
  }
 }

 return { render, ready };
})();
