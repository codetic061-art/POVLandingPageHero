import { PinnedBookingExperience } from "./components/PinnedBookingExperience";

const NAV_ITEMS = [
  { label: "The Space", href: "#the-space" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About POV", href: "#about-pov" },
] as const;

export default function App() {
  return (
    <PinnedBookingExperience>
      {/* Minimal POV Top Navigation */}
      <header
        data-name="Navigation"
        className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-5 pt-6 sm:px-8 md:px-12 md:pt-7 xl:px-14 xl:pt-8"
      >
        <a
          href="#top"
          aria-label="POV"
          onClick={(e) => e.preventDefault()}
          className="pointer-events-auto inline-flex shrink-0 items-center rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4257F5]"
        >
          <img
            src="/pov-wordmark.png"
            data-name="Navigation / POV wordmark"
            alt="POV"
            className="h-[21px] w-auto max-w-none sm:h-[24px] md:h-[27px] xl:h-[30px]"
            draggable={false}
          />
        </a>

        <nav
          aria-label="Primary navigation"
          className="pointer-events-auto flex items-center gap-3.5 sm:gap-7 md:gap-9 xl:gap-11"
        >
          {NAV_ITEMS.map((item) => (
            <a
              key={item.label}
              data-name={`Navigation / ${item.label}`}
              href={item.href}
              onClick={(e) => e.preventDefault()}
              className="relative whitespace-nowrap py-1 text-[10px] font-normal tracking-[-0.01em] text-[#292B2E] transition-colors duration-150 hover:text-[#4257F5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4257F5] sm:text-[14px] xl:text-[15.5px]"
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
    </PinnedBookingExperience>
  );
}
