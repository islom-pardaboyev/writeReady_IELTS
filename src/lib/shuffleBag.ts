function shuffle<T>(items: T[]): T[] {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Hands out items in random order without repeats until every item in the
 * pool has been shown once, then reshuffles for the next pass. Unlike
 * independent Math.random() draws, this guarantees every item (including
 * ones just added to the pool) gets picked within one full cycle, and never
 * repeats the same item twice in a row.
 */
export class ShuffleBag<T> {
  private items: T[] = [];
  private queue: T[] = [];
  private last: T | null = null;

  setItems(items: T[]): void {
    this.items = items;
    this.queue = this.queue.filter((item) => items.includes(item));
  }

  next(): T | null {
    if (this.items.length === 0) return null;
    if (this.items.length === 1) {
      this.last = this.items[0];
      return this.last;
    }
    if (this.queue.length === 0) {
      const reshuffled = shuffle(this.items).filter((item) => item !== this.last);
      this.queue = reshuffled.length > 0 ? reshuffled : shuffle(this.items);
    }
    const picked = this.queue.pop()!;
    this.last = picked;
    return picked;
  }
}
