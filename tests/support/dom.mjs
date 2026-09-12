// Minimal DOM adapter for exercising the app's handlers without a browser or network.
export class Element {
  constructor(tag = "div", attributes = {}, parent = null) {
    this.tagName = tag.toUpperCase();
    this.attributes = attributes;
    this.id = attributes.id || "";
    this.parent = parent;
    this.value = attributes.value || "";
    this.checked = "checked" in attributes;
    this.hidden = "hidden" in attributes;
    this.disabled = "disabled" in attributes;
    this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase()), value]));
    this.innerHTML = "";
    this.textContent = "";
    this.children = [];
    this.handlers = new Map();
    const classes = new Set((attributes.class || "").split(/\s+/).filter(Boolean));
    this.classList = {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name),
      toggle: (name, active = !classes.has(name)) => active ? classes.add(name) : classes.delete(name)
    };
  }
  addEventListener(type, listener) {
    const listeners = this.handlers.get(type) || [];
    listeners.push(listener);
    this.handlers.set(type, listeners);
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }
  removeAttribute(name) {
    delete this.attributes[name];
  }
  async emit(type, event = {}) {
    for (const handler of this.handlers.get(type) || []) await handler({ target: this, preventDefault() {}, ...event });
  }
  matches(selector) {
    if (selector.includes(",")) return selector.split(",").some(part => this.matches(part.trim()));
    if (selector.endsWith(":checked")) return this.checked && this.matches(selector.slice(0, -8));
    if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
    if (selector.startsWith("#")) return this.id === selector.slice(1);
    const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
    return attribute ? attribute[1] in this.attributes && (attribute[2] === undefined || this.attributes[attribute[1]] === attribute[2]) : this.tagName.toLowerCase() === selector;
  }
  closest(selector) { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
  querySelectorAll(selector) { return parseElements(this.innerHTML, this).filter(element => element.matches(selector)); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  appendChild(child) { this.children.push(child); }
  append(child) { this.appendChild(child); }
  replaceChildren() { this.children = []; }
  focus() {}
  scrollIntoView() {}
  reset() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

export function parseElements(html, parent = null) {
  return [...html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)].map(([, tag, raw]) => {
    const attributes = Object.fromEntries([...raw.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map(([, key, quoted, single, unquoted]) => [key, quoted ?? single ?? unquoted ?? ""]));
    return new Element(tag, attributes, parent);
  });
}

export function createDocument(html) {
  const elements = parseElements(html);
  return {
    getElementById: id => elements.find(element => element.id === id) || null,
    querySelectorAll: selector => elements.filter(element => element.matches(selector)),
    querySelector: selector => elements.find(element => element.matches(selector)) || null,
    createElement: tag => new Element(tag)
  };
}

export function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}
