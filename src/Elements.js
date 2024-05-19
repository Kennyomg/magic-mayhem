export class Elements {
  static applyOn(id, cb) {
    if (!((id && (typeof id === 'string' || (Array.isArray(id) && id.length > 0))) && cb && typeof cb === 'function')) {
      throw new Error('Invalid arguments, (id: string | string[]) and (cb: function) are required');
    }

    if (Array.isArray(id)) {
      id.forEach(i => this.applyOn(i, cb));
      return;
    }

    const el = document.getElementById(id);
    if (el) {
      cb(el, id);
    } else {
      console.warn(`Element with id ${id} not found`);
    }
  }

  static applyOnAll(selector, cb) {
    if (!(((selector && typeof selector === 'string') || (Array.isArray(selector) && selector.length > 0)) && cb && typeof cb === 'function')) {
      throw new Error('Invalid arguments, (selector: string | string[]) and (cb: function) are required');
    }

    if (Array.isArray(selector)) {
      selector.forEach(s => this.applyOnAll(s, cb));
      return;
    }

    const els = document.querySelectorAll(selector);
    if (els.length) {
      els.forEach(cb);
    } else {
      console.warn(`Elements with selector ${selector} not found`);
    }
  }

  static findId(id) {
    if (!(id && (typeof id === 'string' || (Array.isArray(id) && id.length > 0)))) {
      throw new Error('Invalid arguments, (id: string) is required');
    }

    if (Array.isArray(id)) {
      return id.map(i => this.findId(i));
    }

    const el = document.getElementById(id);
    if (el) {
      return el;
    } else {
      console.warn(`Element with id ${id} not found`);
    }
  }
}