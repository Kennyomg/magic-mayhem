export class EventManager {
  static _listeners = [];
  static _attachedListeners = [];

  static get _isGameInView() {
    const gameEl = document.getElementById('game');
    return () => window.scrollY < gameEl.offsetTop + gameEl.clientHeight - gameEl.clientHeight / 4 * 3;
  }

  static emit(type) {
    if (typeof type !== 'string' || (!Array.isArray(type) || type.length === 0)) {
      throw new Error('Invalid arguments, type should be a string');
    }

    if (Array.isArray(type)) {
      type.forEach(t => this.emit(t));
      return;
    }

    this._listeners.forEach(({ _t, _cb }) => !type || _t === type ? _cb({ event: null, isGameInView: this._isGameInView }) : null);
  }
  static on(type, callback, element) {
    if (!(typeof type === 'string' || (Array.isArray(type) && type.length > 0) && typeof callback === 'function')) {
      throw new Error(`Invalid arguments, type should be a string or an array of strings and callback should be a function\n
                         type: ${typeof type}("${type}"), callback: ${typeof callback}("${callback}")`);
    }

    if (Array.isArray(type)) {
      type.forEach(t => this.on(t, callback));
      return;
    }

    this._listeners.push({ _t: type, _cb: callback });

    if (element && (element instanceof HTMLElement || (Array.isArray(element) && element.length > 0))) {
      this.attachTo(type, element);
    }
  }

  static attachTo(type, element) {
    if (!(typeof type === 'string' || (Array.isArray(type) && type.length > 0) &&
      ((element instanceof HTMLElement) || (Array.isArray(element) && element.length > 0)))) {
      throw new Error('Invalid arguments, type should be a string or an array of strings and element should be an HTMLElement');
    }

    if (Array.isArray(type)) {
      if (Array.isArray(element)) {
        type.forEach(t => element.forEach(e => this.attachTo(t, e)));
        return;
      }
      type.forEach(t => this.attachTo(t, element));
      return;
    }

    if (Array.isArray(element)) {
      element.forEach(e => this.attachTo(type, e));
      return;
    }

    if (this._attachedListeners.some(({ _t, _el }) => !type || _t === type && _el === element)) {
      this.detachFrom(type, element);
    }

    this._listeners.forEach(({ _t, _cb }) =>
      !type || _t === type ?
        this._attachedListeners.push({ _t: type, _cb: (event) => _cb({ event, isGameInView: this._isGameInView }), _el: element })
        : null);
    this._attachedListeners.forEach(({ _t, _cb, _el }) => _el.addEventListener(_t, _cb));
  }

  static detachFrom(type, element) {
    if ((typeof type !== 'string' || (!Array.isArray(type) || type.length === 0)) ||
      (!(element instanceof HTMLElement) || (!Array.isArray(element) || element.length === 0))) {
      throw new Error('Invalid arguments, type should be a string or an array of strings and element should be an HTMLElement');
    };

    if (Array.isArray(type)) {
      if (Array.isArray(element)) {
        type.forEach(t => element.forEach(el => this.detachFrom(t, el)));
        return;
      }
      type.forEach(t => this.detachFrom(t, element));
      return;
    }

    if (Array.isArray(element)) {
      element.forEach(el => this.detachFrom(type, el));
      return;
    }

    this._attachedListeners.forEach(({ _t, _cb, _el }) => !type || _t === type && _el === element ? element.removeEventListener(_t, _cb) : null);
    this._attachedListeners = this._attachedListeners.filter(({ _t, _el }) => !(!type || _t === type && _el === element));
  }
}