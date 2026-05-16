---
description: Fixes or adds features by defining Interfaces and Tests BEFORE logic.
---

# Reverse-Architecture Workflow

1. **Input**: Ask the user for the specific Issue ID or Feature to implement.
2. **Phase 1: Interface**: Define a strict TypeScript Interface or Pydantic Model for the task. Ensure it follows SRP. 
    - *Action*: Present this to the user for approval.
3. **Phase 2: Contract**: Write the Vitest/Jest unit test for this interface. 
    - *Rule*: The test must fail (Red phase) because the logic doesn't exist yet.
4. **Phase 3: Implementation**: Only once the test is approved, write the minimum code necessary to pass the test. Under no condition are you allowed to alter the tests written in Phase 2. The tests written in Phase 2 are immutable.
5. **Phase 4: Cleanup**: Update `SYMBOLS.md` to reflect the change and ensure zero DRY violations. Update `AGENTS.md` and `RULES.md`. Push to GIT