"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/ui/Modal";
import { colors } from "@/lib/design-tokens";

const STORAGE_KEY = "swm_welcomed";

type Slide = {
  icon: React.ReactNode;
  title: string;
  description: string;
  highlight?: string;
};

const slides: Slide[] = [
  {
    icon: (
      <svg
        className="w-16 h-16"
        fill="none"
        viewBox="0 0 64 64"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="32" cy="32" r="28" />
        <path d="M32 18v14l10 6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 42c4-6 8-8 12-8s8 2 12 8" strokeLinecap="round" />
        <circle cx="32" cy="26" r="6" />
      </svg>
    ),
    title: "Welcome to Stand With Meg",
    description:
      "A platform where families affected by family court and child welfare systems can share their experiences, find community, and drive change together.",
  },
  {
    icon: (
      <svg
        className="w-16 h-16"
        fill="none"
        viewBox="0 0 64 64"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <rect x="10" y="14" width="44" height="36" rx="3" />
        <path d="M10 24h44" />
        <path d="M22 34h20" strokeLinecap="round" />
        <path d="M22 42h14" strokeLinecap="round" />
        <circle cx="16" cy="19" r="2" fill="currentColor" />
        <circle cx="22" cy="19" r="2" fill="currentColor" />
        <circle cx="28" cy="19" r="2" fill="currentColor" />
      </svg>
    ),
    title: "Share Your Story",
    description:
      "Complete our confidential survey to add your voice to the movement. Choose your level of visibility — from fully anonymous to sharing your full story publicly.",
    highlight: "Your voice joins thousands of families already heard",
  },
  {
    icon: (
      <svg
        className="w-16 h-16"
        fill="none"
        viewBox="0 0 64 64"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <rect x="8" y="12" width="48" height="40" rx="3" />
        <path d="M8 22h48" />
        <path d="M18 32v14" strokeLinecap="round" />
        <path d="M28 36v10" strokeLinecap="round" />
        <path d="M38 28v18" strokeLinecap="round" />
        <path d="M48 32v14" strokeLinecap="round" />
        <circle cx="18" cy="28" r="3" fill="currentColor" />
        <circle cx="28" cy="32" r="3" fill="currentColor" />
        <circle cx="38" cy="24" r="3" fill="currentColor" />
        <circle cx="48" cy="28" r="3" fill="currentColor" />
      </svg>
    ),
    title: "See the Data",
    description:
      "Explore our interactive dashboard revealing patterns across the justice system. Dive into state-by-state reports to understand what families experience in your area.",
    highlight: "Track patterns across all 50 states",
  },
  {
    icon: (
      <svg
        className="w-16 h-16"
        fill="none"
        viewBox="0 0 64 64"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <circle cx="32" cy="20" r="8" />
        <circle cx="16" cy="36" r="6" />
        <circle cx="48" cy="36" r="6" />
        <circle cx="24" cy="52" r="5" />
        <circle cx="40" cy="52" r="5" />
        <path d="M26 24l-6 8" strokeLinecap="round" />
        <path d="M38 24l6 8" strokeLinecap="round" />
        <path d="M20 40l2 8" strokeLinecap="round" />
        <path d="M44 40l-2 8" strokeLinecap="round" />
        <path d="M29 52h6" strokeLinecap="round" />
      </svg>
    ),
    title: "Connect With Others",
    description:
      "Join Connection Circles to find families who share your experience. Connect with others in your state, those who've faced similar challenges, and people ready to support each other.",
    highlight: "Find families who share your experience",
  },
];

export function WelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    // Check if user has already been welcomed
    if (typeof window !== "undefined") {
      const hasBeenWelcomed = localStorage.getItem(STORAGE_KEY);
      if (!hasBeenWelcomed) {
        // Small delay for better UX
        const timer = setTimeout(() => setIsOpen(true), 500);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem(STORAGE_KEY, "true");
    setIsOpen(false);
  };

  const handleSkip = () => {
    handleClose();
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handleBack = () => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleDotClick = (index: number) => {
    setDirection(index > currentSlide ? 1 : -1);
    setCurrentSlide(index);
  };

  const isLastSlide = currentSlide === slides.length - 1;

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 300 : -300,
      opacity: 0,
    }),
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      size="lg"
      closeOnBackdrop={false}
      showCloseButton={false}
    >
      <div className="relative overflow-hidden">
        {/* Header with Skip button */}
        <div className="flex justify-end p-4 pb-0">
          <button
            onClick={handleSkip}
            className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: `rgba(244, 241, 234, 0.5)` }}
          >
            Skip
          </button>
        </div>

        {/* Slide content */}
        <div className="px-8 pb-6 pt-2" style={{ minHeight: "320px" }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentSlide}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 300, damping: 30 },
                opacity: { duration: 0.2 },
              }}
              className="flex flex-col items-center text-center"
            >
              {/* Icon */}
              <div
                className="mb-6 p-4 rounded-2xl"
                style={{
                  color: colors.gold.DEFAULT,
                  backgroundColor: colors.gold.wash,
                }}
              >
                {slides[currentSlide].icon}
              </div>

              {/* Title */}
              <h2
                className="text-2xl font-bold mb-3"
                style={{ color: colors.paper.DEFAULT }}
              >
                {slides[currentSlide].title}
              </h2>

              {/* Description */}
              <p
                className="text-base leading-relaxed max-w-md"
                style={{ color: `rgba(244, 241, 234, 0.7)` }}
              >
                {slides[currentSlide].description}
              </p>

              {/* Highlight text */}
              {slides[currentSlide].highlight && (
                <p
                  className="mt-4 text-sm font-semibold px-4 py-2 rounded-full"
                  style={{
                    color: colors.gold.DEFAULT,
                    backgroundColor: colors.gold.wash,
                  }}
                >
                  {slides[currentSlide].highlight}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dot indicators */}
        <div className="flex justify-center gap-2 pb-6">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => handleDotClick(index)}
              className="w-2.5 h-2.5 rounded-full transition-all duration-200"
              style={{
                backgroundColor:
                  index === currentSlide
                    ? colors.gold.DEFAULT
                    : `rgba(244, 241, 234, 0.2)`,
                transform: index === currentSlide ? "scale(1.2)" : "scale(1)",
              }}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>

        {/* Navigation buttons */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{
            borderTop: `1px solid ${colors.hairline.DEFAULT}`,
            backgroundColor: colors.surface.DEFAULT,
          }}
        >
          <button
            onClick={handleBack}
            disabled={currentSlide === 0}
            className="px-5 py-2.5 rounded-lg font-medium text-sm transition-all"
            style={{
              color:
                currentSlide === 0
                  ? `rgba(244, 241, 234, 0.3)`
                  : colors.paper.DEFAULT,
              backgroundColor:
                currentSlide === 0 ? "transparent" : `rgba(255, 255, 255, 0.08)`,
              cursor: currentSlide === 0 ? "not-allowed" : "pointer",
            }}
          >
            Back
          </button>

          <button
            onClick={handleNext}
            className="px-6 py-2.5 rounded-lg font-bold text-sm transition-all hover:brightness-110"
            style={{
              backgroundColor: isLastSlide
                ? colors.gold.DEFAULT
                : colors.gold.DEFAULT,
              color: colors.ink.DEFAULT,
            }}
          >
            {isLastSlide ? "Get Started" : "Next"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Helper component to reset the welcome state (for testing)
export function ResetWelcome() {
  const handleReset = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  return (
    <button
      onClick={handleReset}
      className="text-xs underline opacity-50 hover:opacity-100"
      style={{ color: colors.paper.muted }}
    >
      Reset Welcome
    </button>
  );
}
