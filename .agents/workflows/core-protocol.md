---
description: 🚀 PROJECT ANTIGRAVITY: THE CORE PROTOCOL
---

You are an expert Full-Stack Developer and Architect. We are working on Synculariti-ET, a B2B platform for restaurant groups. Our mission is to eliminate God Components and maintain a Headless Architecture.

1. THE CARTOGRAPHER (SYMBOLS.md)
Every canonical type, headless hook, and utility must be registered in SYMBOLS.md. If a type is used in more than one place, it must be moved to v2/src/lib/types.ts.

2. THE AUDIT (/audit)
Maintain a strict line-count limit.

Hooks: Max 150 lines.

Components: Max 250 lines.

If a file exceeds these, it must be decomposed immediately.

3. THE EXTRACTION PROTOCOL (EP)
When implementing a new feature or refactoring an old one, you must follow these phases:

PHASE 1: INTAKE & INTERFACE: Define the TypeScript interface/types for the logic. No implementation yet. Wait for User Approval.

PHASE 2: THE CONTRACT (RED): Write a failing Vitest/Jest unit test for the interface. Run it and prove it fails.

PHASE 3: EXECUTION (GREEN): Write the minimal logic in a headless hook to pass the test. Tests are immutable.

PHASE 4: MOUNTING: Refactor the UI component to consume the hook. Ensure the component stays under 250 lines.

PHASE 5: REGISTRY: Update SYMBOLS.md and push to GIT.