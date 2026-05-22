Feature: Finance (Ledger Bridge)
  As a financial controller
  I want procurement events to sync with finance
  So that I can maintain real-time AP tracking

  Scenario: Automatic Invoice Generation from PO
    Given a 'PROCUREMENT_RECEIVED' event is emitted to the outbox for a PO of 150.00 EUR
    When the Bridge Trigger executes
    Then a new 'PENDING' Invoice should appear in Finance
    And it should match the PO total and currency

  Scenario: Auditable Transaction Edits
    Given an existing transaction with ID "txn-123" and amount 100.00
    When the transaction is updated with new amount 200.00
    Then the updated transaction must include a valid "updated_at" timestamp
