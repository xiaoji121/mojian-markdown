// @ts-nocheck

export function applyPrototypeMethods(target, ...methodClasses) {
  methodClasses.forEach((methodClass) => {
    Object.getOwnPropertyNames(methodClass.prototype).forEach((name) => {
      if (name === 'constructor') return;
      Object.defineProperty(
        target.prototype,
        name,
        Object.getOwnPropertyDescriptor(methodClass.prototype, name)
      );
    });
  });
}
