---
name: groq-prompt-engineering
description: How to call the Groq API in Synculariti-ET without hallucination. Use when writing or modifying any AI/LLM integration — insights, categorization, receipt parsing, or market trends.
---

# Groq Prompt Engineering

## When to Use
Any time you write, modify, or debug a Groq (Llama 3.3) integration.

## The #1 Rule Against Hallucination
> **Always inject the household's category list into every prompt.** Never let Groq invent categories. If you don't constrain the output, it will hallucinate category names that don't exist in the system.

```typescript
// ✅ Correct — categories are constrained
const categories = household.categories; // From HouseholdContext, never hardcoded
const prompt = `
Categorize this expense. You MUST use ONLY one of these categories:
${categories.join(', ')}

Expense description: "${description}"
Amount: ${amount} EUR

Respond with ONLY the category name, nothing else.
`;
```

## Model Configuration
```typescript
import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY }); // Server-side ONLY

const response = await groq.chat.completions.create({
  model: 'llama-3.3-70b-versatile', // Current canonical model
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.1,   // Low for deterministic categorization
  max_tokens: 150,    // Keep tight — prevents runaway responses
});
```

## AI Insights Cache (TTL Strategy)
AI Insights are **shared across the household** to minimize Groq API cost.

```typescript
// Only call Groq if data has changed
const dataHash = `${totalAmount}-${expenseCount}`; // Simple determinism signal
const cached = household.ai_insight;

if (cached?.dataHash === dataHash && cached?.generatedAt) {
  const age = Date.now() - new Date(cached.generatedAt).getTime();
  if (age < 24 * 60 * 60 * 1000) {
    return cached; // Use cache — don't call Groq
  }
}
// Call Groq and store result with dataHash + generatedAt
```

## Receipt Parsing Prompt Pattern
When asking Groq to parse a receipt:

```typescript
const prompt = `
You are a financial data extractor. Extract structured data from this receipt text.

RULES:
- Use ONLY these categories: ${categories.join(', ')}
- currency must be a 3-letter ISO-4217 code (e.g. "EUR", "CZK")  
- amount must be a number, not a string
- date must be YYYY-MM-DD format
- If you cannot determine a field with confidence, use null — do NOT guess

Receipt text:
"""
${receiptText}
"""

Respond with ONLY valid JSON matching this schema:
{
  "store": string,
  "date": string,
  "total": number,
  "currency": string,
  "items": [{ "name": string, "amount": number, "category": string }]
}
`;
```

## Response Validation (Never Trust Raw Output)
```typescript
const raw = response.choices[0]?.message?.content ?? '';

// 1. Extract JSON defensively
const jsonMatch = raw.match(/\{[\s\S]*\}/);
if (!jsonMatch) throw new Error('Groq returned non-JSON response');

const parsed = JSON.parse(jsonMatch[0]);

// 2. Validate critical fields
if (typeof parsed.total !== 'number') throw new Error('Invalid total');
if (parsed.currency?.length !== 3) throw new Error('Invalid currency');

// 3. Sanitize categories against the allowed list
parsed.items = parsed.items.map(item => ({
  ...item,
  category: categories.includes(item.category) ? item.category : 'Other'
}));
```

## eKasa-Specific: Merchant Name Extraction
When Groq is used to extract merchant names from OKP raw data:
```typescript
// Provide IČO/DIČ context if available — dramatically improves accuracy
const prompt = `
Extract the merchant/store name from this Slovak fiscal receipt data.
IČO: ${ico || 'not available'}
DIČ: ${dic || 'not available'}
Raw data: ${rawData}

Return ONLY the merchant name, nothing else. If unknown, return "Unknown Merchant".
`;
```

## Error Handling
```typescript
try {
  const result = await groq.chat.completions.create(...);
  // process...
} catch (err) {
  Logger.system('ERROR', 'AI', 'Groq API call failed', { error: err }, householdId);
  // Surface non-technical message to user:
  throw new Error('AI insights temporarily unavailable. Your data is safe.');
}
```

## What NOT to Do
- ❌ `temperature: 1.0` — too random for financial categorization
- ❌ Storing raw Groq output directly to DB without validation
- ❌ Calling Groq from client-side code — API key exposure
- ❌ Omitting category list — the #1 cause of hallucinated categories
- ❌ Trusting `parsed.category` without checking it's in `household.categories`
- ❌ Calling Groq on every render — always check TTL/cache first
