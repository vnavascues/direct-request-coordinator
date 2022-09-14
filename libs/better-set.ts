export class BetterSet<v> extends Set<v> {
  difference(set: Set<v>) {
    const newSet = new Set<v>();
    for (const [value] of [...this.entries()]) {
      if (!set.has(value)) newSet.add(value);
    }
    return newSet;
  }

  filter(predicate: (v: v) => boolean) {
    const newSet = new BetterSet<v>();
    const entries = Array.from(this.entries());
    for (const [value] of entries) {
      if (predicate(value)) newSet.add(value);
    }
    return newSet;
  }

  intersection(set: Set<v>) {
    const newSet = new Set<v>();
    for (const [value] of [...this.entries()]) {
      if (set.has(value)) newSet.add(value);
    }
    return newSet;
  }

  isDisjoint(set: Set<v>) {
    const intersection = this.intersection(set);
    return !intersection.size;
  }

  isSubset(set: Set<v>) {
    for (const [value] of [...this.entries()]) {
      if (!set.has(value)) return false;
    }
    return true;
  }

  isSuperset(set: Set<v>) {
    for (const [value] of [...set.entries()]) {
      if (!this.has(value)) return false;
    }
    return true;
  }

  union(set: Set<v>) {
    const newSet = new Set<v>(this);
    for (const [value] of [...set.entries()]) {
      newSet.add(value);
    }
    return newSet;
  }
}
