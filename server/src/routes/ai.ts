import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = Router();

// Configurable model names via environment variables
const PRIMARY_MODEL = process.env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
const FALLBACK_MODEL = process.env.GEMINI_FALLBACK_MODEL || 'gemini-1.5-flash';

let genAI: GoogleGenerativeAI;
try {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set — AI analysis endpoint will be disabled.");
  } else {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (error) {
  console.error("Failed to initialize GoogleGenAI:", error);
}

router.use(authMiddleware);

const buildFinancialManifest = async (userId: string) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [expenses, incomes, budgets] = await Promise.all([
    prisma.expense.findMany({ where: { userId, date: { gte: sixMonthsAgo } }, orderBy: { date: 'desc' } }),
    prisma.income.findMany({ where: { userId, date: { gte: sixMonthsAgo } }, orderBy: { date: 'desc' } }),
    prisma.budget.findMany({ where: { userId } }),
  ]);

  const totalIncome = incomes.reduce((sum, i) => sum + i.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  return {
    expenses,
    incomes,
    budgets,
    manifest: {
      summary: {
        totalIncome,
        totalExpenses,
        netCashFlow: totalIncome - totalExpenses,
      },
      budgets: budgets.map((b) => ({ category: b.category, limit: b.amount })),
      categoryBreakdown: expenses.reduce((acc: Record<string, number>, e) => {
        acc[e.category] = (acc[e.category] || 0) + e.amount;
        return acc;
      }, {}),
      recurringFixedCosts: expenses
        .filter((e) => e.isRecurring)
        .map((e) => ({ title: e.title, amount: e.amount, category: e.category })),
      recentHistory: expenses.slice(0, 12).map((e) => ({
        title: e.title,
        amount: e.amount,
        category: e.category,
        date: e.date.toISOString().split('T')[0],
        notes: e.notes ? String(e.notes).slice(0, 80) : undefined,
      })),
    },
  };
};

router.post('/analyze', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(500).json({ message: "AI service is not configured." });
  }

  const userId = req.user!.id;

  try {
    const { expenses, incomes, manifest } = await buildFinancialManifest(userId);

    if (expenses.length === 0 && incomes.length === 0) {
      return res.json({ analysis: "No financial data available. Start by adding some income or expenses to get an analysis." });
    }

    // --- OPTIMIZATION: FINANCIAL MANIFEST GENERATION ---
    // Instead of raw JSON of everything, we provide a structured summary 
    // to prevent "Context Overflow" while keeping all info needed for your prompt.
    
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

      ### Spending vs. Budget Analysis
      - Compare 'categoryBreakdown' against the 'budgets' limits provided.
      - Identify any category where they have exceeded their budget.
      
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
      - **CRITICAL**: Include at least one USC-specific tip (Fryft, Meal Plans, or local cheap eats near Jefferson Blvd/Figueroa St).

      Keep the tone encouraging and not judgmental.
      Format your entire response in Markdown with clear headings and bullet points.
    `;

    // --- ROBUST MODEL CALL WITH FALLBACK ---
    let text: string;
    try {
      const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
      const result = await model.generateContent(prompt);
      text = (await result.response).text();
    } catch (modelError) {
      console.warn(`Primary model (${PRIMARY_MODEL}) failed. Attempting fallback to ${FALLBACK_MODEL}...`);
      const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      const result = await fallbackModel.generateContent(prompt);
      text = (await result.response).text();
    }

    res.json({ analysis: text });

  } catch (error: any) {
    console.error('AI analysis error:', error);
    res.status(500).json({ message: 'Failed to generate AI analysis' });
  }
});

router.post('/chat', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(500).json({ message: 'AI service is not configured.' });
  }

  const userId = req.user!.id;
  const { message, history } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ message: 'Message is required' });
  }

  try {
    const { expenses, incomes, manifest } = await buildFinancialManifest(userId);

    if (expenses.length === 0 && incomes.length === 0) {
      return res.json({ reply: 'No financial data available yet. Add some transactions and I can help analyze your spending.' });
    }

    const sanitizedHistory = Array.isArray(history)
      ? history
          .filter((item) => item && (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string')
          .slice(-8)
      : [];

    const conversation = sanitizedHistory
      .map((item) => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content}`)
      .join('\n');

    const prompt = `
You are a friendly spending copilot for USC Ledger. Answer user questions about their finances using ONLY the context below.

FINANCIAL_MANIFEST:
${JSON.stringify(manifest, null, 2)}

PRIOR_CONVERSATION:
${conversation || 'No prior conversation.'}

USER_QUESTION:
${message}

Rules:
- Keep answer brief by default (max 120 words) unless user explicitly asks for detail.
- Use markdown headings with exactly these sections:
  1) ### Quick read
  2) ### What to do next
- Under each section use short bullet points only.
- If a number is used, cite the exact source from the manifest context.
- If data is missing, say what is missing in one bullet and ask one short follow-up question.
`;

    let reply: string;
    try {
      const model = genAI.getGenerativeModel({ model: PRIMARY_MODEL });
      const result = await model.generateContent(prompt);
      reply = (await result.response).text();
    } catch {
      const fallbackModel = genAI.getGenerativeModel({ model: FALLBACK_MODEL });
      const result = await fallbackModel.generateContent(prompt);
      reply = (await result.response).text();
    }

    return res.json({ reply });
  } catch (error) {
    console.error('AI chat error:', error);
    return res.status(500).json({ message: 'Failed to generate AI chat response' });
  }
});

export default router;