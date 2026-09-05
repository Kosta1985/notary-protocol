export function createCheckRunner() {
  const outcomes = new Map();
  const passed = [];
  const failures = [];
  const skipped = [];

  async function run(name, fn, dependencies = []) {
    const blockedBy = dependencies.filter((dependency) => outcomes.get(dependency) !== "passed");
    if (blockedBy.length) {
      outcomes.set(name, "skipped");
      skipped.push({ name, blocked_by: blockedBy });
      return undefined;
    }

    try {
      const value = await fn();
      outcomes.set(name, "passed");
      passed.push(name);
      return value;
    } catch (error) {
      outcomes.set(name, "failed");
      failures.push({
        name,
        error: error instanceof Error ? error.message : String(error)
      });
      return undefined;
    }
  }

  return {
    run,
    passed,
    failures,
    skipped,
    get ok() { return failures.length === 0; },
    outcome(name) { return outcomes.get(name); }
  };
}
