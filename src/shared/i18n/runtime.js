import { messages, patterns } from './messages.js';

export const LANGUAGE_KEY = 'bms-language';
const supported = (value) => value === 'id' || value === 'en';
const normalize = (value) => value.replace(/\s+/g, ' ').trim();
const dictionary = new Map();
for (const [en, id] of messages) {
  const entry = { en, id };
  dictionary.set(normalize(en), entry);
  dictionary.set(normalize(id), entry);
}
for (const [en, id] of messages) {
  for (const form of ['toUpperCase', 'toLowerCase']) {
    const entry = { en: en[form](), id: id[form]() };
    for (const phrase of Object.values(entry))
      if (!dictionary.has(normalize(phrase))) dictionary.set(normalize(phrase), entry);
  }
}
const templates = patterns.flatMap(([en, id]) =>
  [en, id].map((source) => {
    const parts = source.split(/(\{\d+\})/g),
      indices = [];
    const expression = parts
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          indices.push(part);
          return '(.+?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { regex: new RegExp('^' + expression + '$'), indices, en, id };
  }),
);
const readLanguage = () => {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    return supported(saved) ? saved : 'id';
  } catch {
    return 'id';
  }
};
let language = typeof window === 'undefined' ? 'id' : readLanguage();
const listeners = new Set();
export const getLanguage = () => language;
export const getLocale = () => (language === 'id' ? 'id-ID' : 'en-GB');
export const subscribeLanguage = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Exact UI phrases only. Never translate arbitrary words inside names, URLs or payloads. */
export function t(source, selectedLanguage = language) {
  if (typeof source !== 'string') return source;
  if (!supported(selectedLanguage)) return source;
  const normalized = normalize(source);
  if (!/[a-zA-Z]/.test(normalized)) return source;
  let translated = dictionary.get(normalized)?.[selectedLanguage];
  if (translated === undefined)
    for (const template of templates) {
      const match = template.regex.exec(normalized);
      if (!match) continue;
      const parameters = Object.fromEntries(
        template.indices.map((key, index) => [key, match[index + 1]]),
      );
      translated = template[selectedLanguage].replace(/\{\d+\}/g, (key) => parameters[key] ?? key);
      break;
    }
  return translated === undefined ? source : source.replace(/\S[\s\S]*\S|\S/, () => translated);
}

const attributes = ['title', 'aria-label', 'placeholder', 'alt'];
const excluded =
  'script,style,noscript,textarea,input,pre,code,svg,canvas,[contenteditable="true"],[translate="no"],[data-i18n-skip]';
// Display-only adapter for the React shell, native MapLibre controls and legacy camera
// templates. Keep original Text nodes in place: React owns their identity and structure.
export function localizeDocument(doc = document) {
  const originals = new WeakMap();
  const eligible = (element) => element && !element.closest(excluded);
  function translate(node, attribute) {
    const current = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (current === null) return;
    let slots = originals.get(node);
    if (!slots) {
      slots = new Map();
      originals.set(node, slots);
    }
    const key = attribute || 'text';
    const saved = slots.get(key);
    const source = saved && saved.result === current ? saved.source : current;
    const result = t(source);
    slots.set(key, { source, result });
    if (current === result) return;
    if (attribute) node.setAttribute(attribute, result);
    else node.nodeValue = result;
  }
  function visit(node) {
    if (node.nodeType === 3) {
      const parent = node.parentElement;
      if (!eligible(parent)) return;
      // An option without value uses its text as the submitted value. Leave it intact.
      if (parent.tagName === 'OPTION' && !parent.hasAttribute('value')) return;
      translate(node);
    } else if (node.nodeType === 1) {
      // Inputs retain user values; only their UI attributes are translated.
      if (node.closest('[translate="no"],[data-i18n-skip],[contenteditable="true"]')) return;
      for (const attribute of attributes)
        if (node.hasAttribute(attribute)) translate(node, attribute);
      if (!eligible(node)) return;
      for (const child of node.childNodes) visit(child);
    }
  }
  const refresh = () => {
    doc.documentElement.lang = language;
    visit(doc.body);
  };
  const observer = new MutationObserver((records) => {
    const roots = new Set();
    for (const record of records) {
      if (record.type === 'childList') for (const node of record.addedNodes) roots.add(node);
      else roots.add(record.target);
    }
    for (const node of roots) if (node.isConnected) visit(node);
  });
  refresh();
  observer.observe(doc.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: attributes,
  });
  const unsubscribe = subscribeLanguage(refresh);
  return () => {
    observer.disconnect();
    unsubscribe();
  };
}

function notifyWindows() {
  const payload = { type: 'bms:language', language };
  for (const frame of document.querySelectorAll('iframe'))
    frame.contentWindow?.postMessage(payload, location.origin);
}
export function setLanguage(value) {
  if (!supported(value)) return;
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
  } catch {
    /* Session choice still works. */
  }
  applyLanguage(value);
  notifyWindows();
}
function applyLanguage(value) {
  if (!supported(value) || language === value) return;
  language = value;
  for (const listener of listeners) listener();
}
if (typeof window !== 'undefined') {
  document.documentElement.lang = language;
  window.addEventListener('storage', (event) => {
    if (event.key === LANGUAGE_KEY || event.key === null) applyLanguage(readLanguage());
  });
  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const fromParent = window.parent !== window && event.source === window.parent;
    const fromChild = [...document.querySelectorAll('iframe')].some(
      (frame) => frame.contentWindow === event.source,
    );
    if (event.data?.type === 'bms:language' && fromParent) applyLanguage(event.data.language);
    if (event.data?.type === 'bms:language-request' && fromChild) notifyWindows();
  });
  if (window.parent !== window)
    window.parent.postMessage({ type: 'bms:language-request' }, location.origin);
}
