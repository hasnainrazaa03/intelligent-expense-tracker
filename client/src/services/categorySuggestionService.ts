import { Category } from '../types';

// The order matters. More specific rules should come first.
const SUGGESTION_RULES: Map<string, RegExp> = new Map([
    // Healthcare
    ['Prescriptions', /pharmacy|cvs|walgreens|rite aid|prescription/i],
    ['Dental & Vision', /dentist|vision|optometrist|glasses|contacts/i],
    ['Insurance Premium', /health insurance|premium/i],
    ['Medical Expenses', /doctor|hospital|clinic|urgent care|medical/i],
    
    // Transportation
    ['Car Insurance', /car insurance|geico|progressive|state farm/i],
    ['Maintenance', /car repair|jiffy lube|maintenance|oil change/i],
    ['Rideshare', /uber|ubr|lyft|lyf|taxi/i],
    ['Fuel', /gas|shell|chevron|bp|mobil|76/i],
    ['Public Transit', /bus|train|metro|bart|clipper/i],
    ['Parking', /parking/i],

    // Housing
    ['Renters Insurance', /renters insurance|lemonade/i],
    ['Internet', /internet|comcast|xfinity|at&t|verizon|spectrum/i],
    ['Utilities', /utility|electricity|pge|gas|water|sewage|bill/i],
    ['Rent', /rent|mortgage|lease/i],
    ['Furniture', /ikea|furniture|desk|chair|wayfair/i],
    ['Household Items', /target|walmart|cleaning|household|bed bath/i],

    // Food
    ['Dining Out', /restaurant|restaraunt|cafe|pizza|eat|dinner|lunch|brunch|doordash|uber eats|grubhub/i],
    ['Coffee & Snacks', /coffee|starbucks|peet's|philz|snack/i],
    ['Groceries', /grocer(y|ies)|market|safeway|trader joe|costco|whole foods|kroger|ralph's|vons|albertsons|sprouts|instacart/i],
    ['Meal Plan', /meal plan|campus dining/i],
    
    // Education
    ['Tuition', /tuition|school fee|college fee|university fee/i],
    ['Course Fees', /course fee|lab fee|registration/i],
    ['Technology', /software|adobe|computer|laptop|tech|best buy/i],
    ['Books & Supplies', /bookstore|textbook|notebook|usc bookstore/i],
    ['Supplies', /supplies|staples|office depot|art supply/i],

    // Personal
    ['Subscriptions', /netflix|spotify|hulu|disney|hbo|youtube|subscription|patreon|twitch|prime video/i],
    ['Phone', /phone bill|t-mobile|at&t|verizon/i],
    ['Entertainment', /movie|cinema|concert|ticketmaster|game|steam|bar|pub|club|event/i],
    ['Fitness', /gym|fitness|24 hour fitness|peloton/i],
    ['Personal Care', /haircut|salon|sephora|ulta|cosmetics|barber/i],
    ['Clothing', /clothes|shoes|shopping|macy's|zara|uniqlo|nordstrom|gap|old navy/i],
    
    // Travel
    ['Airfare', /flight|airline|delta|united|southwest|jetblue|alaska air/i],
    ['Accommodation', /hotel|airbnb|hostel|motel|booking\.com/i],
    ['Local Travel', /local trip|weekend travel|amtrak/i],
    ['Home Visits', /flight home|visit family/i],
    
    // Miscellaneous
    ['Gifts', /gift|present/i],
    ['Emergency Fund', /emergency/i],
]);


/**
 * Suggests an expense category based on the expense title.
 * @param title The title of the expense.
 * @returns A suggested Category, or null if no match is found.
 */
export const suggestCategory = (title: string): Category | null => {
    for (const [category, regex] of SUGGESTION_RULES.entries()) {
        if (regex.test(title)) {
            return category;
        }
    }
    return null;
};
