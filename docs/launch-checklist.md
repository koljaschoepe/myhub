# Arasul — Public Launch Checklist

> Phase 7. Execute when the private beta exit criteria (D7 > 60%, NPS > 30, ≥3 testimonials, 0 data-loss) are green.

## T-minus two weeks

- [ ] Landing page final copy approved (`landing/index.html`)
- [ ] Story video recorded + uploaded (Vimeo or self-hosted)
- [ ] Privacy + Support pages live (`landing/privacy.html`, `landing/support.html`)
- [ ] Metrics dashboard running (downloads, activations, D1/D7/D30 retention)
- [ ] Discord + GitHub issue templates finalized
- [ ] `hello@arasul.dev` + `security@arasul.dev` + `support@arasul.dev` routed to a real inbox
- [ ] Press kit on `arasul.dev/press` (logo SVG/PNG, screenshots, 200-word description)

## T-minus one week

- [ ] Release `arasul-v1.0.0` to R2 (matrix: mac arm64/intel, linux x64, win x64)
- [ ] All four installers smoke-tested on fresh hardware
- [ ] SKU-A waitlist count snapshot (internal metric for Phase 8 demand)
- [ ] One last "ask someone new" usability test
- [ ] Outage playbook drafted (where does traffic land if R2 goes down?)

## Launch day

| Time | Channel | Action |
|---|---|---|
| 08:00 CET | arasul.dev | Publish landing page live (was behind maintenance page) |
| 09:00 CET | Show HN | Post title: "Arasul — a portable AI workspace on a USB-C drive" |
| 10:00 CET | X / Twitter | Post thread with video + 4 screenshots |
| 11:00 CET | PKM Discords (Obsidian, Logseq) | Soft announcement with "sibling tool" framing |
| 12:00 CET | Heise / Golem | Pitch email sent (DACH-first) |
| 15:00 CET | Reddit r/selfhosted | Post (only if karma positive — if HN goes well, reddit is bonus) |
| ongoing | Discord | Answer every question under 30 min |

## Launch day metrics to watch

- Homepage → signup conversion rate
- Signup → beta-approved rate (we should be able to lift the 25/month gate for launch)
- First-plug-in success rate (tracked via opt-in telemetry if consented)
- Error reports in `#bug-reports` (target: zero drive-eats-data, <5 UI bugs)

## Day +1

- [ ] Publish "what we learned" post on arasul.dev/blog
- [ ] Thank everyone who wrote in (personal replies)
- [ ] Retro in `docs/retros/phase-7.md`

## Day +7

- [ ] First post-launch release (accumulated bug-fixes) — `arasul-v1.0.1`
- [ ] Decide Phase 8 (SKU A preloaded SSDs) — price and SKU based on demand data
