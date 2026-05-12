Feature: Logistics (IMS)
  As a logistics manager
  I want to track inventory and procurement
  So that I can maintain physical stock control

  Scenario: Processing a Purchase Order Receipt
    Given a Purchase Order with 10 units of "Coffee Beans" is marked as RECEIVED
    When I check the Inventory Ledger
    Then I should see a new 'RECEIPT' entry for 10 units
    And the total stock should increase accordingly
