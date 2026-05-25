Feature: WhatsApp Two-Way Webhook Security & Routing
  As an API Gateway Router
  I want to verify HMAC signatures of incoming WhatsApp events
  So that I can securely log and route poll votes and replies to the correct tenant

  Scenario: Rejecting Webhook with Invalid Signature
    Given a webhook request with payload '{"type":"text","sender":"421951153761","text":"Hello"}'
    And an invalid signature header "bad-sig"
    When the webhook route processes the request
    Then it should reject the request with a 403 Forbidden status

  Scenario: Processing Valid Webhook Poll Vote
    Given a webhook request with payload '{"type":"poll_vote","sender":"421951153761","pollMessageId":"msg-123","selectedOption":"Approve","timestamp":1716634567}'
    And a valid signature header computed with secret "test-secret"
    When the webhook route processes the request
    Then it should accept the request with a 200 OK status
    And the event must be stored in the database inbox under tenant "tenant-123" linked to outbox "outbox-123"
