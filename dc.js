// Tiny runtime that renders a page's template (x-dc) with its Component logic.
(function () {
  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) { Object.assign(this.state, patch); update(); }
  }
  var comp, root, tpl, bindings = [];
  var HOLE = /\{\{([\s\S]+?)\}\}/g;

  function evalExpr(expr, scope) {
    try { return Function('scope', 'with(scope){return (' + expr + ');}')(scope); }
    catch (e) { return undefined; }
  }
  function single(str) { var m = str.match(/^\s*\{\{([\s\S]+?)\}\}\s*$/); return m ? m[1] : null; }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, e) { var v = evalExpr(e, scope); return v == null ? '' : String(v); });
  }
  function vals() {
    var v = comp.renderVals ? comp.renderVals() : {};
    return Object.assign({}, comp.props, v);
  }

  function render(node, scope, reg) {
    if (node.nodeType === 3) {
      var t = document.createTextNode('');
      var raw = node.nodeValue;
      if (raw.indexOf('{{') < 0) { t.nodeValue = raw; return [t]; }
      var fn = function (s) { t.nodeValue = interp(raw, s); };
      fn(scope); if (reg) reg.push(fn);
      return [t];
    }
    if (node.nodeType !== 1) return [];
    var tag = node.tagName.toLowerCase();
    if (tag === 'sc-for' || tag === 'sc-if') {
      var start = document.createComment(tag), end = document.createComment('/' + tag);
      var frag = [start, end];
      var draw = function (s) {
        var parent = start.parentNode;
        var nodes = [];
        if (tag === 'sc-for') {
          var list = evalExpr(single(node.getAttribute('list')), s) || [];
          var as = node.getAttribute('as') || 'item';
          list.forEach(function (item, i) {
            var sc = Object.create(s); sc[as] = item; sc.index = i;
            node.childNodes.forEach(function (c) { nodes = nodes.concat(render(c, sc, null)); });
          });
        } else {
          if (evalExpr(single(node.getAttribute('value')), s)) {
            node.childNodes.forEach(function (c) { nodes = nodes.concat(render(c, s, null)); });
          }
        }
        if (parent) {
          var n = start.nextSibling;
          while (n && n !== end) { var nx = n.nextSibling; parent.removeChild(n); n = nx; }
          nodes.forEach(function (x) { parent.insertBefore(x, end); });
        } else {
          frag.splice.apply(frag, [1, frag.length - 2].concat(nodes));
        }
      };
      draw(scope); if (reg) reg.push(draw);
      return frag;
    }
    var el = document.createElement(tag);
    Array.prototype.forEach.call(node.attributes, function (a) {
      var name = a.name, v = a.value;
      if (v.indexOf('{{') < 0) { el.setAttribute(name, v); return; }
      if (/^on/i.test(name)) {
        var ex = single(v), sc = scope;
        el.addEventListener(name.slice(2).toLowerCase(), function (ev) {
          var f = evalExpr(ex, sc); if (typeof f === 'function') f(ev);
        });
        return;
      }
      var fn = function (s) {
        var ex1 = single(v);
        var val = ex1 ? evalExpr(ex1, s) : interp(v, s);
        if (val === false || val == null) el.removeAttribute(name);
        else el.setAttribute(name, val === true ? '' : String(val));
      };
      fn(scope); if (reg) reg.push(fn);
    });
    node.childNodes.forEach(function (c) { render(c, scope, reg).forEach(function (x) { el.appendChild(x); }); });
    return [el];
  }

  function update() {
    var s = vals();
    bindings.forEach(function (fn) { fn(s); });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var x = document.querySelector('x-dc');
    var helmet = x.querySelector('helmet');
    if (helmet) { Array.prototype.slice.call(helmet.childNodes).forEach(function (n) { document.head.appendChild(n); }); helmet.remove(); }
    var sc = document.querySelector('script[data-dc-script]');
    var propsDef = {}; try { propsDef = JSON.parse(sc.getAttribute('data-props') || '{}'); } catch (e) {}
    var props = {};
    Object.keys(propsDef).forEach(function (k) { if (k[0] !== '$' && propsDef[k] && 'default' in propsDef[k]) props[k] = propsDef[k].default; });
    var Component = Function('DCLogic', sc.textContent + '\n;return Component;')(DCLogic);
    comp = new Component(props);
    tpl = x; root = document.createElement('div'); root.className = 'dc-root';
    var s = vals();
    Array.prototype.slice.call(x.childNodes).forEach(function (c) {
      render(c, s, bindings).forEach(function (n) { root.appendChild(n); });
    });
    x.parentNode.replaceChild(root, x);
    if (location.hash) { var t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  });
})();
