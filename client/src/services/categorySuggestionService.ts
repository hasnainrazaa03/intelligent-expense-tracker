import { Category } from '../types';

/**
 * USC_RULES: Priority campus-specific mapping.
 * These are checked FIRST to ensure "Village" doesn't get confused 
 * with general "Housing" or "Groceries" incorrectly.
 */
const USC_RULES: [string, RegExp][] = [
    // USC Specific Transportation
    ['Rideshare', /fryft|usc lyft|usc shuttle/i],
    
    // USC Specific Dining/Groceries
    ['Groceries', /trader joe's usc|seeds marketplace|village market|target village/i],
    ['Dining Out', /dining dollar|discretionary|fertit|seeds|tutor hall|little galen|the habit usc/i],
    
    // USC Education & Admin
    ['Tuition', /bursar|usc payment|usc tuition|bill pay usc/i],
    ['Books & Supplies', /usc bookstore|course reader|lab kit/i],
    ['Technology', /usc tech center|viterbi shop/i],
    
    // USC Lifestyle
    ['Fitness', /lyon center|village gym|usc rec/i],
    ['Entertainment', /usc ticket|usc game|usc event|rose bowl/i],
];

const GENERAL_RULES: [string, RegExp][] = [
    // Healthcare
    ['Prescriptions', /pharmacy|cvs|walgreens|rite aid|prescription/i],
    ['Medical Expenses', /doctor|hospital|clinic|urgent care|medical|engemann/i],
    
    // Transportation
    ['Rideshare', /uber|ubr|lyft|lyf|taxi/i],
    ['Fuel', /gas|shell|chevron|bp|mobil|76/i],
    ['Public Transit', /bus|train|metro|tap card|clipper/i],

    // Housing & Home
    ['Internet', /internet|comcast|xfinity|at&t|verizon|spectrum/i],
    ['Utilities', /utility|electricity|ladwp|pge|gas|water/i],
    ['Household Items', /target|walmart|cleaning|home depot|amazon/i], // Amazon usually home/supplies

    // Food
    ['Dining Out', /restaurant|cafe|pizza|eat|dinner|doordash|uber eats|grubhub|postmates/i],
    ['Coffee & Snacks', /coffee|starbucks|peet's|philz|snack|vending/i],
    ['Groceries', /grocer(y|ies)|market|safeway|trader joe|costco|whole foods|ralphs|vons/i],
    
    // Education
    ['Books & Supplies', /bookstore|textbook|chegg|quizlet/i],
    ['Technology', /software|adobe|apple|microsoft|best buy/i],

    // Personal
    ['Subscriptions', /netflix|spotify|hulu|disney|hbo|youtube|prime video|patreon/i],
    ['Phone', /phone bill|t-mobile|mint mobile/i],
    ['Clothing', /clothes|shoes|shopping|zara|uniqlo|h&m|nike/i],
];

// Combine: USC first, then General
const RULES = [...USC_RULES, ...GENERAL_RULES];

/**
 * Suggests an expense category based on the expense title.
 * @param title The title of the expense string.
 * @returns A suggested Category string, or null.
 */
export const suggestCategory = (title: string): Category | null => {
    if (!title) return null;
    
    // Iterate through the array. First match wins.
    for (const [category, regex] of RULES) {
        if (regex.test(title)) {
            return category as Category;
        }
    }
    return null;
};