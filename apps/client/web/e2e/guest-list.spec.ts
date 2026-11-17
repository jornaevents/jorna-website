import { test, expect, loginAs } from "./support/fixtures";
import type { ApiMock, HandlerArgs } from "./support/api-mock";

// The guest list as a section of the event's page (2026-11-17): the totals,
// Add guest in a drawer, a table of households that open to edit, and the old
// /guests address sending people there.

const EVENT = { event_id: "event-1", user_id: "user-1", name: "Priya's Wedding", date_iso: "2099-05-22", location: "Edison, NJ", guest_count: 12 };
const FUNCTIONS = [
  { function_id: "f-sangeet", event_id: "event-1", name: "Sangeet", sort_order: 0 },
  { function_id: "f-wedding", event_id: "event-1", name: "Wedding", sort_order: 1 },
];

type Invite = { function_id: string; status: "no_reply" | "attending" | "declined"; attending_count?: number | null };
type G = { guest_id: string; name: string; party_size: number; self_added: boolean; token: string; invites: Invite[]; email?: string | null };

function guest(id: string, name: string, size: number, invites: Invite[]): G {
  return { guest_id: id, name, party_size: size, self_added: false, token: `tok-${id}`, invites };
}

function mock(api: ApiMock, guests: G[]) {
  api.error("GET", "/vendors/me", 404, "Not a vendor");
  api.get("/conversations/unread-count", { unread_count: 0 });
  api.get("/events", [EVENT]);
  api.get("/bundles", []);
  api.get("/events/event-1/guests", () => ({
    functions: FUNCTIONS,
    guests,
    headcount: FUNCTIONS.map((f) => ({ function_id: f.function_id, name: f.name, invited: guests.length, attending: 0, declined: 0, no_reply: guests.length, expected: 12 })),
    invite_link: null,
  }));
}

test("Guest List is a section of the event, with the totals and a table of households", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api, [
    guest("g1", "Shah household", 4, [
      { function_id: "f-sangeet", status: "attending" },
      { function_id: "f-wedding", status: "attending" },
    ]),
    guest("g2", "Patel household", 3, [
      { function_id: "f-sangeet", status: "declined" },
      { function_id: "f-wedding", status: "attending", attending_count: 2 },
    ]),
    guest("g3", "Mehta household", 2, [{ function_id: "f-wedding", status: "no_reply" }]),
    guest("g4", "The Iyers", 1, [{ function_id: "f-wedding", status: "declined" }]),
  ]);

  await page.goto("event/?id=event-1");
  const sections = page.getByRole("complementary", { name: "Event sections" });
  await sections.getByRole("link", { name: "Guest List" }).click();
  await expect(page).toHaveURL(/tab=guests/);
  // Still the event's page: its title and sidebar stay.
  await expect(page.getByRole("heading", { level: 1, name: "Priya's Wedding" })).toBeVisible();
  await expect(sections.getByRole("link", { name: "Guest List" })).toHaveAttribute("aria-current", "page");

  await expect(page.getByText("Everyone celebrating with you")).toBeVisible();
  // People, not households: 4 + 3 + 2 + 1 invited; 4 + 2 coming.
  for (const [label, n] of [["Invited", "10"], ["Attending", "6"], ["Awaiting", "2"], ["Declined", "1"]]) {
    await expect(page.getByText(label, { exact: true }).locator("..")).toContainText(n);
  }
  // Only Add guest — no Import or Send invitations yet.
  await expect(page.getByRole("button", { name: "Add guest" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send invitations" })).toHaveCount(0);

  const rows = page.getByRole("list", { name: "Guests" });
  await expect(rows.getByRole("button", { name: /Shah household/ })).toContainText("All attending");
  await expect(rows.getByRole("button", { name: /Patel household/ })).toContainText("Wedding");
  await expect(rows.getByRole("button", { name: /Mehta household/ })).toContainText("Awaiting RSVP");
  await expect(rows.getByRole("button", { name: /The Iyers/ })).toContainText("Can't come");
});

test("Add guest opens a drawer that adds to the table; a row opens to edit", async ({ page, api }) => {
  await loginAs(page, api);
  const guests: G[] = [guest("g1", "Shah household", 4, [{ function_id: "f-wedding", status: "no_reply" }])];
  mock(api, guests);
  api.post("/events/event-1/guests", ({ route }: HandlerArgs) => {
    const body = route.request().postDataJSON();
    const g = guest("g2", body.name, body.party_size, FUNCTIONS.map((f) => ({ function_id: f.function_id, status: "no_reply" as const })));
    guests.push(g);
    return g;
  });
  api.patch("/guests/g1", ({ route }: HandlerArgs) => {
    Object.assign(guests[0], { party_size: route.request().postDataJSON().party_size });
    return guests[0];
  });

  await page.goto("event/?id=event-1&tab=guests");
  await page.getByRole("button", { name: "Add guest" }).click();
  const add = page.getByRole("dialog", { name: "Add guests" });
  await add.getByLabel("Name").fill("Kapoor family");
  await add.getByLabel("How many").fill("5");
  await add.getByRole("button", { name: "Add guest" }).click();
  await expect(page.getByRole("list", { name: "Guests" }).getByRole("button", { name: /Kapoor family, 5 people/ })).toBeVisible();
  await add.getByRole("button", { name: "Close" }).click();

  await page.getByRole("list", { name: "Guests" }).getByRole("button", { name: /Shah household/ }).click();
  const edit = page.getByRole("dialog", { name: "Shah household" });
  await expect(edit.getByRole("button", { name: "Copy their RSVP link" })).toBeVisible();
  await edit.getByLabel("How many").fill("6");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Guests" }).getByRole("button", { name: /Shah household, 6 people/ })).toBeVisible();
});

test("the old /guests address opens the event's Guest List", async ({ page, api }) => {
  await loginAs(page, api);
  mock(api, []);

  await page.goto("guests/?event=event-1");
  await expect(page).toHaveURL(/\/event\/?\?id=event-1&tab=guests$/);
  await expect(page.getByText("Nobody yet.")).toBeVisible();
});
