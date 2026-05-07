import { Request, Response, NextFunction } from "express";
import { AIJsonChatbot } from "../services/ai.services";

export const buildAIRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { from, step, userInput, gigContext, previousDrafts } = req.body;

    if (!from || !step || !gigContext) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    const systemPrompt = `You are an AI assistant helping a buyer draft a professional message to a seller on a freelance platform called JobMe.
The buyer wants to order a gig titled "${gigContext.gigTitle}" from seller "${gigContext.sellerName}".
The seller requires the following info: ${gigContext.requirements && gigContext.requirements.length > 0 ? JSON.stringify(gigContext.requirements) : "None"}.

You are guiding the buyer step-by-step. The current step is: "${step}".
Your goal is to return a JSON object with two fields:
{
  "aiReply": "A conversational, friendly response to the buyer. Ask clarifying questions based on the seller's requirements if this is the intent step.",
  "draft": "The drafted paragraph for THIS specific step only. For the 'compose' step, this must be the complete, finalized message."
}

Step instructions:
- intent: Draft the core request based on buyer input. Ask about seller requirements if they haven't been mentioned.
- timeline: Draft the deadline requirement.
- budget: Draft budget/package info.
- extras: Draft any extra details.
- compose: Combine the previous drafts into ONE cohesive, professional message addressing the seller by name. Do not include placeholders, make it ready to send.

Previous drafts: ${JSON.stringify(previousDrafts)}`;

    const responseContent = await AIJsonChatbot(systemPrompt, `User input: ${userInput || "Proceed"}`);
    
    if (!responseContent) throw new Error("Failed to generate AI response");
    
    const parsed = JSON.parse(responseContent);

    return res.status(200).json({
      step,
      aiReply: parsed.aiReply || "I've drafted that for you.",
      draft: parsed.draft || ""
    });

  } catch (error) {
    console.error("Error in buildAIRequest:", error);
    next(error);
  }
};
