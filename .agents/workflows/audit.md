---
description: Evaluates the system for DRY, ACID, and SOLID violations using the SYMBOLS map.
---

# Structural Auditor Workflow

1. **Context Check**: Read `SYMBOLS.md` and `RULES.md` to refresh the "Source of Truth" and "Laws."
2. **Analysis**:
    - **DRY**: Search for logic in `v2/` that performs the same task in different files (e.g., multiple fetch wrappers).
    - **SOLID**: Identify any class over 200 lines or any function with more than 3 responsibilities (God Objects).
    - **ACID**: Audit the `save_receipt` and `inventory` update loops. Ensure they use the required Supabase RPCs and don't perform direct table mutations as warned in RULES.md.
3. **Outcome**: Generate a "Vulnerability Ledger" in the chat. 
    - Format: [ID] | Severity | Principle Violated | Location | Recommended Fix.
4. **Interactive**: Ask the user: "Which of these should we fix first using the Reverse-Architecture method?"