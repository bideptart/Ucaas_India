import { TOP_UP_AMOUNT } from '../constants';
import { USD_TO_INR_RATE } from '@/lib/billing-money';

// These preset buttons are always whole rupees, so the ".00" that
// `formatMoney` adds for exact amounts elsewhere just wastes width here and
// pushed the figure past the card's edge — a plain rounded rupee amount
// fits the small fixed-width box instead.
const formatWholeRupees = (value: number) =>
  `₹${Math.round(value * USD_TO_INR_RATE).toLocaleString('en-IN')}`;

const AmountSection = ({ selectedAmount, setSelectedAmount }: any) => {
  return (
    <div className="grid grid-cols-5 gap-2">
      {TOP_UP_AMOUNT?.map((res, index) => (
        <div
          key={index}
          className={`border border-gray-200 rounded-xl px-1 py-2 text-center cursor-pointer overflow-hidden ${
            selectedAmount === res ? 'bg-primary text-white' : 'bg-white text-gray-900'
          }`}
          onClick={() => setSelectedAmount(res)}
        >
          <span
            className={`font-semibold text-xs sm:text-sm whitespace-nowrap ${selectedAmount === res ? 'text-white' : 'text-primary'}`}
          >
            {formatWholeRupees(res)}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AmountSection;
