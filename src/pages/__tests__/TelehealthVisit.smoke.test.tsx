// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ─────────────────────────────────────────────────────────────────────────────
// TelehealthVisit smoke test
//
// PURPOSE
//   Catch the "blank-render" class of bug on /telehealth/:appointmentId by
//   mounting <TelehealthVisit /> with mocked Supabase / auth / router and
//   asserting the page shell renders the patient header + chart tabs.
//
// WHY VITEST AND NOT PLAYWRIGHT
//   Vitest can't actually load the sandbox or production URL — it runs the
//   component in jsdom/happy-dom in-process. The trade-off is fast feedback
//   on render-time crashes (which is what caused the blank screen seen in the
//   live preview). For end-to-end coverage of sandbox vs production with real
//   auth, a separate Playwright suite would be needed.
//
// KNOWN FAILURE (intentional)
//   At time of writing, this test fails because IntakeReviewPanel does
//   `consents.length > 0` without a fallback for `useQuery`'s initial
//   `data: undefined`. That synchronous throw is exactly what blanks the page
//   in the preview. Fix the source (default consents to []), then this test
//   should pass without modification.
// ─────────────────────────────────────────────────────────────────────────────

// ── Hardcoded seeded telehealth appointment id (smoke fixture) ──
const APPOINTMENT_ID = "00000000-0000-0000-0000-0000000000aa";
const PATIENT_ID = "00000000-0000-0000-0000-0000000000bb";
const PROVIDER_ID = "00000000-0000-0000-0000-0000000000cc";
const ENCOUNTER_ID = "00000000-0000-0000-0000-0000000000dd";

// ── Mock router params/navigate ──
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<any>("react-router-dom");
  return {
    ...actual,
    useParams: () => ({ appointmentId: APPOINTMENT_ID }),
    useNavigate: () => vi.fn(),
  };
});

// ── Mock auth ──
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: PROVIDER_ID, email: "test@example.com" } }),
}));
vi.mock("@/contexts/RBACContext", () => ({
  useAuth: () => ({ user: { id: PROVIDER_ID, email: "test@example.com" } }),
}));

// ── Mock toast ──
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// ── Mock heavy child pages so we only test TelehealthVisit shell ──
vi.mock("@/pages/Prescriptions", () => ({
  TelehealthRx: () => <div data-testid="rx-stub">Rx</div>,
}));
vi.mock("@/components/clinical/LabReferenceChip", () => ({
  LabReferenceStrip: () => <div data-testid="lab-stub">Labs</div>,
}));

// ── Mock Supabase client with the queries TelehealthVisit fires ──
const fakeAppointment = {
  id: APPOINTMENT_ID,
  patient_id: PATIENT_ID,
  provider_id: PROVIDER_ID,
  scheduled_at: new Date("2026-04-28T15:00:00Z").toISOString(),
  video_room_url: "https://example.daily.co/test-room",
  clinic_id: null,
  status: "scheduled",
  patients: {
    id: PATIENT_ID,
    first_name: "Smoke",
    last_name: "Tester",
    date_of_birth: "1990-01-01",
    phone: "+15555550100",
    email: "smoke@example.com",
  },
  treatments: { name: "Hormone Consult", category: "telehealth" },
  providers: { first_name: "Dr", last_name: "Provider" },
};

function makeBuilder(result: { data: any; error: any }) {
  // Chainable thenable that resolves to { data, error } at any await point.
  const chain: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (onFulfilled: any, onRejected: any) =>
      Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return chain;
}

vi.mock("@/integrations/supabase/client", () => {
  return {
    supabase: {
      from: (table: string) => {
        switch (table) {
          case "appointments":
            return makeBuilder({ data: fakeAppointment, error: null });
          case "encounters":
            return makeBuilder({ data: { id: ENCOUNTER_ID }, error: null });
          case "patients":
            return makeBuilder({ data: fakeAppointment.patients, error: null });
          case "intake_forms":
            return makeBuilder({ data: null, error: null });
          case "hormone_visits":
            return makeBuilder({ data: null, error: null });
          case "e_consents":
            return makeBuilder({ data: [], error: null });
          case "quick_texts":
            return makeBuilder({ data: [], error: null });
          default:
            return makeBuilder({ data: null, error: null });
        }
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({ data: null, error: null }),
      },
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: PROVIDER_ID } },
          error: null,
        }),
      },
    },
  };
});

// ── ResizeObserver stub (Resizable panels need it in jsdom) ──
beforeEach(() => {
  // @ts-ignore
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

async function renderPage() {
  const { default: TelehealthVisit } = await import("../TelehealthVisit");
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/telehealth/${APPOINTMENT_ID}`]}>
        <TelehealthVisit />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TelehealthVisit smoke", () => {
  it("renders the page shell with patient name (no blank render)", async () => {
    const { container } = await renderPage();

    // After appointment loads, the top bar shows the patient's name.
    await waitFor(
      () => {
        expect(screen.getByText(/Smoke Tester/i)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );

    // Not blank: meaningful DOM beyond an empty wrapper.
    expect(container.textContent?.length ?? 0).toBeGreaterThan(20);

    // Right-panel chart tabs render — proves ResizablePanelGroup mounted.
    expect(screen.getByRole("tab", { name: /chart/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /prescribe/i })).toBeInTheDocument();
  });
});