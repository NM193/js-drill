// Deli ga Node (self-validacija pri generisanju) i browser (resavanje na telefonu).
// Ista logika na obe strane - inace bi se razisle i self-validacija ne bi znacila nista.

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

const show = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'function') return value.name ? `[Function: ${value.name}]` : '[Function]';
  try {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  } catch {
    return String(value);
  }
};

function deepEq(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.hasOwn(b, key) && deepEq(a[key], b[key]));
}

export const assert = {
  ok(value, message) {
    if (!value) {
      throw new AssertionError(message ?? `ocekivano istinito, dobijeno ${show(value)}`);
    }
  },

  // Object.is, ne ===. NaN i -0 su teme iz bank.md, pa bi === pravio
  // testove koji lazu bas na temi koju vezbas.
  equal(actual, expected, message) {
    if (!Object.is(actual, expected)) {
      throw new AssertionError(message ?? `ocekivano ${show(expected)}, dobijeno ${show(actual)}`);
    }
  },

  deepEqual(actual, expected, message) {
    if (!deepEq(actual, expected)) {
      throw new AssertionError(message ?? `ocekivano ${show(expected)}, dobijeno ${show(actual)}`);
    }
  },

  throws(fn, message) {
    try {
      fn();
    } catch {
      return;
    }
    throw new AssertionError(message ?? 'ocekivana greska, nista nije baceno');
  },
};
