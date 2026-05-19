import mongoose from "mongoose";
import { BuyerInteraction } from "../models/buyer-interaction.model";
import { Gig } from "../models/gig.model";
import { User } from "../models/user.model";
import { AIJsonChatbot } from "./ai.services";

const WEIGHT = { order: 4, save: 3, search: 2, view: 1 } as const;
const MAX_INTERACTIONS = 30;
const MAX_RECOMMENDATIONS = 8;

/** Shapes returned by the Groq preference extraction */
interface AIPreferences {
  categories: string[];
  tags: string[];
  categoryWeights: Record<string, number>;
  tagWeights: Record<string, number>;
}

/**
 * Logs a buyer interaction event — fire-and-forget (never throws).
 */
export async function logInteraction(params: {
  buyerId: string;
  type: "search" | "order" | "save" | "view";
  query?: string;
  gigId?: string;
  category?: string;
  tags?: string[];
}): Promise<void> {
  try {
    await BuyerInteraction.create({
      buyer: new mongoose.Types.ObjectId(params.buyerId),
      type: params.type,
      query: params.query,
      gigId: params.gigId ? new mongoose.Types.ObjectId(params.gigId) : undefined,
      category: params.category,
      tags: params.tags ?? [],
      weight: WEIGHT[params.type],
    });
  } catch (err) {
    // Silently swallow — logging must NEVER break primary endpoints
    console.error("[recommendation] logInteraction failed:", err);
  }
}

/**
 * Builds a weighted interaction summary string for the LLM prompt.
 */
function buildInteractionSummary(
  interactions: Array<{
    type: string;
    query?: string;
    category?: string;
    tags?: string[];
    weight: number;
  }>
): string {
  return interactions
    .map((i) => {
      const parts: string[] = [`[${i.type.toUpperCase()} weight=${i.weight}]`];
      if (i.query) parts.push(`query: "${i.query}"`);
      if (i.category) parts.push(`category: "${i.category}"`);
      if (i.tags && i.tags.length > 0) parts.push(`tags: [${i.tags.join(", ")}]`);
      return parts.join(" | ");
    })
    .join("\n");
}

/**
 * Uses Groq/LLaMA to extract weighted preferences from interaction history.
 */
async function extractPreferencesWithAI(
  interactionSummary: string,
  availableCategories: string[]
): Promise<AIPreferences | null> {
  const systemMessage = `You are an intelligent recommendation engine for a freelance marketplace called JobMe.
Your task is to analyze a buyer's interaction history and extract their preferences.
You MUST respond with valid JSON only — no explanations, no markdown.

Available gig categories: ${availableCategories.map((c) => `"${c}"`).join(", ")}

Return this exact JSON shape:
{
  "categories": ["most relevant category", "second most relevant category"],
  "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"],
  "categoryWeights": { "category name": 0.0 to 1.0 },
  "tagWeights": { "tag name": 0.0 to 1.0 }
}

Rules:
- categories MUST be from the available categories list only
- tags should be short, specific skill/service keywords inferred from the interactions
- weights reflect how strongly the buyer prefers that category/tag (higher = more relevant)
- if there is not enough data, still return your best guess with lower weights`;

  const userMessage = `Here is the buyer's recent interaction history (ordered most recent first):

${interactionSummary}

Extract their preferences as JSON.`;

  try {
    const raw = await AIJsonChatbot(systemMessage, userMessage);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as AIPreferences;
  } catch (err) {
    console.error("[recommendation] AI preference extraction failed:", err);
    return null;
  }
}

/**
 * Fallback: use the user's fieldsOfInterest + top-rated gigs.
 */
async function getFallbackGigs(
  buyerId: string,
  fieldsOfInterest: string[]
): Promise<any[]> {
  const filter: any = { isActive: true, seller: { $ne: new mongoose.Types.ObjectId(buyerId) } };

  if (fieldsOfInterest.length > 0) {
    filter.category = { $in: fieldsOfInterest };
  }

  const gigs = await Gig.find(filter)
    .populate("seller", "name pfp")
    .sort({ "rating.average": -1, totalOrders: -1 })
    .limit(MAX_RECOMMENDATIONS)
    .lean();

  // If fieldsOfInterest returned nothing, fall back to overall top-rated
  if (gigs.length === 0 && fieldsOfInterest.length > 0) {
    return Gig.find({ isActive: true, seller: { $ne: new mongoose.Types.ObjectId(buyerId) } })
      .populate("seller", "name pfp")
      .sort({ "rating.average": -1, totalOrders: -1 })
      .limit(MAX_RECOMMENDATIONS)
      .lean();
  }

  return gigs;
}

/**
 * Main recommendation engine.
 * Returns up to MAX_RECOMMENDATIONS gigs personalized to the buyer.
 */
export async function getRecommendationsForBuyer(buyerId: string): Promise<{
  gigs: any[];
  source: "personalized" | "interests" | "trending";
}> {
  // ── 1. Fetch recent interactions ──────────────────────────────────────────
  const interactions = await BuyerInteraction.find({ buyer: buyerId })
    .sort({ createdAt: -1 })
    .limit(MAX_INTERACTIONS)
    .lean();

  // ── 2. Fetch buyer profile for fieldsOfInterest ───────────────────────────
  const user = await User.findById(buyerId).select("fieldsOfInterest").lean();
  const fieldsOfInterest: string[] = user?.fieldsOfInterest ?? [];

  // ── 3. If no interactions → use fallback ─────────────────────────────────
  if (interactions.length === 0) {
    const gigs = await getFallbackGigs(buyerId, fieldsOfInterest);
    return {
      gigs,
      source: fieldsOfInterest.length > 0 ? "interests" : "trending",
    };
  }

  // ── 4. Available categories ───────────────────────────────────────────────
  const availableCategories = [
    "Graphics & Design",
    "Digital Marketing",
    "Writing & Translation",
    "Video & Animation",
    "Music & Audio",
    "Programming & Tech",
    "Data",
    "Business",
    "Lifestyle",
  ];

  // ── 5. Build summary for the AI ───────────────────────────────────────────
  const summary = buildInteractionSummary(interactions);

  // ── 6. Ask Groq to extract preferences ───────────────────────────────────
  const preferences = await extractPreferencesWithAI(summary, availableCategories);

  if (!preferences || preferences.categories.length === 0) {
    const gigs = await getFallbackGigs(buyerId, fieldsOfInterest);
    return {
      gigs,
      source: fieldsOfInterest.length > 0 ? "interests" : "trending",
    };
  }

  // ── 7. Query MongoDB with AI-derived preferences ─────────────────────────
  const buyerObjectId = new mongoose.Types.ObjectId(buyerId);
  const scoringQuery: any = {
    isActive: true,
    seller: { $ne: buyerObjectId },
    $or: [
      { category: { $in: preferences.categories } },
      { tags: { $in: preferences.tags } },
    ],
  };

  const candidateGigs = await Gig.find(scoringQuery)
    .populate("seller", "name pfp")
    .sort({ "rating.average": -1, totalOrders: -1 })
    .limit(40) // Over-fetch so we can re-rank
    .lean();

  // ── 8. Re-rank using AI weights ───────────────────────────────────────────
  const scored = candidateGigs.map((gig) => {
    let score = 0;

    // Category weight contribution
    const catWeight = preferences.categoryWeights[gig.category] ?? 0;
    score += catWeight * 10;

    // Tag weight contribution
    const gigTags: string[] = (gig.tags ?? []) as string[];
    for (const tag of gigTags) {
      score += (preferences.tagWeights[tag] ?? 0) * 5;
    }

    // Platform quality signals
    score += (gig.rating?.average ?? 0) * 2;
    score += Math.log1p(gig.totalOrders ?? 0) * 0.5;

    return { gig, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const topGigs = scored.slice(0, MAX_RECOMMENDATIONS).map((s) => s.gig);

  return { gigs: topGigs, source: "personalized" };
}
