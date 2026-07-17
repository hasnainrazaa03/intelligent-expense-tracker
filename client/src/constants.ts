export const CATEGORIES = {
  'Education': ['Tuition', 'Books & Supplies', 'Course Fees', 'Technology', 'Supplies', 'Visa Fees'],
  'Housing': ['Rent', 'Utilities', 'Internet', 'Renters Insurance', 'Furniture', 'Household Items'],
  'Healthcare': ['Insurance Premium', 'Medical Expenses', 'Dental & Vision', 'Prescriptions'],
  'Food': ['Groceries', 'Dining Out', 'Coffee & Snacks', 'Meal Plan'],
  'Transportation': ['Public Transit', 'Fuel', 'Car Insurance', 'Maintenance', 'Rideshare', 'Parking'],
  'Personal': ['Phone', 'Clothing', 'Entertainment', 'Fitness', 'Personal Care', 'Subscriptions'],
  'Travel': ['Home Visits', 'Local Travel', 'Airfare', 'Accommodation'],
  'Miscellaneous': ['Emergency Fund', 'Gifts', 'Other'],
};

// Flattened list of all subcategories
export const ALL_SUBCATEGORIES: string[] = Object.values(CATEGORIES).flat();

// Map from subcategory to main category for easy lookup
export const SUBCATEGORY_TO_CATEGORY_MAP: { [key: string]: string } = {};
for (const category in CATEGORIES) {
  for (const subcategory of CATEGORIES[category as keyof typeof CATEGORIES]) {
    SUBCATEGORY_TO_CATEGORY_MAP[subcategory] = category;
  }
}

export const INCOME_CATEGORIES = [
    'Salary',
    'Freelance',
    'Investment',
    'Gift',
    'Rental Income',
    'Other'
];

// Validated cosmic categorical palette (dataviz skill — colorblind-checked on the
// dark surface, fixed order, never cycled). See docs/design-direction.md.
export const CATEGORY_COLORS: { [key: string]: string } = {
  'Education': '#6d5cf0',      // indigo
  'Housing': '#d97706',        // amber
  'Food': '#0284c7',           // sky
  'Healthcare': '#ec4899',     // rose
  'Transportation': '#16a34a', // green
  'Personal': '#9333ea',       // violet
  'Travel': '#0d9488',         // teal
  'Miscellaneous': '#64748b',  // neutral slate ("Other")
};

export const PAYMENT_METHODS = [
  'Credit Card',
  'Debit Card',
  'Cash',
  'Bank Transfer',
  'Venmo',
  'PayPal',
  'Apple Pay',
  'Google Pay',
];

export const USC_SEMESTERS: { id: string; name: string; }[] = [
    { id: 'fall-2025', name: 'Fall 2025' },
    { id: 'spring-2026', name: 'Spring 2026' },
    { id: 'summer-2026', name: 'Summer 2026' },
    { id: 'fall-2026', name: 'Fall 2026' },
    { id: 'spring-2027', name: 'Spring 2027' },
    { id: 'fall-2027', name: 'Fall 2027' },
];