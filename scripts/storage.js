import genUuid from "./uuid.js";
import Eventually from "./eventually.js";

export class TraceStorage {
  constructor(store)  {
    this.storage = store;
  }
  getItem(key) {
    console.log("Get", key);
    return this.storage.getItem(key);
  }
  setItem(key, value) {
    console.log("Store", key);
    return this.storage.setItem(key, value);
  }
}

export class ScopedStorage {
  constructor(storage, root, binder) {
    this.storage = storage;
    this.root = root;
    this.binder = binder
  }
  makeKey(key) {
    if (key !== undefined && key !== null && '' !== key) {
      return (this.root? this.root + '.': '') + key;
    }
    return this.root;
  }
  getItem(key) {
    return this.storage.getItem(this.makeKey(key));
  }
  setItem(key, value) {
    return this.storage.setItem(this.makeKey(key), value);
  }

  subScope(subscope) {
    return new ScopedStorage(this.storage, this.root + '.' + subscope, this.binder);
  }

  bind(key, target) {
    this.binder.bind(this.makeKey(key), target);
  }
  unbind(key, target) {
    this.binder.unbind(this.makeKey(key), target);
  }
}


// Bind things to get notified of changes to storage by a key prefix. The
// prefix uses . separated name spaces. Partial names are not prefixes.
export class BindingStorage {
  constructor(storage) {
    this.storage = storage;
    // keyprefix -> handler
    this.registry = {};
    // mutated keys -> true
    this.pendingKeys = {};
    this.eventuallyResolve = new Eventually(333, () => this.resolve());
  }

  handleEvent(event) {
    const find = (x) => 'storage' in x ? find(x.storage) : x;
    if (event.storageArea === find(this.storage)) {
      this.pendingKeys[event.key] = true;
      this.eventuallyResolve.reset();
    }
  }

  listen() {
    window.addEventListener('storage', this);
  }

  unlisten() {
    window.removeEventListener('storage', this);
  }

  bind(prefix, target) {
    console.log("Binding", prefix, "to", target);
    this.registry[prefix] = target;
  }

  unbind(prefix, target) {
    if (this.registry[prefix] === target) {
      this.registry[prefix] = undefined;
    }
  }

  resolve() {
    for (let key in this.pendingKeys) {
      let route = key.split('.');
      for (let i = route.length; i >= 0; --i) {
        let prefix = route.slice(0, i).join('.');
        let suffix = route.slice(i).join('.');
        let target = this.registry[prefix];
        if (target) {
          target.load(this.subScope(prefix), suffix);
        }
      }
    }
    this.pendingKeys = {};
  }
  
  subScope(subscope) {
    return new ScopedStorage(this.storage, subscope, this);
  }
};
