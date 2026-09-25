import React from 'react';

/** Small native-host harness for production hooks/controls, without a browser DOM. */
export function nativeHooks() {
  const components = new Map<string, { slots: any[]; cleanups: (() => void)[] }>();
  let current: { slots: any[]; cleanups: (() => void)[] }, cursor = 0, dirty = false;
  let tree: React.ReactNode, output: React.ReactElement<any>[] = [];
  const pending: (() => void)[] = [];
  const mounted = new Set<string>();
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    ...React,
    use(context: any) { return context._currentValue; },
    useState(initial: any) {
      const owner = current, index = cursor++;
      if (!(index in owner.slots)) owner.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.slots[index], (value: any) => {
        const next = typeof value === 'function' ? value(owner.slots[index]) : value;
        if (!Object.is(next, owner.slots[index])) { owner.slots[index] = next; dirty = true; }
      }];
    },
    useRef(value: any) { const index = cursor++; return current.slots[index] ??= { current: value }; },
    useMemo(fn: () => any, deps: unknown[]) {
      const index = cursor++, previous = current.slots[index];
      if (!previous || !same(previous.deps, deps)) current.slots[index] = { deps, value: fn() };
      return current.slots[index].value;
    },
    useCallback(fn: any, deps: unknown[]) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn: () => any, deps?: unknown[]) {
      const owner = current, index = cursor++, previous = owner.slots[index];
      if (!previous || !same(previous.deps, deps)) {
        owner.slots[index] = { deps };
        pending.push(() => { owner.cleanups[index]?.(); owner.cleanups[index] = fn(); });
      }
    },
    useLayoutEffect(fn: () => any, deps?: unknown[]) { hooks.useEffect(fn, deps); },
    useSyncExternalStore(subscribe: (fn: () => void) => () => void, snapshot: () => any) {
      hooks.useEffect(() => subscribe(() => { dirty = true; }), [subscribe]);
      return snapshot();
    },
  };
  function visit(node: React.ReactNode, path: string) {
    if (Array.isArray(node)) { node.forEach((child, i) => visit(child, `${path}/${i}`)); return; }
    if (!React.isValidElement<any>(node)) return;
    const props = node.props as any;
    if (node.type === React.Fragment) { visit(props.children, path + '/fragment'); return; }
    if (typeof node.type === 'object' && (node.type as any).$$typeof === Symbol.for('react.context')) {
      const context = node.type as any, previous = context._currentValue;
      context._currentValue = props.value;
      visit(props.children, path + '/context'); context._currentValue = previous; return;
    }
    if (typeof node.type === 'function') {
      const id = `${path}/${node.type.name}:${node.key ?? ''}`;
      mounted.add(id);
      current = components.get(id) ?? { slots: [], cleanups: [] };
      components.set(id, current); cursor = 0;
      visit((node.type as (props: any) => React.ReactNode)(props), id);
    } else {
      output.push(node); visit(props.children, path + '/children');
    }
  }
  function flush() {
    for (let pass = 0; pass < 30; pass++) {
      dirty = false; output = []; mounted.clear(); visit(tree, 'root');
      for (const [id, owner] of components) if (!mounted.has(id)) {
        owner.cleanups.forEach(fn => fn?.()); components.delete(id);
      }
      pending.splice(0).forEach(fn => fn());
      if (!dirty) return output;
    }
    throw Error('Native hook render did not settle.');
  }
  return { hooks, flush, render(value: React.ReactNode) { tree = value; return flush(); },
    find(label: string) {
      const node = flush().find(node => node.props.accessibilityLabel === label);
      if (!node) throw Error(`Missing native control: ${label}`);
      return node.props;
    },
    dispose() { components.forEach(owner => owner.cleanups.forEach(fn => fn?.())); } };
}
