Feature: FCV Quarantine & POS Enrichment Pipeline
  As a financial controller
  I want auto-released quarantines and enriched POS data
  So that the Food Cost Variance report reflects accurate actual-to-theoretical cost comparisons

  Scenario: Cron Release of Expired Quarantines
    Given purchases with quarantine_status 'PENDING' created 31 days ago exist in the database
    When the release_expired_quarantines_v1 RPC is executed
    Then it returns released_purchases matching the count of expired rows
    And it returns released_pending matching the count of resolved anomaly queue rows

  @skip-until-ims
  Scenario: POS Enrichment with Lazy Cache Backfill
    Given POS sales are staged in pos_transaction_staging without theoretical_grams
    And cached_recipes are available for the tenant
    When the FCV route processes the staging rows
    Then theoretical_grams are populated from matched recipes
    And the FCV report includes the enriched ingredient data
