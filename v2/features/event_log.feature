Feature: Event Logging and Audit Architecture

  Background:
    Given a clean database state
    And an active tenant "T-01" with a team member "User-01"

  # SECURITY: Direct DML
  Scenario: Standard roles cannot insert directly into the event_log table
    When "User-01" attempts to execute a direct INSERT into the "event_log" table
    Then the database should reject the insert with a permission denied error

  # SECURITY: Immutability
  Scenario: Event records are strictly immutable
    Given an existing event log record with ID "E-100"
    When "User-01" attempts to execute a direct UPDATE on "E-100" in the "event_log" table
    Then the database should reject the update
    When "User-01" attempts to execute a direct DELETE on "E-100" in the "event_log" table
    Then the database should reject the delete

  # POSITIVE PATH: RPC Execution
  Scenario: System successfully records a business event via the RPC
    When "User-01" invokes the "record_event_v1" RPC with action "transaction.created"
    Then the "event_log" table should contain exactly 1 row for "transaction.created"
    And the recorded event should have "tenant_id" equal to "T-01"
    And the recorded event should have "who_id" equal to "User-01"
    And the recorded event should have "who_type" equal to "user"

  # POSITIVE PATH: Server vs Client invocation
  Scenario: Server actions can record events using system identity
    When the system invokes the "record_event_v1" RPC with action "workflow.triggered" and who_type "system"
    Then the recorded event should have "who_type" equal to "system"
    And the recorded event should have "who_id" equal to null

  # NEGATIVE PATH: Schema constraints
  Scenario: The system validates metadata schema correctly
    When "User-01" invokes the "record_event_v1" RPC with valid metadata
    Then the event is recorded successfully
    When "User-01" invokes the "record_event_v1" RPC with an array metadata instead of an object
    Then the RPC should reject the metadata payload

  # NEGATIVE PATH: Action constraint
  Scenario: The system rejects unregistered event actions
    When "User-01" invokes the "record_event_v1" RPC with an unknown action "rogue.action"
    Then the RPC should fail with a check constraint violation

  # PERFORMANCE: Timeboxing
  Scenario: Querying event timeline is highly performant
    Given 1000 events exist for tenant "T-01"
    When the system queries the events timeline for "T-01"
    Then the query should return within 100 milliseconds
