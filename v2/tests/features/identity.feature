Feature: Identity & Access (The Gatekeeper)
  As a system administrator
  I want to ensure staff can access their tenants seamlessly
  So that I can minimize friction during onboarding

  Scenario: Auto-linking Staff to Tenant
    Given an admin has added "staff@acme.com" to the "Acme Corp" staff list
    When the user logs in with "staff@acme.com"
    Then the Identity Gate should skip the Access Code screen
    And they should be auto-linked to "Acme Corp"
