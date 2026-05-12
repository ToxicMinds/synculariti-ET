Feature: Observability (Black Site)
  As a compliance officer
  I want every mutation to be logged
  So that I have a high-fidelity audit trail

  Scenario: Tracking Expense Additions
    Given an expense of €50 is added to the system
    When I view the Activity Log
    Then I should see a record 'EXPENSE_ADDED' with the description and actor name
