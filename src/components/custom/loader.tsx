const variants: { [key: string]: string } = {
  white: 'text-white',
  blue: 'text-primary',
  green: 'text-green-500',
};

const sizeVariants: { [key: string]: string } = {
  xs: 'h-3.5 w-3.5',
  sm: 'h-5 w-5',
  md: 'h-9 w-9',
  lg: 'h-12 w-12',
};

const Loader = ({ variant = 'white', size = 'sm' }: any) => {
  /* Used to wait on --primary landing as an inline style from the org
     branding API before showing a spinner at all — up to 2s of a plain
     "Please wait..." text on every loading state in the app (used in 145+
     files: every table load, modal, and route transition). --primary is
     now a real CSS value from the moment the stylesheet loads, so nothing
     is worth waiting for here. */
  if (!variants[variant]) {
    return <span className="text-sm font-medium text-gray-500 animate-pulse">Please wait...</span>;
  }

  return (
    <svg
      className={`animate-spin ${variants[variant]} ${sizeVariants[size]}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      ></circle>
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
};

export default Loader;
