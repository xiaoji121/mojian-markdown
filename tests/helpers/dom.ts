// 单测共享的轻量 DOM 替身。单测不依赖浏览器环境：
// 需要哪个 DOM 能力，就在这里补一个最小实现，保持可控、可断言。

export function createRef<T>(current: T | null = null) {
  return { current };
}

export function createClassList() {
  const classes = new Set<string>();
  return {
    classes,
    add(...names: string[]) { names.forEach((name) => classes.add(name)); },
    remove(...names: string[]) { names.forEach((name) => classes.delete(name)); },
    toggle(name: string, force?: boolean) {
      const next = force ?? !classes.has(name);
      next ? classes.add(name) : classes.delete(name);
      return next;
    },
    contains(name: string) { return classes.has(name); }
  };
}

type Listener = (event: unknown) => void;

export function createStubElement() {
  const attributes = new Map<string, string>();
  const listeners = new Map<string, Listener[]>();
  return {
    attributes,
    classList: createClassList(),
    dataset: {} as Record<string, string>,
    style: {} as Record<string, string>,
    textContent: '',
    innerHTML: '',
    children: [] as unknown[],
    setAttribute(name: string, value: string) { attributes.set(name, String(value)); },
    getAttribute(name: string) { return attributes.has(name) ? attributes.get(name) : null; },
    removeAttribute(name: string) { attributes.delete(name); },
    appendChild(child: unknown) { this.children.push(child); return child; },
    querySelectorAll() { return [] as unknown[]; },
    querySelector() { return null; },
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
    dispatch(type: string, event: unknown = {}) {
      (listeners.get(type) ?? []).forEach((listener) => listener(event));
    }
  };
}

// textarea 替身：赋值 value 会把光标移到末尾，与真实 textarea 一致。
export function createSourceStub(value = '', selectionStart = 0, selectionEnd = selectionStart) {
  let currentValue = value;
  return {
    selectionStart,
    selectionEnd,
    scrollTop: 0,
    scrollLeft: 0,
    focusOptions: undefined as FocusOptions | undefined,
    get value() { return currentValue; },
    set value(next: string) {
      currentValue = next;
      this.selectionStart = next.length;
      this.selectionEnd = next.length;
    },
    setSelectionRange(start: number, end: number) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    focus(options?: FocusOptions) { this.focusOptions = options; }
  };
}

// 在 globalThis 上安装内存版 localStorage，返回恢复函数。用法：
//   const restore = installLocalStorageStub();
//   try { ... } finally { restore(); }
export function installLocalStorageStub(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial));
  const stub = {
    getItem(key: string) { return store.has(key) ? store.get(key)! : null; },
    setItem(key: string, value: string) { store.set(key, String(value)); },
    removeItem(key: string) { store.delete(key); },
    clear() { store.clear(); },
    get length() { return store.size; },
    key(index: number) { return [...store.keys()][index] ?? null; }
  };
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: stub, configurable: true });
  return () => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete (globalThis as Record<string, unknown>).localStorage;
  };
}
