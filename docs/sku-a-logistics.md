# Arasul — SKU A Preloaded SSD Logistics

> Phase 8 (6-12 weeks after Phase 7 public launch).
>
> The preloaded-SSD product: you ship customers a drive with Arasul already installed, in a quiet sleeve.
> Target: first 100-unit pilot run.

## Hardware short-list

Evaluate in this order:

| Candidate | Pros | Cons | Rough BOM |
|---|---|---|---|
| **Samsung T7 Shield 1 TB** | IP65, shock-rated, well-known brand | Samsung logo dominant | ~€100 |
| **SanDisk Extreme Pro 1 TB v2** | Fast, compact | Brand not as clean | ~€110 |
| **Crucial X9 Pro 1 TB** | Smallest physical profile | Less known | ~€95 |
| **OEM-branded (Alibaba/DealExtreme)** | Custom branding possible | Quality variance, RMA risk | €40-60 |

Decision: start with Samsung T7 Shield for the pilot (brand trust matters at launch). Evaluate OEM-branded in batch 2.

## Pilot batch plan (100 units)

1. Buy 100 T7 Shield 1 TB units (expect 1-2 DoA per 100 → order 103).
2. Bulk imaging over 2 weekends using `tooling/factory-image-batch.sh` and a 16-port USB-C hub — realistic throughput: 4 drives / 15 min = 16/hr × 8hr = 128/day. One weekend is enough.
3. Per-unit QA (see below). Reject any that fail.
4. Sleeve + packaging from a local print shop (German-first: `PaulPrint Berlin` or similar — MOQ usually 100).
5. Ship via DHL via Shopify.

## Per-unit QA

Before sleeving:

```bash
# plug drive, run from mac:
tooling/qa-check.sh /Volumes/Arasul-<id>
```

The `qa-check.sh` script (to be written) verifies:
1. `diskutil info` reports expected size ± 5 %.
2. `manifest.json` sha256 matches the factory checksum.
3. All four OS binaries (mac arm64/intel, win, linux) are present.
4. `arasul-app/src-tauri/target/release/arasul-app --version` prints the expected version when launched from the drive on a Mac (only axis we can test in-shop).

Log the pass/fail to `factory-batch-<id>.csv`. Store that file in Git — production audit trail.

## Packaging

**Sleeve:** dark grey cotton, 12×8 cm, single "Arasul" wordmark in gold foil (1A Linear-clean palette — accent `#7C8FFC` doesn't print well in foil; gold for texture).
Inside:
- The drive
- A quick-start card (A6, one side only): "Plug in. Set a passphrase. Eject when done." + QR to `arasul.dev/start`
- A tiny screen cleaner cloth (cost ~€0.20, adds "nice gift" feel)

**Box:** plain kraft mailer, DHL Warenpost S.

## Pricing model (decision: re-opened after pilot)

- **Material cost** per unit: ~€105 (SSD) + €3 sleeve + €2 packaging + €0.50 QA time = **~€110**
- **DHL shipping** (DE): €4.00, EU: €8.50, intl: ~€15
- **Target margin**: 40 % gross → sell at €179 DE / €195 EU inclusive shipping

Revisit once we see conversion from the landing "get notified" waitlist.

## Shopify storefront

- Single product (initially): "Arasul — Portable AI Workspace (1 TB)"
- One variant later: 2 TB Samsung T7 Shield (+€40 retail)
- DHL Warenpost / DHL Paket integration via Shopify's DHL app
- VAT: MOSS for EU, reverse-charge for businesses (collect VAT ID at checkout)
- Payment: Stripe + PayPal + Klarna (DE customers love Klarna)

## Timeline

| Week | Action |
|---|---|
| +6 from public launch | Order pilot 103-unit batch of SSDs |
| +7 | Receive drives; start factory imaging |
| +8 | Sleeve order placed |
| +9 | Sleeves received; hand-assemble first 100 |
| +10 | Shopify storefront live; first 25 shipped to highest-conversion waitlist signers |
| +11-12 | Monitor support load; adjust for batch 2 |
| +12 | Evaluate batch 2 scale (200? 500?) and OEM-branded option |

## Customer support floor

SKU A customers get a one-shot "drive replacement" guarantee in the first 30 days — if the drive fails QA in their hands, we ship a replacement, they keep the broken one. This caps support complexity during the pilot; revisit after 500 units.
