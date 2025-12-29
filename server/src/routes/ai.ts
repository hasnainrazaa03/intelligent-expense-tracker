import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

let genAI: GoogleGenerativeAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set in the .env file.");
  }
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
} catch (error) {
  console.error("Failed to initialize GoogleGenAI:", error);
}

router.use(authMiddleware);

router.post('/analyze', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const userId = req.user!.id;

  try {
    const [expenses, incomes] = await Promise.all([
      prisma.expense.findMany({ where: { userId } }),
      prisma.income.findMany({ where: { userId } }),
    ]);

    if (expenses.length === 0 && incomes.length === 0) {
      return res.json({ analysis: "No financial data available. Start by adding some income or expenses to get an analysis." });
    }

    // --- FIX #1: DATA MINIMIZATION ---
    // We filter out database IDs and timestamps to save context window space 
    // while keeping all fields required by your specific prompt.
    const cleanIncomes = incomes.map(i => ({
      title: i.title,
      amount: i.amount,
      category: i.category,
      date: i.date.toISOString().split('T')[0],
      notes: i.notes
    }));

    const cleanExpenses = expenses.map(e => ({
      title: e.title,
      amount: e.amount,
      category: e.category,
      date: e.date.toISOString().split('T')[0],
      paymentMethod: e.paymentMethod,
      isRecurring: e.isRecurring,
      notes: e.notes
    }));

    // --- YOUR DETAILED PROMPT (RETAINED) ---
    const prompt = `
      You are a friendly and insightful financial advisor for an international student in the US. Your goal is to provide helpful, actionable advice based on their financial data.

      Here is the student's income and expense data in JSON format. Note that the data provided covers all time, but focus your trend analysis on the last year.
      Income:
      ${JSON.stringify(cleanIncomes, null, 2)}
      
      Expenses (the 'isRecurring' field indicates if an expense is a monthly recurring charge):
      ${JSON.stringify(cleanExpenses, null, 2)}

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

    // --- FIX #2: ROBUST MODEL CALL WITH FALLBACK ---
    let text: string;
    try {
      // Primary attempt with your working version
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      text = (await result.response).text();
    } catch (modelError) {
      console.warn("Gemini 2.5-flash failed or is unavailable. Attempting fallback to 1.5-flash...");
      // Fallback attempt with the stable production model
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await fallbackModel.generateContent(prompt);
      text = (await result.response).text();
    }

    res.json({ analysis: text });

  } catch (error: any) {
    console.error('AI analysis error:', error);
    if (error.status === 400 || error.code === 400) {
      return res.status(400).json({ message: "The request to the AI was malformed. This might be a prompt issue." });
    }
    if (error.status === 401 || error.status === 403) {
      return res.status(500).json({ message: "Could not authenticate with the AI service." });
    }
    res.status(500).json({ message: 'Failed to generate AI analysis' });
  }
});

export default router;