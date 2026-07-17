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
  'Debit Card', 'Credit Card', 'Cash', 'Bank Transfer', 'Zelle', 'Venmo', 'PayPal',
  'Cash App', 'Apple Pay', 'Google Pay', 'Check', 'Wire Transfer', 'Direct Deposit', 'Other',
];
// Income categories — kept in sync with the client's constants.ts.
const INCOME_CATEGORIES = [
  'Salary', 'Freelance', 'Investment', 'Gift', 'Rental Income', 'Other',
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
  const instruction = `You are a meticulous, expert bank-statement parser. Read the ENTIRE statement (all pages and all accounts/sections) and extract every genuine transaction, classifying each as an EXPENSE (money spent) or INCOME (money genuinely received). Accuracy matters more than speed — reason carefully about each line before emitting it.

=== WHAT TO INCLUDE ===
EXPENSE — money leaving the account for goods, services or bills: card/POS/debit purchases, ATM cash withdrawals, rent, phone, utilities, insurance, subscriptions, tuition, and service fees.
INCOME — money genuinely arriving: payroll / direct deposit, client/freelance payments, refunds, interest/dividends, rent received, cash deposits, and P2P money received (Venmo/Zelle/PayPal/Cash App/Apple Cash cash-ins).

=== WHAT TO EXCLUDE (emit NEITHER) ===
- Internal transfers between the holder's OWN accounts (e.g. "Transfer To/From Share", "to Savings", "to Secured", moving money between the checking/savings/certificate lines on the SAME statement). These are not spending or income.
- Account-verification micro-entries (e.g. "ACCTVERIFY", trial deposits/withdrawals, tiny sub-$1 amounts that pair with a matching offsetting entry the same day).
- Pure reversals/adjustments that net to zero with another line.
- "Beginning Balance", "Ending Balance", subtotals and running-balance rows.
Each real transaction must appear EXACTLY ONCE even if it is echoed in a per-account summary.

=== FIELDS (per transaction) ===
- "type": "expense" or "income". Decide from the sign / column (debit/withdrawal = expense; credit/deposit = income) and the wording.
- "date": "YYYY-MM-DD". Use the transaction date and the statement's year. US statements are MM/DD.
- "amount": exact POSITIVE number with cents (e.g. 46.31). Never include a sign or currency symbol.
- "description": a SHORT, CLEAN, human merchant/purpose name (max 60 chars). Strip store numbers, street addresses, POS/auth/reference codes, "POS/ACH/Debit Card/Withdrawal/Deposit" prefixes, and ALL-CAPS noise; keep the recognizable brand or person. Examples:
    "POS TRADER JOE S #250 3131 S HOOVER" -> "Trader Joe's"
    "POS JH BAZAAR 1401 W..." -> "JH Bazaar"
    "YSI*STUHO RENT 1216-1216 12 W 30th St" -> "Student housing rent"
    "Debit Card LYFT *1 RIDE 08-23" -> "Lyft ride"
    "ACH ATT TYPE: PAYMENT" -> "AT&T bill"
    "SoCalGas TYPE: PAID SCGC" -> "SoCalGas bill"
    "CVS/PHARM 02396" -> "CVS Pharmacy"
    "ACH VENMO TYPE: CASHOUT" -> "Venmo cash-in"
    "ACH KAMRAN BADR TYPE: P2P ... BANK OF AMERICA" -> "Payment from Kamran Badr"
- "paymentMethod": expenses only, chosen from EXACTLY ${JSON.stringify(RECEIPT_PAYMENT_METHODS)}. This is a BANK/CHECKING account statement, so a card or POS purchase is "Debit Card" — NEVER "Credit Card" (only use Credit Card if the statement is explicitly a credit-card statement). Map by the raw wording: "Debit Card"/"POS"/"purchase" -> "Debit Card"; "ACH"/electronic payment/bill-pay -> "Bank Transfer"; ATM cash withdrawal -> "Cash"; "CHECK"/"draft" -> "Check"; "WIRE" -> "Wire Transfer". Recognizable P2P/wallets: Venmo -> "Venmo", Zelle -> "Zelle", PayPal -> "PayPal", Cash App -> "Cash App", Apple Cash/Apple Pay -> "Apple Pay", Google Pay -> "Google Pay". If genuinely unclear, "". Income: always "".
- "category": the SINGLE BEST fit, chosen DECISIVELY. Use "Other" only as a genuine last resort.
  * EXPENSE — choose from EXACTLY: ${JSON.stringify(RECEIPT_CATEGORIES)}. Apply this reasoning:
    - GROCERIES: supermarkets and food/grocery stores of EVERY kind, INCLUDING international / ethnic / halal / South-Asian / Hispanic / Asian grocers and markets. Treat a merchant whose name contains "bazaar", "market", "supermarket", "mart", "foods", "grocery", "grocers", "produce", "meat", or "halal" as Groceries UNLESS it is clearly a restaurant. Known grocers include: Trader Joe's, Ralphs, Vons, Whole Foods, Safeway, Kroger, Aldi, Costco, Sprouts, Sam's Club, Smart & Final, H Mart, 99 Ranch, Patel Brothers, India Bazaar, JH Bazaar, Al-Noor, Superior Grocers, El Super, Northgate.
    - DINING OUT: restaurants, cafes, coffee shops, fast food, bars, food delivery (Starbucks, McDonald's, Chipotle, DoorDash, Uber Eats, Grubhub).
    - RIDESHARE: Lyft, Uber (rides). PUBLIC TRANSIT: metro/bus/train passes. FUEL: gas stations (Chevron, Shell, Arco, 76). PARKING: parking/garages.
    - PHONE: AT&T, T-Mobile, Verizon, Mint. UTILITIES: gas/electric/water/trash (SoCalGas, SCE, LADWP, PG&E). INTERNET: Spectrum, Xfinity, home ISPs.
    - RENT: rent, apartments, student housing, property mgmt (YSI, Tripalink, Greystar). RENTERS INSURANCE / INSURANCE PREMIUM: insurance (Geico, State Farm, Lemonade).
    - PRESCRIPTIONS: pharmacies (CVS, Walgreens, Rite Aid). MEDICAL EXPENSES: clinics, hospitals, doctors, labs.
    - SUBSCRIPTIONS: streaming/software/memberships (Netflix, Spotify, iCloud, YouTube, ChatGPT, Amazon Prime, Adobe).
    - SUPPLIES / TECHNOLOGY: FedEx/UPS/office/printing/school supplies -> Supplies; electronics/Apple/Best Buy -> Technology.
    - TUITION / COURSE FEES / BOOKS & SUPPLIES: university/college/tuition/bookstore.
    - CLOTHING: apparel/shoes retailers. FITNESS: gyms (LA Fitness, Planet Fitness, ClassPass). ENTERTAINMENT: movies, events, games.
    - HOUSEHOLD ITEMS / FURNITURE: only for clear home-goods/furniture stores (IKEA, Target home, Bed Bath). Do NOT default grocery/market names here.
    - PERSONAL CARE: salons, barbers, cosmetics. GENERAL big-box (Target, Walmart, Amazon) with no other signal -> "Other" (or the item type if evident).
  * INCOME — choose from EXACTLY: ${JSON.stringify(INCOME_CATEGORIES)}. payroll/employer/direct deposit -> "Salary"; freelance/client/contract/gig -> "Freelance"; interest/dividends/investment -> "Investment"; rent received -> "Rental Income"; anything else (P2P received, refunds, cash deposits, gifts of money, misc) -> "Other".

Return ONLY a JSON object {"transactions":[...]}, at most ${MAX_STATEMENT_TXNS} items, ordered as they appear. No markdown, no commentary.`;

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

// Enrich a single transaction with AI-generated details (a concise note + tags,
// and a refined category / payment method) so a user importing many rows can
// auto-fill the optional fields per row instead of typing them.
router.post('/enrich-transaction', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(503).json({ message: 'AI service is not configured.' });
  }

  const { type, description, amount } = req.body || {};
  if (!description || typeof description !== 'string') {
    return res.status(400).json({ message: 'description is required' });
  }
  const isIncome = type === 'income';
  const categories = isIncome ? INCOME_CATEGORIES : RECEIPT_CATEGORIES;

  const prompt = `You are helping a user log a ${isIncome ? 'income' : 'expense'} transaction. Given:
- description: "${String(description).slice(0, 120)}"
- amount: ${Number(amount) || 0}

Return ONLY JSON with:
- "notes": one concise, human sentence adding useful context about what this likely is (max 100 chars).
- "tags": array of 1-3 short lowercase tags (single words or short phrases, no "#").
- "category": the single best fit from EXACTLY: ${JSON.stringify(categories)}. Categorize decisively.${isIncome ? '' : ' Any grocery / supermarket / market / "bazaar" / "mart" / ethnic or international grocer (e.g. JH Bazaar, H Mart, Patel Brothers) is "Groceries", not "Household Items". Restaurants/cafes are "Dining Out".'}
${isIncome ? '' : `- "paymentMethod": from EXACTLY ${JSON.stringify(RECEIPT_PAYMENT_METHODS)}. From a bank/checking statement a normal card purchase is "Debit Card" (not Credit Card); P2P/wallet names map to themselves; else "".`}
Respond with JSON only, no markdown.`;

  const callModel = async (modelName: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    return (await result.response).text();
  };

  try {
    let text: string;
    try {
      text = await callModel(PRIMARY_MODEL);
    } catch {
      text = await callModel(FALLBACK_MODEL);
    }
    const parsed = safeParseJson(text);
    if (!parsed || typeof parsed !== 'object') {
      return res.status(422).json({ message: 'Could not generate details.' });
    }
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t: any) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 3)
      : [];
    return res.json({
      details: {
        notes: String(parsed.notes || '').slice(0, 100),
        tags,
        category: categories.includes(parsed.category) ? parsed.category : '',
        paymentMethod: !isIncome && RECEIPT_PAYMENT_METHODS.includes(parsed.paymentMethod) ? parsed.paymentMethod : '',
      },
    });
  } catch (error) {
    console.error('Enrich transaction error:', error);
    return res.status(500).json({ message: 'Failed to generate details.' });
  }
});

// Batch enrichment — details for a whole list of transactions in ONE model
// call, so "AI-fill all" doesn't fire N requests and trip the provider's
// per-minute rate limit. Returns { details: [{ i, notes, tags, category,
// paymentMethod }] } keyed by input index.
router.post('/enrich-transactions', async (req: Request, res: Response) => {
  if (!genAI) {
    return res.status(503).json({ message: 'AI service is not configured.' });
  }

  const { transactions } = req.body || {};
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return res.status(400).json({ message: 'transactions must be a non-empty array' });
  }

  const items = transactions.slice(0, 200).map((t: any, i: number) => ({
    i,
    type: t?.type === 'income' ? 'income' : 'expense',
    description: String(t?.description || '').slice(0, 120),
    amount: Number(t?.amount) || 0,
  }));

  const prompt = `You are enriching a batch of transactions a user is importing. For EACH input item, generate helpful details.

Rules per item:
- "i": copy the item's index exactly.
- "notes": one concise human sentence of useful context (max 100 chars).
- "tags": 1-3 short lowercase tags (no "#").
- "category": for an EXPENSE item choose from EXACTLY ${JSON.stringify(RECEIPT_CATEGORIES)}; for an INCOME item from EXACTLY ${JSON.stringify(INCOME_CATEGORIES)}. Categorize decisively — any grocery/supermarket/market/"bazaar"/"mart"/ethnic or international grocer (JH Bazaar, H Mart, Patel Brothers, 99 Ranch) is "Groceries", restaurants/cafes are "Dining Out".
- "paymentMethod": for EXPENSE items, from EXACTLY ${JSON.stringify(RECEIPT_PAYMENT_METHODS)}. These come from a bank/checking statement, so a normal card purchase is "Debit Card", never "Credit Card". P2P/wallet names (Venmo/Zelle/PayPal/Cash App/Apple Pay/Google Pay) map to themselves. If unclear, "". For INCOME always "".

INPUT (JSON array of {i, type, description, amount}):
${JSON.stringify(items)}

Return ONLY: {"details":[{"i":0,"notes":"...","tags":["..."],"category":"...","paymentMethod":"..."}, ...]} with exactly one entry per input item, same "i" values. No markdown, no commentary.`;

  const callModel = async (modelName: string): Promise<string> => {
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(prompt);
    return (await result.response).text();
  };

  try {
    let text: string;
    try {
      text = await callModel(PRIMARY_MODEL);
    } catch (modelError) {
      console.warn(`Batch enrich: primary model failed, falling back. ${modelError}`);
      text = await callModel(FALLBACK_MODEL);
    }

    const parsed = safeParseJson(text);
    const rawDetails = Array.isArray(parsed) ? parsed : parsed?.details;
    if (!Array.isArray(rawDetails)) {
      return res.status(422).json({ message: 'Could not generate details.' });
    }

    const details = rawDetails
      .map((d: any) => {
        const idx = Number(d?.i);
        const item = items.find((it) => it.i === idx);
        if (!item) return null;
        const categories = item.type === 'income' ? INCOME_CATEGORIES : RECEIPT_CATEGORIES;
        const tags = Array.isArray(d?.tags)
          ? d.tags.map((t: any) => String(t).trim().toLowerCase().replace(/^#/, '')).filter(Boolean).slice(0, 3)
          : [];
        return {
          i: idx,
          notes: String(d?.notes || '').slice(0, 100),
          tags,
          category: categories.includes(d?.category) ? d.category : '',
          paymentMethod: item.type === 'expense' && RECEIPT_PAYMENT_METHODS.includes(d?.paymentMethod) ? d.paymentMethod : '',
        };
      })
      .filter(Boolean);

    return res.json({ details });
  } catch (error) {
    console.error('Batch enrich error:', error);
    return res.status(500).json({ message: 'Failed to generate details.' });
  }
});

export default router;