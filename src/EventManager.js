function isStrOrArray(str) {
  return str && (typeof str === 'string' || (Array.isArray(str) && str.length > 0 && isStrOrArray(str[0])))
}

function isFunc(func) {
  return func && typeof func === 'function'
}

function isHTMLElOrArray(el) {
  console.log('checking', el, el instanceof HTMLElement || el instanceof Window || el instanceof Document, Array.isArray(el) && el.length > 0 && isHTMLElOrArray(el[0]));
  return el && (el instanceof HTMLElement || el instanceof Window || el instanceof Document || (Array.isArray(el) && el.length > 0 && isHTMLElOrArray(el[0])))
}

function throwArgsError(args, expected) {
  throw new Error(`Invalid arguments\n
    ${Object.entries(args).reduce((prev, curr, idx) =>
    `${prev}${idx ? '\n' : ''}${curr[0]}: ${typeof curr[1]}("${curr[1]}") expected ${expected[curr[0]]}`
    , '')}
  `);
}

function eq(a, b, checkFunc) {
  return checkFunc ? isFunc(a) && a === b : a === b;
}

function optEq(a, b, checkFunc) {
  return !a || eq(a, b, checkFunc);
}

export class EventManager {
  static _listeners = [];
  static _attachedListeners = [];

  static get _isGameInView() {
    const gameEl = document.getElementById('game');
    return () => window.scrollY < gameEl.offsetTop + gameEl.clientHeight - gameEl.clientHeight / 4 * 3;
  }

  static emit(type, args) {
    if (!isStrOrArray(type)) {
      throwArgsError({ type }, { type: 'string | string[]' });
    }

    if (Array.isArray(type)) {
      type.forEach(t => this.emit(t, args));
      return;
    }

    this._listeners.forEach(({ _t, _cb }) => !type || _t === type ? _cb({ event: null, isGameInView: this._isGameInView, ...args }) : null);
  }
  static on(type, callback, element) {
    if (!(isStrOrArray(type) && isFunc(callback))) {
      throwArgsError({ type, callback }, { type: 'string | string[]', callback: 'function' });
    }

    if (Array.isArray(type)) {
      if (Array.isArray(element)) {
        type.forEach(t => element.forEach(e => this.on(t, callback, e)));
        return;
      }
      type.forEach(t => this.on(t, callback, element));
      return;
    }

    this._listeners.push({ _t: type, _cb: callback });

    console.log({ type, callback, element });
    if (isHTMLElOrArray(element)) {
      this.attachTo(type, element, callback);
    }
  }

  static attachTo(type, element, callback) {
    if (!(isStrOrArray(type) && isHTMLElOrArray(element))) {
      throwArgsError({ type, element }, { type: 'string | string[]', element: 'HTMLElement | HTMLElement[]' });
    }

    if (Array.isArray(type)) {
      if (Array.isArray(element)) {
        type.forEach(t => element.forEach(e => this.attachTo(t, e, callback)));
        return;
      }
      type.forEach(t => this.attachTo(t, element, callback));
      return;
    }

    if (Array.isArray(element)) {
      element.forEach(e => this.attachTo(type, e, callback));
      return;
    }


    if (this._attachedListeners.some(({ _t, _ocb, _el }) =>
      (optEq(type, _t) && eq(element, _el) && optEq(callback, _ocb, true)))) {
      this._attachedListeners.forEach(({ _t, _ocb, _cb, _el }) => optEq(type, _t) && eq(element, _el) && optEq(callback, _ocb, true) ? this.detachFrom(_t, _el, _cb) : null);
    }

    this._listeners.forEach(({ _t, _cb }) =>
      optEq(type, _t) && optEq(callback, _cb, true) ?
        this._attachedListeners.push({ _t: type, _ocb: _cb, _cb: (event) => _cb({ event, isGameInView: this._isGameInView }), _el: element })
        : null);

    this._attachedListeners.forEach(({ _t, _ocb, _cb, _el }) => optEq(type, _t) && eq(element, _el) && optEq(callback, _ocb, true) ? _el.addEventListener(_t, _cb, false) : null);
  }

  static detachFrom(type, element, callback) {
    if (!(isStrOrArray(type) && isHTMLElOrArray(element))) {
      throwArgsError({ type, element }, { type: 'string | string[]', element: 'HTMLElement | HTMLElement[]' })
    };

    if (Array.isArray(type)) {
      if (Array.isArray(element)) {
        type.forEach(t => element.forEach(el => this.detachFrom(t, el, callback)));
        return;
      }
      type.forEach(t => this.detachFrom(t, element, callback));
      return;
    }

    if (Array.isArray(element)) {
      element.forEach(el => this.detachFrom(type, el, callback));
      return;
    }

    this._attachedListeners.forEach(({ _t, _cb, _el }) => optEq(type, _t) && eq(element, _el) && optEq(callback, _cb, true) ? _el.removeEventListener(_t, _cb) : null);
    this._attachedListeners = this._attachedListeners.filter(({ _t, _cb, _el }) => !((optEq(type, _t) && eq(element, _el) && optEq(callback, _cb, true))));
  }

  static detachAll() {
    this._attachedListeners.forEach(({ _t, _cb, _el }) => _el.removeEventListener(_t, _cb));
    this._attachedListeners = [];
  }
}