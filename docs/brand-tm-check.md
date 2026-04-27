# Arasul — Brand & Trademark Check

> **Status (2026-04-24):**
> | Item | State |
> |---|---|
> | Domain landscape (§1) | captured ✅ |
> | `.de` WHOIS research (§1.1) | **pending Kolja** (runbook 0.2) |
> | Name-server strategy (§1.2) | captured ✅ |
> | EUIPO TM search (§2) | **pending Kolja** (runbook 0.5) |
> | USPTO TM search (§3) | **pending Kolja** (runbook 0.5) |
> | Cultural/linguistic review (§4) | done ✅ — Arabic etymology acknowledged + mitigations logged |
> | Existing-product search (§5) | **pending Kolja** — market search by role |
> | Filing timeline (§6) | captured ✅ |
>
> **Purpose:** document the trademark and domain research for the Arasul brand to support launch decisions.

---

## 1. Domains

| Domain | Status (2026-04-24) | Action |
|---|---|---|
| `arasul.dev` | Registered by Kolja ✅ | Primary — use as canonical landing page |
| `arasul.app` | Registered by Kolja ✅ | Product landing / deep links |
| `arasul.io` | Registered by Kolja ✅ | Hedge / API endpoint |
| `arasul.com` | Taken since 2016 (TurnCommerce / NameBright squatter) | Probably 4-figure buyout; skip v1 |
| `arasul.de` | Registered (DENIC `Status: connect`) | **TODO:** identify registrant; decide whether to negotiate |

### 1.1 Action: research `arasul.de` registrant

Run `whois arasul.de` and note:
- Registrant name / organization (if public)
- Creation date
- Registrar
- Email contact (usually proxied)

If it's a squatter or dormant → inquire about purchase. If it's an active German business in an unrelated sector → coexistence is fine (distinct NCL classes), but marketing copy should not imply we own `arasul.de`.

### 1.2 Name-servers / email

Use a single registrar for all three (Cloudflare recommended: free DNS, MX-less until Phase 6).

---

## 2. Trademark — EU (EUIPO)

**Pending:** TMview search at `tmview.europa.eu` for "Arasul."

Classes to search:
- **NCL 9** — computer software, electronic devices
- **NCL 42** — software as a service, SaaS design + development

**Expected outcome:** no exact matches (invented-sounding word). Verify.

### 2.1 Risk flags to document

- Phonetic neighbors: Arasol, Arasul-something, A-sul, Asul
- Wordmark-only or stylized? Decide at application time.
- Germany-priority filing vs EU-wide from day one? Filing EU-wide is more expensive upfront but clean for DACH + international launch.

**Recommended action:** book a 30-min call with a German TM attorney (€200-400) once v1 is 60% done. Premature filings waste money if we rebrand mid-development.

---

## 3. Trademark — US (USPTO)

Run the same search on `uspto.gov TESS` / `tmsearch.uspto.gov`.

US filing is only relevant once we target US customers (Phase 7+). For v1 Beta (DACH), EU filing suffices.

---

## 4. Cultural / Linguistic Review

### 4.1 Arabic etymology — explicit acknowledgement

"Arasul" reads as *ar-rasūl* (الرسول) = "the Messenger/Prophet" in Arabic, specifically associated with Muhammad in Islamic tradition.

**Decision (2026-04-24, logged in memory):** proceed with the name. Launch DACH-first; international Muslim-majority-market marketing will be handled with localized copy that avoids association. Kolja has acknowledged and accepted the risk.

**Mitigations:**
- Avoid religious imagery or colors in branding (green on gold, crescents, etc.).
- Do not use phrasing like "the messenger of AI" or similar in copy that invites the association.
- If any Muslim beta tester surfaces the concern, treat it as a signal and document in the retro.

### 4.2 Other-language checks

Quick check across major European languages:
- DE: no meaning
- FR: no meaning
- ES: no meaning (not similar to "asul" which is blue in Tagalog)
- IT: no meaning
- PT: no meaning
- TR: Turkish readers may parse "ara" (search) + "sul" (?) — mostly harmless

Expand at Phase 6 once we have a localized landing page.

---

## 5. Existing companies / products named Arasul

Search signal (to be filled in):
- [ ] Google web search
- [ ] GitHub search
- [ ] LinkedIn company search
- [ ] ProductHunt

Pre-populate expected: Kolja's own `arasul_tui` sibling directory (internal, not a shipping brand yet) — this plan unifies it. No external collisions expected.

---

## 6. Recommended filing timeline

| Phase | Filing action | Rationale |
|---|---|---|
| Phase 0 (now) | Lock domain ownership | Prevent squatter registration |
| Phase 4 | Book TM attorney consult | Refine class + wordmark vs stylized |
| Phase 5 | File EU wordmark | 3-6 month processing; want issued by public launch |
| Phase 7 | Monitor for infringement | Set up Google Alerts for "Arasul" |
| Phase 8 | US filing if expanding | Only if real US traction |
