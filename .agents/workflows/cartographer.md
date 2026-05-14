---
description: Maps the codebase, identifies features, and maintains a symbol map to enforce DRY/SOLID
---

# System Cartographer Workflow

1. **Discovery**: Read the current file tree of the `v2/` directory.
2. **Context**: Analyze `AGENTS.md` and `audit_report.md` to understand the current engineering state.
3. **Extraction**: Identify all unique TypeScript Interfaces, Pydantic Models, and shared Utility functions.
4. **Documentation**: Create (or overwrite) a file in the root called `SYMBOLS.md`. 
    - Format: Group by "Domain" (e.g., Auth, Inventory, AI, Receipt Processing).
    - Content: List function/class names and a 1-sentence description of their responsibility.
5. **Report**: Summarize the findings in the chat and flag any "God Classes" that violate SOLID.