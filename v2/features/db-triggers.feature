Feature: Database Triggers for Event Log

  Background:
    Given the test tenant "tenant-abc" exists
    And the event_log table is clear for the test tenant

  Scenario: Legacy transaction insert trigger inserts into event_log
    When a transaction is inserted via direct DML
    Then an event "transaction.created" should be recorded in event_log
    And the event who_id should be NULL
    And the event who_type should be "system"

  Scenario: Legacy transaction delete trigger inserts into event_log
    When a transaction is deleted via direct DML
    Then an event "transaction.deleted" should be recorded in event_log
    And the event who_id should be NULL
    And the event who_type should be "system"

  Scenario: Legacy inventory ledger triggers insert into event_log
    When an inventory_ledger record is inserted via direct DML
    Then an event "inventory_adjustment.logged" should be recorded in event_log
    And the event who_id should be NULL
    And the event who_type should be "system"

  Scenario: resolve_purchase_quarantine_v1 ignores missing user ID parameter
    When I call resolve_purchase_quarantine_v1 with status "RELEASED"
    Then the purchase_orders status should be "RELEASED"
    And no error regarding "reviewed_by" parameter should be thrown
