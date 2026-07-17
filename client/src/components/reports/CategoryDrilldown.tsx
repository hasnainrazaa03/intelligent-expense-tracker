import React, { useState, useMemo } from 'react';
import { useCurrency } from '../../contexts/CurrencyContext';
import { Expense } from '../../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from '../../constants';
import { getCategoryColor } from '../../utils/colorUtils';
import { formatCurrency } from '../../utils/currencyUtils';
import ChartEmpty from '../ChartEmpty';

interface CategoryDrilldownProps {
  expenses: Expense[];
}

const CustomTooltip = ({ active, payload, label, displayCurrency, conversionRate }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="p-2.5 rounded-lg border border-app-border shadow-soft text-xs text-app-text" style={{ background: 'var(--modal-surface)' }}>
        <p className="font-bold">{label}</p>
        <p style={{ color: payload[0].fill }}>{`Spent: ${formatCurrency(payload[0].value, displayCurrency, conversionRate)}`}</p>
      </div>
    );
  }
  return null;
};

const CategoryDrilldown: React.FC<CategoryDrilldownProps> = ({ expenses }) => {
  const { displayCurrency, conversionRate } = useCurrency();
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const mainCategoryData = useMemo(() => {
    const mainCategoryTotals = expenses.reduce((acc, exp) => {
      const mainCategory = SUBCATEGORY_TO_CATEGORY_MAP[exp.category] || 'Miscellaneous';
      // FIX: Ensure exp.amount is treated as a number for the arithmetic operation.
      acc[mainCategory] = (acc[mainCategory] || 0) + Number(exp.amount);
      return acc;
    }, {} as { [key: string]: number });

    return (Object.entries(mainCategoryTotals) as [string, number][])
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
    
    return (Object.entries(subCategoryTotals) as [string, number][])
      .map(([name, amount]) => ({
        name,
        amount,
        fill: getCategoryColor(name),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses, selectedCategory]);

  // Recharts passes the clicked bar's own data entry here (not a chart-level
  // event with activePayload — that only exists on <BarChart onClick>), so read
  // the category name directly from the entry (CMP-H2: drilldown was dead).
  const handleBarClick = (entry: any) => {
    const categoryName = entry?.name ?? entry?.payload?.name;
    if (categoryName && CATEGORIES[categoryName as keyof typeof CATEGORIES]) {
      setSelectedCategory(categoryName);
    }
  };
  
  const chartData = selectedCategory ? subCategoryData : mainCategoryData;
  const title = selectedCategory ? `Breakdown for ${selectedCategory}` : 'Spending by Main Category';

  if (chartData.length === 0) {
    return <ChartEmpty />;
  }

  return (
    <div className="flex flex-col h-full">
        <div className="flex items-center justify-center min-h-[1.25rem]">
            {selectedCategory && (
                <button
                    onClick={() => setSelectedCategory(null)}
                    className="text-sm text-primary hover:underline"
                >
                    &larr; Back to Main Categories
                </button>
            )}
        </div>
        <p className="text-center font-semibold text-app-muted text-sm mb-1">{title}</p>
        <div className="flex-1 min-h-0">
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
                    maxBarSize={38}
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
