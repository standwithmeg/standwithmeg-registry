
import { NAVY, RED } from "../theme";

export default function ConnectSuccessPage() {
  return (
    <main className="min-h-screen" style={{ backgroundColor: NAVY, color: "white" }}>
      <div className="h-1" style={{ backgroundColor: RED }} />
      <section className="px-6 py-10">
        <div className="mx-auto max-w-xl rounded-2xl p-8 text-center" style={{ backgroundColor: "rgba(244,241,234,0.05)", border: "1px solid rgba(212,168,64,0.22)" }}>
        <p className="kicker text-xs" style={{ color: RED }}>Stand With Meg</p>
        <h1 className="mt-2 text-3xl font-black">Thank you</h1>
        <p className="mt-4 text-sm leading-relaxed text-[#f4f1ea]/70">
          Your payment was sent to Stripe. Access updates after Stripe confirms the checkout through the secure webhook.
        </p>
        <a href="/connect" className="mt-6 inline-block rounded-lg px-5 py-3 font-black" style={{ backgroundColor: RED, color: "white" }}>
          Return to Connection Circles
        </a>
      </div>
      </section>
    </main>
  );
}
