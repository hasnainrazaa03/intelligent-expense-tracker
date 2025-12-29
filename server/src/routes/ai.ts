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
      prisma.expense.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
      prisma.income.findMany({ where: { userId }, orderBy: { date: 'desc' } }),
    ]);

    if (expenses.length === 0 && incomes.length === 0) {
      return res.json({ analysis: "No financial data available. Start by adding some income or expenses to get an analysis." });
    }

    // --- OPTIMIZATION: FINANCIAL MANIFEST GENERATION ---
    // Instead of raw JSON of everything, we provide a structured summary 
    // to prevent "Context Overflow" while keeping all info needed for your prompt.
    
    const manifest = {
      summary: {
        totalIncome: incomes.reduce((sum, i) => sum + i.amount, 0),
        totalExpenses: expenses.reduce((sum, e) => sum + e.amount, 0),
        netCashFlow: incomes.reduce((sum, i) => sum + i.amount, 0) - expenses.reduce((sum, e) => sum + e.amount, 0),
      },
      // Aggregated totals by category for the Spending Analysis
      categoryBreakdown: expenses.reduce((acc: any, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {}),
      // Baseline for Future Spending Prediction
      recurringFixedCosts: expenses
        .filter(e => e.isRecurring)
        .map(e => ({ title: e.title, amount: e.amount, category: e.category })),
      // Recent transactions (last 20) to identify "Spikes" and "Patterns"
      recentHistory: expenses.slice(0, 20).map(e => ({
        title: e.title,
        amount: e.amount,
        category: e.category,
        date: e.date.toISOString().split('T')[0],
        notes: e.notes
      }))
    };

    const prompt = `
      You are a friendly and insightful financial advisor for an international student in the US. Your goal is to provide helpful, actionable advice based on their financial data.

      Here is the student's condensed financial manifest. Focus your trend analysis on the historical data provided.
      
      FINANCIAL_MANIFEST:
      ${JSON.stringify(manifest, null, 2)}

      Please analyze this data and provide a comprehensive financial report with five sections: "Cash Flow Summary", "Income vs. Expense Trends", "Spending Analysis", "Future Spending Prediction", and "Savings Opportunities".

      ### Cash Flow Summary
      - Comment on the total income ($${manifest.summary.totalIncome}) vs total expenses ($${manifest.summary.totalExpenses}).
      - Determine the net cash flow ($${manifest.summary.netCashFlow}).
      - Briefly comment on their overall cash flow situation.

      ### Income vs. Expense Trends
      - Analyze the historical data to identify trends.
      - Point out months or patterns with significant deficits or savings.
      - Comment on the overall financial trajectory.

      ### Spending Analysis
      - Identify the top spending categories based on the categoryBreakdown.
      - Point out any unusual spending spikes or patterns found in recentHistory.
      - Briefly summarize their overall spending habits.

      ### Future Spending Prediction
      - **Crucially, use the 'recurringFixedCosts' list to identify baseline monthly costs.**
      - Then, based on historical averages for non-recurring expenses, predict their variable spending for the next month.
      - Provide a predicted total spending range for the next month (e.g., $1500 - $1700).

      ### Savings Opportunities
      - Identify at least 3 specific and actionable areas where they could save money.
      - For each opportunity, mention the category, recent amount, and a suggested action.
      - **Specifically review all expenses in 'recurringFixedCosts'.** Suggest that the user re-evaluate if they still need these subscriptions.

      Keep the tone encouraging and not judgmental.
      Format your entire response in Markdown with clear headings and bullet points.
    `;

    // --- ROBUST MODEL CALL WITH FALLBACK ---
    let text: string;
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      text = (await result.response).text();
    } catch (modelError) {
      console.warn("Primary model failed. Attempting fallback to gemini-1.5-flash...");
      const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await fallbackModel.generateContent(prompt);
      text = (await result.response).text();
    }

    res.json({ analysis: text });

  } catch (error: any) {
    console.error('AI analysis error:', error);
    res.status(500).json({ message: 'Failed to generate AI analysis' });
  }
});

export default router;