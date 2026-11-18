import { describe, it, expect } from 'vitest';
import { replaceById, removeById, restoreAt } from './listCache';

const a = { id: 'a', v: 1 };
const b = { id: 'b', v: 2 };
const c = { id: 'c', v: 3 };

describe('listCache', () => {
  it('replaces by id and leaves a missing item missing', () => {
    expect(replaceById([a, b], { id: 'b', v: 9 })).toEqual([a, { id: 'b', v: 9 }]);
    expect(replaceById([a], { id: 'b', v: 9 })).toEqual([a]);
  });

  it('removes by id and reports where it was', () => {
    expect(removeById([a, b, c], 'b')).toEqual({ list: [a, c], removed: b, index: 1 });
    expect(removeById([a], 'x')).toEqual({ list: [a], index: -1 });
  });

  it('puts an item back where it was, once', () => {
    const { list, removed, index } = removeById([a, b, c], 'b');
    expect(restoreAt(list, removed!, index)).toEqual([a, b, c]);
    expect(restoreAt([a, b, c], b, 1)).toEqual([a, b, c]); // already back: no duplicate
    expect(restoreAt([a], c, 7)).toEqual([a, c]);
  });

  it('a rollback keeps another change that landed meanwhile', () => {
    // Optimistic edit of b, then a separate save changes a, then b's save fails.
    const optimistic = replaceById([a, b], { id: 'b', v: 20 });
    const meanwhile = replaceById(optimistic, { id: 'a', v: 10 });
    expect(replaceById(meanwhile, b)).toEqual([{ id: 'a', v: 10 }, b]);
  });
});
