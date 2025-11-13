import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

// --- Initialize the AI Client ---
let genAI: GoogleGenerativeAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the .env file.");
  }
  // --- THE CORRECT FIX ---
  // The constructor just takes the API key string directly.
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

} catch (error) {
  console.error("Failed to initialize GoogleGenAI:", error);
}

// --- Protect the route ---
router.use(authMiddleware);

// --- 1. Get AI Analysis ---
// GET /api/ai/analyze
router.get('/analyze', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const userId = req.user!.id;

  try {
    // 1. Fetch all expenses and incomes for this user
    const [expenses, incomes] = await Promise.all([
      prisma.expense.findMany({ where: { userId } }),
      prisma.income.findMany({ where: { userId } }),
    ]);
    
    // 2. Check if there is data
    if (expenses.length === 0 && incomes.length === 0) {
      return res.json({ analysis: "No financial data available. Start by adding some income or expenses to get an analysis." });
    }

    // 3. This is the exact prompt from your old geminiService.ts file
    const prompt = `
      You are a friendly and insightful financial advisor for an international student in the US. Your goal is to provide helpful, actionable advice based on their financial data.

      Here is the student's income and expense data in JSON format. Note that the data provided covers all time, but focus your trend analysis on the last year.
      Income:
      ${JSON.stringify(incomes, null, 2)}
      
      Expenses (the 'isRecurring' field indicates if an expense is a monthly recurring charge):
      ${JSON.stringify(expenses, null, 2)}

      Please analyze this data and provide a comprehensive financial report with five sections: "Cash Flow Summary", "Income vs. Expense Trends", "Spending Analysis", "Future Spending Prediction", and "Savings Opportunities".

      ### Cash Flow Summary
      - Calculate the total income and total expenses for the provided period.
      - Determine the net cash flow (Income - Expenses).
      - Briefly comment on their overall cash flow situation (e.g., "You have a positive cash flow, which is great for savings!" or "Your expenses are higher than your income, let's look at ways to improve this.").

      ### Income vs. Expense Trends
      - Analyze the income vs. expense data over the last 12 months to identify trends.
      - Point out specific months with high net savings or significant deficits.
      - Comment on the overall financial trajectory. For example, are their savings consistently growing, or are expenses creeping up faster than income?

      ### Spending Analysis
      - Identify the top 3 spending categories for the last 90 days.
      - Point out any unusual spending spikes or patterns.
      - Briefly summarize their overall spending habits.

      ### Future Spending Prediction
      - **Crucially, use the 'isRecurring' flag on expenses to identify fixed monthly costs.** Sum these up as a baseline.
      - Then, based on historical averages for non-recurring expenses, predict their variable spending for the next month.
      - Combine these to provide a predicted total spending range for the next month (e.g., $1500 - $1700).
      - Highlight which categories are likely to have the highest expenses next month.

      ### Savings Opportunities
      - Based on both income and spending, identify at least 3 specific and actionable areas where they could save money.
      - For each opportunity, mention the category, the amount spent recently, and a suggested action. For example: "You spent $250 on Dining Out last month. Packing lunch 3 times a week could save you over $80."
      - **Specifically review all expenses marked as 'isRecurring'.** Suggest that the user re-evaluate if they still need these subscriptions or services.

      Keep the tone encouraging and not judgmental.
      Format your entire response in Markdown with clear headings and bullet points.
    `;

    // 4. Call the API from the server
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // 5. Send the text back to the client
    res.json({ analysis: text });

  } catch (error: any) {
    console.error('AI analysis error:', error);
    // Handle specific Gemini API errors if they exist
    if (error.status === 400 || error.code === 400) {
      return res.status(400).json({ message: "The request to the AI was malformed. This might be a prompt issue." });
    }
    // Handle auth errors (e.g., bad API key)
    if (error.status === 401 || error.status === 403) {
      return res.status(500).json({ message: "Could not authenticate with the AI service. Check the server's API key." });
    }
    res.status(500).json({ message: 'Failed to generate AI analysis' });
  }
});

export default router;