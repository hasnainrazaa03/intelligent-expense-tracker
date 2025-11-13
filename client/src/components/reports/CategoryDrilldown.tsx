import React, { useState, useMemo } from 'react';
import { Expense } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../../constants';
import { getCategoryColor } from '../../utils/colorUtils';
import { formatCurrency } from '../../utils/currencyUtils';

interface CategoryDrilldownProps {
  expenses: Expense[];
  displayCurrency: 'USD' | 'INR';
  conversionRate: number | null;
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-base-100 dark:bg-dark-300 p-2 border border-base-300 dark:border-dark-100 rounded-md shadow-lg">
        <p className="font-bold">{label}</p>
        <p style={{ color: payload[0].fill }}>{`Spent: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const CategoryDrilldown: React.FC<CategoryDrilldownProps> = ({ expenses, displayCurrency, conversionRate }) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const mainCategoryData = useMemo(() => {
    const mainCategoryTotals = expenses.reduce((acc, exp) => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      // FIX: Ensure exp.amount is treated as a number for the arithmetic operation.
      acc[mainCategory] = (acc[mainCategory] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    return Object.entries(mainCategoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        fill: getCategoryColor(name),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const subCategoryData = useMemo(() => {
    if (!selectedCategory) return [];

    const subCategoryTotals = expenses
      .filter(exp => (SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous') === selectedCategory)
      .reduce((acc, exp) => {
        // FIX: Ensure exp.amount is treated as a number for the arithmetic operation.
        acc[exp.category] = (acc[exp.category] || 0) + Number(exp.amount);
        return acc;
      }, {} as { [key: string]: number });
    
    return Object.entries(subCategoryTotals)
      .map(([name, amount]) => ({
        name,
        amount,
        fill: getCategoryColor(name),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, selectedCategory]);

  const handleBarClick = (data: any) => {
    if (data && data.activePayload && data.activePayload.length > 0) {
      const categoryName = data.activePayload[0].payload.name;
      if (CATEGORIES[categoryName as keyof typeof CATEGORIES]) {
        setSelectedCategory(categoryName);
      }
    }
  };
  
  const chartData = selectedCategory ? subCategoryData : mainCategoryData;
  const title = selectedCategory ? `Breakdown for ${selectedCategory}` : 'Spending by Main Category';

  return (
    <div>
        <div className="flex items-center justify-center mb-2">
            {selectedCategory && (
                <button
                    onClick={() => setSelectedCategory(null)}
                    className="text-sm text-brand-primary hover:underline"
                >
                    &larr; Back to Main Categories
                </button>
            )}
        </div>
        <p className="text-center font-semibold text-base-content-secondary dark:text-base-300">{title}</p>
        <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
            <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(100, 116, 139, 0.3)" />
                <XAxis type="number" tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => formatCurrency(value, displayCurrency, conversionRate, true)} />
                <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={100} 
                    tick={{ fill: '#64748b', fontSize: 12 }} 
                />
                <Tooltip content={<CustomTooltip displayCurrency={displayCurrency} conversionRate={conversionRate} />} cursor={{fill: 'rgba(20, 184, 166, 0.1)'}} />
                <Bar 
                    dataKey="amount" 
                    onClick={selectedCategory ? undefined : handleBarClick} 
                    cursor={selectedCategory ? "default" : "pointer"}
                    radius={[0, 4, 4, 0]}
                >
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                </Bar>
            </BarChart>
            </ResponsiveContainer>
        </div>
    </div>
  );
};

export default CategoryDrilldown;
