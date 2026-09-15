# Design decisions

**English** · [中文](decisions.zh-CN.md)

The README states what this method does; the [blind audit of three
decks](../outputs/three-deck-blind-audit-2026-07-17.md) records what it produced
on real material. This document states why these boundaries and not others: each
decision names the alternative it rejected and the cost the choice carried. Six
decisions mattered more than the rest.

## The first step is building the ledger, not forming a judgment

The natural approach is to read the whole deck, form an overall impression, and
then go back for evidence supporting it. That is how a human analyst actually
works, it is far faster, and on a well-made deck it is often enough.

It was rejected because what is wrong with a deck is rarely a single false
sentence. The problem is that **figures do not reconcile across pages**, and an
overall narrative is exactly the thing most able to smooth a cross-page
contradiction away — once a judgment is formed, looking for evidence becomes
looking for supporting evidence. The Lancet Robotics deck is the proof: the
revenue projection chart showed page labels of 3,000 / 8,000 / 16,000 / 25,000 /
38,000 / 50,000 (ten-thousand RMB) for 2025–2030, while the PPT chart's
underlying cache held 6,000 / 15,000 / 30,000 / 60,000 / 80,000 / 100,000. The
two sets never appear on the same page, so a read-then-opine process cannot find
it. The first step is therefore to extract every claim with its page number,
original wording, type, legal entity, product/version, time attribute,
jurisdiction, and evidence form.

**Cost:** eight fields times every claim in a deck is far more front-loaded work
than simply writing a view, and most fields are empty on most claims. On a clean
early-stage deck this method is over-engineering.

## Facts sit in five states, not three

Verified / unverified / contradicts the material — three states are enough, and
easiest to explain to a reader.

It was rejected because three states compress two different distinctions. The
first is on the "unverified" side: a claim whose keyword search returned a hit
but whose entity, sponsor, status and date have not each been matched, and a
claim nobody has looked into yet, land in the same bucket — the first is one step
from being upgraded, the second has no direction yet. The second distinction
matters more: three states leave nowhere to put "I looked, I could not find it,
and here is where I looked." Without that state, **not finding something becomes
not existing**, which is the most expensive class of error in screening. So
`[candidate record · not yet matched]` and `[unverifiable · attempts described]`
exist, and promotion to `[verified · source]` requires matching each field.

**Cost:** one more judgment per claim, longer reports, and a reader who has to
learn five markers before the first page makes sense.

## Red-flag severity and evidence confidence are two separate axes

A single 0–100 risk score is easy to sort, compare and roll up across a
portfolio, and it is what a fund team actually asks for.

Collapsed into one number, "high impact but I am unsure" and "low impact and I am
certain" score the same, while the correct next action for each is the opposite:
the first is go and check, the second is price it in. 🔴🟠🟡 describe potential
impact; high/medium/low describe how certain the analyst is; the two are not
commensurable. The same rule has a corollary: missing information defaults to a
verification item rather than escalating to a red flag, or a company whose deck is
merely terse gets scored as high-risk for being terse.

**Cost:** no answer to "what does this project score". The report has to be read
rather than scanned, which conflicts with how funds actually triage.

## The commercial evidence ladder, never collapsed into one count

Using the deck's own framing — customer count, hospitals covered — is least
effort and most directly comparable across companies.

It was rejected because "working with 30 hospitals" and "paid by 30 hospitals"
are five rungs apart, and in a summary table they look identical. The Lancet deck
contained both "30 units shipped/installed" and "50+ hospitals trialing or
installed": the two numbers neither contradict each other nor add up, because
they count different things, and a deck is under no obligation to point that out.
So the ladder is explicit — lead → pilot → paid contract → delivery → acceptance →
payment received → active use → renewal → expansion — with per-unit utilization,
downtime, service cost and consumable attach rate added for devices.

**Cost:** most decks cannot supply what the ladder needs, so large parts of the
table come back empty and the report reads as fault-finding. That data can only
be requested from the company, which materially lengthens screening.

## A certificate verifies only its own cell in the matrix

If a company holds an FDA or NMPA certificate, the regulatory layer is cleared —
this is what most screening actually does.

It was rejected because a certificate proves something much narrower than it
appears to. Lancet's FDA 510(k) K220774 is genuinely verifiable: product RobPath
Total Hip Application, applicant Hangzhou Lancet Robotics, decision date
2022-12-09. But the deck's fundraising entity is Shenzhen Lancet. The certificate
is real, and what it proves is a specific legal person, a specific product, and a
specific intended use — it cannot establish that the Shenzhen entity owns all the
assets, still less that an entire cross-department platform is registered. The
same deck claimed 11 Class III certificates in a heading while the visible list
expanded only about 10. So multi-product companies require the legal entity —
product SKU — version — certificate — intended use — manufacturing entity —
revenue matrix first, and one certificate does not extrapolate.

**Cost:** step zero for a group company becomes building an entity map, which
often cannot be completed from a single deck — so the conclusion has to stop at
"needs clarification" rather than delivering a rating.

## Valuation output degrades with the data, rather than forcing a multiple

Applying comparable-company multiples and concluding "overvalued by a factor of N"
is the single sentence an investor most wants from a screen.

It was rejected because the denominator of any multiple is the revenue
projection, and the revenue projection is the least reliable number in the deck.
At Lancet's stated pre-money of 1.5 billion RMB, using the visible page labels
versus the chart's cached values changes the revenue multiple by more than a
factor of two — and issuing a multiple when the denominator has two versions is
dressing precision over an input that does not hold. So rNPV only when the data
supports it, scenario ranges when probabilities are thin, and otherwise only a
back-solve for which milestones the current valuation implies.

**Cost:** the most wanted sentence often cannot be produced — and the frequency
with which it cannot rises as material quality falls, meaning the method goes
quiet exactly when judgment is most needed.

## What the blind audit changed

Four of the six decisions above were not designed up front. They came out of the
three-deck blind audit on 2026-07-17, which listed nine process gaps; audit
timing and time attributes, the legal entity — asset — revenue boundary, the
product — version — certificate matrix, and the commercial evidence ladder were
promoted from "an extra step in one domain template" to standard process for
every deck. Forensics on the data underneath charts moved from a marginal feature
to a core diligence capability in the same pass — Lancet's revenue chart is what
proved it is not optional.

That audit also established a stopping rule: when the fundraising entity cannot
be shown to own the key certificates, IP or revenue; when a core chart exists in
two versions; when the registered intended use conflicts with the commercial
claim; or when valuation inputs are missing to the point that no credible range
can be formed — the system moves from scoring to "needs clarification / on hold"
rather than continuing to score with a caveat attached.

How far this can be automated is decided by the data sources, not by the
architecture. ClinicalTrials.gov has a public API, so trial verification is
deterministic; ChiCTR has none, so it is scraped, may hit a CAPTCHA, and falls
back to manual with a search URL. The README's automation boundary table draws
that line in the open, because a tool that claims full automation while quietly
degrading in some jurisdictions is more dangerous than one that states its limits.

The audit's own conclusion belongs here too: this is currently a decent analyst
copilot prototype, not a product that can be delivered reliably to a fund team.
