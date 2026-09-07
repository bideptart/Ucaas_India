import { TOP_UP_AMOUNT } from '../constants';

const AmountSection = ({ selectedAmount, setSelectedAmount }: any) => {
  return (
    <div className="grid grid-cols-5 gap-2">
      {TOP_UP_AMOUNT?.map((res, index) => (
        <div
          key={index}
          className={`border border-gray-200 dark:border-mcm-line rounded-xl p-2 text-center cursor-pointer  ${
            selectedAmount === res ? 'bg-primary text-white' : 'bg-white dark:bg-mcm-surface text-gray-900 dark:text-mcm-ink'
          }`}
          onClick={() => setSelectedAmount(res)}
        >
          <span
            className={`font-semibold text-sm ${selectedAmount === res ? 'text-white' : 'text-primary'}`}
          >
            ${res}
          </span>
        </div>
      ))}
    </div>
  );
};

export default AmountSection;
