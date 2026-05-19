# 🤖 AI-Powered Intelligent Gig Matching System

> Personalized gig recommendations for JobMe buyers, powered by **Groq / LLaMA 3.3-70b**.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Data Flow](#data-flow)
- [Backend Implementation](#backend-implementation)
  - [BuyerInteraction Model](#1-buyerinteraction-model)
  - [Recommendation Service](#2-recommendation-service)
  - [Recommendation Controller & Route](#3-recommendation-controller--route)
  - [Interaction Logging Hooks](#4-interaction-logging-hooks)
- [Frontend Implementation](#frontend-implementation)
  - [RecommendedGigs Component](#5-recommendedgigs-component)
  - [Browse Page Integration](#6-browse-page-integration)
  - [API Helper](#7-api-helper)
- [Cold Start Strategy](#cold-start-strategy)
- [Performance Design](#performance-design)
- [Files Changed](#files-changed)

---

## Overview

When a buyer searches for gigs, views a gig page, or places an order, the platform silently records that interaction. When the buyer returns to the **Browse** page (`/browse`), an AI engine reads their recent behavior, uses **Groq (LLaMA 3.3-70b)** to extract weighted preferences, and returns a ranked list of gigs personalized to them.

The section appears at the top of the browse page labeled based on data quality:

| Label | When it appears |
|---|---|
| ✨ **Recommended for You** | User has browsed/ordered — AI-ranked results |
| 🧭 **Based on Your Interests** | New user with `fieldsOfInterest` set during sign-up |
| 📈 **Trending Right Now** | Brand new user, no data — top-rated gigs |

If the user is **not logged in**, the section is completely invisible (renders `null`).

---

## How It Works

```
Buyer searches "logo design"
        ↓
GET /api/gigs?search=logo+design   ← existing endpoint
        ↓ (fire-and-forget, no await)
BuyerInteraction.create({ type:'search', query:'logo design' })

Buyer clicks a gig page
        ↓
GET /api/gigs/:gigId   ← existing endpoint
        ↓ (fire-and-forget, no await)
BuyerInteraction.create({ type:'view', gigId, category, tags })

Buyer places an order
        ↓
POST /api/orders   ← existing endpoint
        ↓ (fire-and-forget, no await)
BuyerInteraction.create({ type:'order', gigId, category, tags, weight:4 })

Buyer opens /browse
        ↓
<RecommendedGigs /> mounts → GET /api/recommendations
        ↓
recommendation.service reads last 30 interactions
        ↓
Builds a context string → sends to Groq/LLaMA 3.3
        ↓
LLaMA returns JSON: { categories, tags, categoryWeights, tagWeights }
        ↓
MongoDB query scores gigs using AI weights + platform quality signals
        ↓
Top 8 gigs returned → rendered in a glassmorphism card grid
```

---

## Architecture

```
RESTAPI/src/
├── models/
│   └── buyer-interaction.model.ts   ← NEW: logs behavior events
├── services/
│   └── recommendation.service.ts    ← NEW: AI + MongoDB scoring engine
├── controllers/
│   ├── recommendation.controller.ts ← NEW: GET /api/recommendations
│   ├── gig.controller.ts            ← MODIFIED: logs search + view
│   └── order.controller.ts          ← MODIFIED: logs orders
├── routes/
│   └── recommendation.routes.ts     ← NEW: protected route
└── app.ts                           ← MODIFIED: mounts the route

Frontend/app/(public)/
├── components/ui/
│   └── RecommendedGigs.tsx          ← NEW: self-contained UI section
├── browse/
│   ├── page.tsx                     ← MODIFIED: embeds <RecommendedGigs />
│   └── req-res.ts                   ← MODIFIED: adds getRecommendations()
```

---

## Data Flow

### Interaction Weights

Each event type is assigned a weight that reflects its importance as a preference signal:

| Interaction Type | Weight | Meaning |
|---|---|---|
| `order` | **4** | Strongest signal — buyer paid for this category |
| `save` | **3** | High intent — buyer bookmarked the gig |
| `search` | **2** | Medium signal — buyer expressed interest |
| `view` | **1** | Weak signal — browsed but may not have purchased |

### AI Scoring Pipeline

The recommendation service scores each candidate gig using a composite formula:

```
score = (categoryWeight × 10)
      + Σ(tagWeight × 5 for each gig tag)
      + (rating.average × 2)
      + log(1 + totalOrders) × 0.5
```

This blends:
- **AI-derived preference weights** (dominant factor)
- **Platform quality signals** (rating, order count) as tiebreakers

---

## Backend Implementation

### 1. BuyerInteraction Model

**File:** `src/models/buyer-interaction.model.ts`

A Mongoose schema that stores one document per buyer event:

```ts
{
  buyer:    ObjectId  // ref: User
  type:     'search' | 'order' | 'save' | 'view'
  query?:   string   // for type='search'
  gigId?:   ObjectId // for type='order'|'save'|'view'
  category?: string  // denormalized from Gig
  tags?:    string[] // denormalized from Gig / extracted from query
  weight:   number   // importance multiplier
  createdAt: Date
}
```

**Indexes:**
- `{ buyer: 1, createdAt: -1 }` — fast per-user history retrieval
- `{ createdAt: 1 }` with **TTL of 90 days** — auto-purges stale data, keeping the collection lean

---

### 2. Recommendation Service

**File:** `src/services/recommendation.service.ts`

The core intelligence of the system. Exports two functions:

#### `logInteraction(params)`

Fire-and-forget helper used by other controllers. Wraps `BuyerInteraction.create()` in a try/catch that **silently swallows errors** — it must never crash a primary endpoint.

```ts
void logInteraction({ buyerId, type: 'search', query: 'logo design' }).catch(() => {});
```

#### `getRecommendationsForBuyer(buyerId)`

The main pipeline:

1. **Fetch** the buyer's last 30 interactions from MongoDB, sorted by recency.
2. **Cold start check** — if 0 interactions, skip to fallback.
3. **Build a context string** from interactions, e.g.:
   ```
   [ORDER weight=4] | category: "Graphics & Design" | tags: [logo, branding]
   [SEARCH weight=2] | query: "logo design"
   [VIEW weight=1] | category: "Programming & Tech" | tags: [react, nextjs]
   ```
4. **Send to Groq** via `AIJsonChatbot()` (already in `ai.services.ts`), instructing the model to return:
   ```json
   {
     "categories": ["Graphics & Design", "Programming & Tech"],
     "tags": ["logo", "branding", "react"],
     "categoryWeights": { "Graphics & Design": 0.8 },
     "tagWeights": { "logo": 0.9, "branding": 0.7 }
   }
   ```
5. **Query MongoDB** for active gigs matching those categories/tags (excludes the buyer's own gigs).
6. **Re-rank** the top 40 candidates using the composite scoring formula.
7. **Return** the top 8 gigs with a `source` label (`"personalized"` | `"interests"` | `"trending"`).

---

### 3. Recommendation Controller & Route

**File:** `src/controllers/recommendation.controller.ts`
**File:** `src/routes/recommendation.routes.ts`

A single protected endpoint:

```
GET /api/recommendations
Authorization: JWT cookie (httpOnly)
```

Response:
```json
{
  "gigs": [ ...up to 8 gig objects with populated seller... ],
  "source": "personalized",
  "count": 8
}
```

Returns `401` if not authenticated, which the frontend silently treats as "no section to show."

---

### 4. Interaction Logging Hooks

#### `gig.controller.ts` — Search Logging

After the gig query runs in `getAllGigs`, if there is a `search` param and a logged-in user:

```ts
// ── AI Interaction Logging (fire-and-forget) ──────────────────────────
if (search && req.user?._id) {
  void logInteraction({
    buyerId: req.user._id.toString(),
    type: "search",
    query: search as string,
  }).catch(() => {});
}
```

#### `gig.controller.ts` — View Logging

After a gig is found in `getGigById`, if a user is authenticated:

```ts
if (req.user?._id) {
  void logInteraction({
    buyerId: req.user._id.toString(),
    type: "view",
    gigId,
    category: gig.category,
    tags: gig.tags,
  }).catch(() => {});
}
```

#### `order.controller.ts` — Order Logging

After `savedOrder` is created and `Gig.totalOrders` is incremented:

```ts
void logInteraction({
  buyerId: buyerId.toString(),
  type: "order",
  gigId: gigId.toString(),
  category: gig.category,
  tags: gig.tags,
}).catch(() => {});
```

> ⚠️ All three hooks use `void` + `.catch(() => {})` — they are **completely non-blocking** and will **never** affect the original request's success or response time.

---

## Frontend Implementation

### 5. RecommendedGigs Component

**File:** `app/(public)/components/ui/RecommendedGigs.tsx`

A fully self-contained `"use client"` component. It:

1. On mount, calls `getRecommendations()` with `credentials: "include"` (JWT cookie).
2. If the API returns `null` (unauthenticated or no data), renders **nothing** (`return null`).
3. If loading, shows **4 skeleton pulse cards**.
4. Once data arrives, renders a labeled header + a `4-column glassmorphism card grid`.

The label and color adapt to the `source` field:

```tsx
const SOURCE_LABEL = {
  personalized: { text: "Recommended for You",     icon: <Sparkles />, color: "var(--jm-violet)" },
  interests:    { text: "Based on Your Interests", icon: <Compass />,  color: "#0ea5e9" },
  trending:     { text: "Trending Right Now",       icon: <TrendingUp />, color: "#f59e0b" },
};
```

Each card shows: gig image, category badge, star rating, title, seller avatar + name, and starting price in **DA**.

---

### 6. Browse Page Integration

**File:** `app/(public)/browse/page.tsx`

`<RecommendedGigs />` is injected between the page header and the tag filter bar, but **only when no search query or category filter is active**:

```tsx
{!querySearch && !queryCategory && (
  <RecommendedGigs />
)}
```

This ensures recommendations don't compete with explicit search results.

---

### 7. API Helper

**File:** `app/(public)/browse/req-res.ts`

```ts
export async function getRecommendations(): Promise<{
  gigs: any[];
  source: "personalized" | "interests" | "trending";
  count: number;
} | null> {
  const response = await fetch(`${API_BASE_URL}/api/recommendations`, {
    method: "GET",
    credentials: "include",   // sends the httpOnly JWT cookie
  });

  if (!response.ok) return null; // 401 → not logged in → hide the section
  // ...parse and return data
}
```

---

## Cold Start Strategy

| Scenario | Behavior |
|---|---|
| User has **≥1 interaction** | Full AI pipeline: Groq extracts preferences, MongoDB re-ranks |
| User has **0 interactions** but has `fieldsOfInterest` | Fetch top-rated gigs filtered by their stated interests |
| Brand new user, nothing set | Fetch overall top-rated gigs across all categories |
| User is **not logged in** | `GET /api/recommendations` returns `401` → component renders `null` |
| AI (Groq) fails or times out | Falls back to `fieldsOfInterest` / trending gigs |

---

## Performance Design

| Concern | Solution |
|---|---|
| Interaction logging blocking responses | All `logInteraction()` calls use `void` + `.catch(() => {})` — fire and forget |
| Collection growth | 90-day MongoDB TTL index auto-expires old interactions |
| Over-fetching for ranking | Query fetches top 40 candidates, re-ranks in memory, returns top 8 |
| Frontend blocking browse load | `RecommendedGigs` is a separate component with its own loading state — doesn't block the main gig grid |
| Unauthenticated users | `401` → `null` response → component renders nothing, no visible flash |

---

## Files Changed

### New Files

| Path | Description |
|---|---|
| `RESTAPI/src/models/buyer-interaction.model.ts` | Mongoose schema for behavioral events |
| `RESTAPI/src/services/recommendation.service.ts` | AI + scoring engine |
| `RESTAPI/src/controllers/recommendation.controller.ts` | HTTP handler |
| `RESTAPI/src/routes/recommendation.routes.ts` | Route definition |
| `Frontend/app/(public)/components/ui/RecommendedGigs.tsx` | React UI component |

### Modified Files

| Path | Change |
|---|---|
| `RESTAPI/src/app.ts` | Imported and mounted `/api/recommendations` |
| `RESTAPI/src/controllers/gig.controller.ts` | Added `logInteraction` import + hooks in `getAllGigs` and `getGigById` |
| `RESTAPI/src/controllers/order.controller.ts` | Added `logInteraction` import + hook in `createOrder` |
| `Frontend/app/(public)/browse/req-res.ts` | Added `getRecommendations()` function |
| `Frontend/app/(public)/browse/page.tsx` | Imported and embedded `<RecommendedGigs />` |
