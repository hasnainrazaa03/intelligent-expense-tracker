import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { authMiddleware } from '../middleware/auth';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { expenseToClient, incomeToClient, budgetToClient } from '../utils/money';

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

// Kept in sync with the client's constants.ts — the receipt parser constrains
// Gemini to these exact category/payment values so the returned fields drop
// straight into the expense form.
const RECEIPT_CATEGORIES = [
  'Tuition', 'Books & Supplies', 'Course Fees', 'Technology', 'Supplies', 'Visa Fees',
  'Rent', 'Utilities', 'Internet', 'Renters Insurance', 'Furniture', 'Household Items',
  'Insurance Premium', 'Medical Expenses', 'Dental & Vision', 'Prescriptions',
  'Groceries', 'Dining Out', 'Coffee & Snacks', 'Meal Plan',
  'Public Transit', 'Fuel', 'Car Insurance', 'Maintenance', 'Rideshare', 'Parking',
  'Phone', 'Clothing', 'Entertainment', 'Fitness', 'Personal Care', 'Subscriptions',
  'Home Visits', 'Local Travel', 'Airfare', 'Accommodation',
  'Emergency Fund', 'Gifts', 'Other',
];
const RECEIPT_PAYMENT_METHODS = [
  'Credit Card', 'Debit Card', 'Cash', 'Bank Transfer', 'Venmo', 'PayPal', 'Apple Pay', 'Google Pay',
];
// Income categories — kept in sync with the client's constants.ts.
const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Gift', 'Rental Income', 'Side Hustle', 'Other',
];

// Strip ``` fences and pull the first JSON object out of a model response.
const safeParseJson = (text: string): any => {
  if (!text) return null;
  const cleaned = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch { return null; }
    }
    return null;
  }
};

router.use(authMiddleware);

const buildFinancialManifest = async (userId: string) => {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [rawExpenses, rawIncomes, rawBudgets] = await Promise.all([
    prisma.expense.findMany({ where: { userId, date: { gte: sixMonthsAgo } }, orderBy: { date: 'desc' } }),
    prisma.income.findMany({ where: { userId, date: { gte: sixMonthsAgo } }, orderBy: { date: 'desc' } }),
    prisma.budget.findMany({ where: { userId } }),
  ]);
  // DB stores integer cents; work in dollars from here on.
  const expenses = rawExpenses.map(expenseToClient);
  const incomes = rawIncomes.map(incomeToClient);
  const budgets = rawBudgets.map(budgetToClient);

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

// Parse a receipt image with Gemini vision and return structured fields the
// client drops into the Add-expense form. Accepts a base64 image data URI
// (the client sends the same downscaled thumbnail it stores as the receipt).
router.post('/parse-receipt', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(503).json({ message: 'AI service is not configured.' });
  }

  const { image } = req.body || {};
  if (!image || typeof image !== 'string') {
    return res.status(400).json({ message: 'image is required' });
  }

  const match = image.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    return res.status(400).json({ message: 'image must be a base64 image data URI (png/jpg/webp/gif).' });
  }
  const mimeType = match[1];
  const base64 = match[2].replace(/\s+/g, '');
  // ~6MB of base64 — the client downscales first, so anything larger is suspect.
  if (base64.length > 8_000_000) {
    return res.status(413).json({ message: 'Image is too large.' });
  }

  const today = new Date().toISOString().split('T')[0];
  const prompt = `You are a receipt-parsing assistant. Read the attached receipt image and extract the purchase.
Return ONLY a JSON object with these keys:
- "title": short merchant or item name (string, max 60 chars)
- "amount": the grand total as a plain number in the receipt's own currency (no symbols, no thousands separators)
- "currency": 3-letter ISO code if shown or inferable (e.g. "USD", "INR", "EUR"), otherwise "USD"
- "date": the purchase date as "YYYY-MM-DD"; if not visible use "${today}"
- "category": the single best fit from EXACTLY this list: ${JSON.stringify(RECEIPT_CATEGORIES)}
- "paymentMethod": one of ${JSON.stringify(RECEIPT_PAYMENT_METHODS)} if the receipt shows how it was paid, otherwise ""
- "notes": up to 100 chars of useful context (store location, key items), otherwise ""
If the image is not a receipt, return {"title":"","amount":0,"currency":"USD","date":"${today}","category":"Other","paymentMethod":"","notes":""}.
Respond with JSON only — no markdown, no commentary.`;

  const callModel = async (modelName: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: base64 } },
    ]);
    return (await result.response).text();
  };

  try {
    let text: string;
    try {
      text = await callModel(PRIMARY_MODEL);
    } catch (modelError) {
      console.warn(`Receipt parse: primary model failed, falling back. ${modelError}`);
      text = await callModel(FALLBACK_MODEL);
    }

    const parsed = safeParseJson(text);
    if (!parsed || typeof parsed !== 'object') {
      return res.status(422).json({ message: 'Could not read the receipt.' });
    }

    const currency = String(parsed.currency || 'USD').toUpperCase();
    const amountNum = Number(parsed.amount);
    const receipt = {
      title: String(parsed.title || '').slice(0, 60),
      amount: Number.isFinite(amountNum) && amountNum > 0 ? amountNum : 0,
      currency: /^[A-Z]{3}$/.test(currency) ? currency : 'USD',
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || '')) ? parsed.date : today,
      category: RECEIPT_CATEGORIES.includes(parsed.category) ? parsed.category : 'Other',
      paymentMethod: RECEIPT_PAYMENT_METHODS.includes(parsed.paymentMethod) ? parsed.paymentMethod : '',
      notes: String(parsed.notes || '').slice(0, 100),
    };

    return res.json({ receipt });
  } catch (error) {
    console.error('Receipt parse error:', error);
    return res.status(500).json({ message: 'Failed to parse the receipt.' });
  }
});

// Max transactions returned from a single statement parse — mirrors the bulk
// import cap so the review list never exceeds what /expenses/bulk will accept.
const MAX_STATEMENT_TXNS = 500;

// Parse a bank statement (PDF read natively by Gemini, or raw CSV text) into a
// list of expense transactions with suggested categories. The client shows
// these in a review table before importing, so this only proposes.
router.post('/parse-statement', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(503).json({ message: 'AI service is not configured.' });
  }

  const { pdf, csvText } = req.body || {};

  let parts: any[] | null = null;
  const instruction = `You are a meticulous bank-statement parser. Extract every real transaction and classify each as an EXPENSE (money spent) or INCOME (money genuinely received).

EXPENSE = money spent on goods, services or bills: card/POS/debit purchases, rent, phone, gas/electric/water/internet, insurance, subscriptions, fees.
INCOME = money genuinely coming in: paychecks / payroll / direct deposit, refunds, P2P money received (Venmo/Zelle/PayPal/Cash App cash-ins), rental income, interest/dividends, ATM cash deposits.

EXCLUDE completely (return NEITHER — do not output these):
- Internal transfers between the holder's OWN accounts — e.g. "Transfer To/From Share", moving money to savings or a secured account. Not spending and not income.
- Micro account-verification entries — e.g. "ACCTVERIFY", tiny sub-$1 test amounts that pair with a matching offsetting entry.
- "Beginning Balance", "Ending Balance" and running-balance lines.

For each transaction return:
- "type": "expense" or "income".
- "date": "YYYY-MM-DD" (use the statement's year).
- "description": a SHORT, CLEAN merchant or purpose name a person would recognize — normalize the raw bank text; strip store numbers, addresses, POS/reference codes and ALL-CAPS noise. Examples: "YSI*STUHO RENT 1216-1216 12 W 30th St" -> "Student housing rent"; "POS TRADER JOE S #250 3131 S HOOVER" -> "Trader Joe's"; "Debit Card LYFT *1 RIDE 08-23" -> "Lyft ride"; "ACH ATT TYPE: PAYMENT" -> "AT&T bill"; "SoCalGas TYPE: PAID SCGC" -> "SoCalGas bill"; "CVS/PHARM 02396" -> "CVS Pharmacy"; "ACH VENMO TYPE: CASHOUT" -> "Venmo cash-out"; "ACH KAMRAN BADR TYPE: P2P ... BANK OF AMERICA" -> "Payment from Kamran Badr". Max 60 chars.
- "amount": the exact positive amount, keeping cents (e.g. 33.83).
- "category":
  * For an EXPENSE, the SINGLE BEST fit from EXACTLY: ${JSON.stringify(RECEIPT_CATEGORIES)}. Categorize DECISIVELY from the merchant: grocery stores (Trader Joe's, Ralphs, Vons, Whole Foods) -> "Groceries"; restaurants/cafes -> "Dining Out"; Lyft/Uber -> "Rideshare"; gas fuel -> "Fuel"; AT&T/T-Mobile/Verizon -> "Phone"; gas/electric/water -> "Utilities"; home internet -> "Internet"; rent/housing -> "Rent"; pharmacies (CVS, Walgreens) -> "Prescriptions"; streaming/software subs -> "Subscriptions"; FedEx/UPS/print/office/school supplies -> "Supplies"; tuition/university -> "Tuition"; clothing -> "Clothing"; gym -> "Fitness". Use "Other" ONLY when nothing fits.
  * For INCOME, the SINGLE BEST fit from EXACTLY: ${JSON.stringify(INCOME_CATEGORIES)}. payroll/employer -> "Salary"; freelance/client -> "Freelance"; interest/dividends -> "Investment"; rent received -> "Rental Income"; P2P/refunds/cash deposits/side gigs -> "Side Hustle" or "Other".
- "paymentMethod": for expenses, infer from the type — "Debit Card" for debit-card/POS, "Bank Transfer" for ACH, "Cash" for ATM cash; otherwise "". For income use "".

Return ONLY a JSON object {"transactions":[...]}, at most ${MAX_STATEMENT_TXNS} items. No markdown, no commentary.`;

  if (typeof pdf === 'string' && pdf) {
    const match = pdf.match(/^data:application\/pdf;base64,([a-z0-9+/=\s]+)$/i);
    if (!match) {
      return res.status(400).json({ message: 'pdf must be a base64 application/pdf data URI.' });
    }
    const base64 = match[1].replace(/\s+/g, '');
    // ~10MB PDF — the scoped body parser allows up to ~15MB of base64.
    if (base64.length > 14_000_000) {
      return res.status(413).json({ message: 'PDF is too large (max ~10MB).' });
    }
    parts = [{ text: instruction }, { inlineData: { mimeType: 'application/pdf', data: base64 } }];
  } else if (typeof csvText === 'string' && csvText.trim()) {
    if (csvText.length > 1_000_000) {
      return res.status(413).json({ message: 'CSV text is too large.' });
    }
    parts = [{ text: `${instruction}\n\nSTATEMENT (CSV):\n${csvText.slice(0, 1_000_000)}` }];
  }

  if (!parts) {
    return res.status(400).json({ message: 'Provide a base64 pdf data URI or csvText.' });
  }

  const callModel = async (modelName: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(parts!);
    return (await result.response).text();
  };

  try {
    let text: string;
    try {
      text = await callModel(PRIMARY_MODEL);
    } catch (modelError) {
      console.warn(`Statement parse: primary model failed, falling back. ${modelError}`);
      text = await callModel(FALLBACK_MODEL);
    }

    const parsed = safeParseJson(text);
    const rawTxns = Array.isArray(parsed) ? parsed : parsed?.transactions;
    if (!Array.isArray(rawTxns)) {
      return res.status(422).json({ message: 'Could not read any transactions from that statement.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const transactions = rawTxns
      .map((t: any) => {
        const amountNum = Number(t?.amount);
        const type = t?.type === 'income' ? 'income' : 'expense';
        const validCategories = type === 'income' ? INCOME_CATEGORIES : RECEIPT_CATEGORIES;
        return {
          type,
          date: /^\d{4}-\d{2}-\d{2}$/.test(String(t?.date || '')) ? t.date : today,
          description: String(t?.description || '').slice(0, 80),
          amount: Number.isFinite(amountNum) ? Math.abs(amountNum) : 0,
          category: validCategories.includes(t?.category) ? t.category : 'Other',
          paymentMethod: type === 'expense' && RECEIPT_PAYMENT_METHODS.includes(t?.paymentMethod) ? t.paymentMethod : '',
        };
      })
      .filter((t) => t.description && t.amount > 0)
      .slice(0, MAX_STATEMENT_TXNS);

    return res.json({ transactions });
  } catch (error) {
    console.error('Statement parse error:', error);
    return res.status(500).json({ message: 'Failed to parse the statement.' });
  }
});

export default router;