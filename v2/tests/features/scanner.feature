Feature: Scanner — Unified Receipt Processing Pipeline

  Scenario: eKasa QR scan returns verified receipt with enrichment
    Given a valid eKasa QR code string
    When the scanner processes the input
    Then it should return a successful result with source "EKASA"
    And the receipt should be linked to the correct store
    And items should have AI-assigned categories from enrichment

  Scenario: Invoice image scan returns estimated receipt with preprocessing
    Given a valid invoice image file
    When the scanner processes the input
    Then it should return a successful result with source "AI_VISION"
    And the image should be preprocessed before AI extraction
    And the receipt should be marked as estimated (not verified)

  Scenario: Preprocessing failure degrades gracefully
    Given a valid invoice image file
    And the preprocess endpoint is unavailable
    When the scanner processes the input
    Then it should still succeed using the original image
    And the receipt should be marked as estimated

  Scenario: Non-financial document is rejected by AI triage
    Given a non-financial image file
    When the scanner processes the input
    Then it should return an error with message "Invalid Document"

  Scenario: Duplicate scan is served from cache
    Given a valid eKasa QR code string
    When the scanner processes the same input twice
    Then the second call should not make any network requests

  Scenario: Offline scan is queued for later processing
    Given the device is offline
    When the scanner processes a receipt
    Then it should return status "QUEUED" without making network calls

  Scenario: Network timeout falls back to manual entry
    Given a valid eKasa QR code string
    And the network request hangs indefinitely
    When the scanner processes the input
    Then it should return an error with message "timed out"
    And the source should be "MANUAL"

  Scenario: AI items carry confidence levels from extraction
    Given a valid invoice image file
    When the scanner processes an image with mixed legibility
    Then items should have "high" or "medium" confidence from AI
    And items with amount zero should be downgraded to "low"

  Scenario: eKasa items always have high confidence
    Given a valid eKasa QR code string
    When the scanner processes the input
    Then all items should have confidence "high"

  Scenario: Confident source label shows verified status in UI
    Given a valid eKasa QR code string
    When the scanner processes the input
    Then the result should include confidence levels for all items
