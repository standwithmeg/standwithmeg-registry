"use client";

import { useEffect } from "react";

export function PrintAutoTrigger() {
  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="no-print toolbar">
      <p>This page is formatted for PDF. Choose <strong>Save as PDF</strong> in the print dialog.</p>
      <button type="button" onClick={() => window.print()}>
        Print / Save as PDF
      </button>
    </div>
  );
}