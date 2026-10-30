#!/usr/bin/env python3
"""Regenerate the MGM_DATA block in membershipModelConfig.js from Interstate CSVs.

Aggregates only. No member business name and no per-location billing figure is
ever written to the config -- this repo is PUBLIC (GitHub Pages), so a leak here
is a publication, not a mistake. `privacy_guard()` enforces that before the file
is touched instead of trusting this docstring.

    python tools/refresh-membership-config.py \
        --locations location-list-2026-11-30.csv \
        --billing   company_membership_report_2026-11-30.csv \
        --asof      "Nov 30, 2026"

Run it from the repo root; the config path is relative to the working directory.
Add --dry-run to print the block without touching the file.

The signup history comes from a spreadsheet, not these CSVs, so the ptpNote,
history and monthlyHistory blocks are carried through from the existing config
byte-for-byte. The labels and report blocks are never read or written here.

Follows the repo's documented seed-regeneration pattern (CLAUDE.md, "Data seed
pattern"): a Python script replaces one block in place via sentinel comments.
Standard library only -- this repo has no package manifest.
"""
import argparse
import csv
import datetime as dt
import os
import re
import sys
from collections import Counter, defaultdict

# The sentinels and the em-dashes in the emitted comments are non-ASCII, and the
# default Windows console codepage (cp1252) cannot encode them -- printing the
# block would die with UnicodeEncodeError before writing anything.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):      # redirected to a non-text stream
        pass

CONFIG = "membershipModelConfig.js"
START = "// ── MGM_DATA ──"
END = "// ── /MGM_DATA ──"

# Rows that are not member locations: the corporate rows are Fuelman/RCheck
# payment records and the demo company holds seed data. Dropping them is what
# separates the active member base from the raw active-row count.
#
# Deliberately no figures here. This comment named the pair from the export it
# was written against, and both numbers went stale at the next refresh -- which
# is a script whose whole job is to keep such numbers current. The script prints
# the dropped rows and the resulting base on every run; that output is the
# record, not a comment that cannot update itself.
EXCLUDE_COMPANIES = {"roady's corporate office", "demo truck stops"}
EXCLUDE_COMPANY_RE = re.compile(r"^test company\s*#", re.I)

# Carried verbatim out of the old config, in file order, because they come from
# `Historical member signups.xlsx` and not from either CSV.
HISTORY_SOURCE = "Historical member signups.xlsx"
# ptpHeldCount (2026-10-30): PTP's held-flat headcount for the growth engine
# (membershipModelConfig.js has the full reasoning) is a standing fact about
# the PTP channel, not a CSV aggregate this script computes -- same category
# as ptpNote, must stay immediately before it in this tuple and in the file
# (carried_span() requires the carried fields to be one contiguous block).
CARRIED = ("ptpHeldCount", "ptpNote", "history", "monthlyHistory")

GROUPS = [
    ("ts", "Truck Stop"),
    ("tssc", "Truck Stop-Service Center"),
    ("cstore", "C-Stores"),
    ("ppo", "PPO"),
    ("lite", "Roady's Lite"),
    ("fuel", "Fuel Stops"),
    ("svc", "Service Centers"),
]
# Type -> group key. PTP was removed as a group (2026-10-30): it was never a
# real location type, only a sales-channel tag on the Group column, and
# classifying by it discarded the location's real Type -- a PTP-tagged truck
# stop, PPO and service center all landed in one bucket, modeled with one
# engine profile. Every location now classifies by its real Type alone,
# the same as a Roady's-tagged one; a PTP tag no longer changes the bucket.
# (Roady's Lite is still its own deliberate sub-brand distinction, keyed on
# Group below in classify() -- that one is a real grouping choice, not a
# sales-channel label hiding the real type.)
TYPE_TO_KEY = {
    "truck stop": "ts",
    "truck stop / service center": "tssc",
    "c-store": "cstore",
    "ppo": "ppo",
    "fuel stop": "fuel",
    "service center": "svc",
}

# Column spellings seen across exports. The first present alias wins; a missing
# required column is a hard error, because reading it as absent would silently
# aggregate zeros and write a confidently wrong config.
LOCATION_COLUMNS = {
    "ID": (["ID", "Location ID"], False),
    "Company": (["Company", "Company Name"], True),
    "Type": (["Type", "Location Type"], True),
    "Group": (["Group", "Member Group"], True),
    "Name": (["Name", "Location Name"], False),
    "Status": (["Status"], True),
}
BILLING_COLUMNS = {
    "Company": (["Company", "Company Name"], True),
    "Locations": (["Locations", "Location Count"], True),
    "Dues": (["Membership (Billing)", "Membership Billing"], True),
}

# P&L field names the committed test suite bans from the config outright. The
# reporting entity's name is deliberately NOT spelled here: it is a company in
# the source CSVs, so the member-name check below already covers it, and a
# guard that quotes the secret it protects publishes it (see the comment on the
# regex that was removed from membershipModel.test.js for exactly that reason).
BANNED_TERMS = ("payroll", "opex", "grossProfit", "gross profit", "netIncome",
                "net income", "netMargin", "net margin", "settlementSpread")

ALLOWED_KEYS = {
    "DATA_ASOF", "CURRENT_YEAR", "ASOF_MONTH", "HORIZON_YEARS",
    "groups", "key", "label", "count",
    "billing", "companies", "locations", "monthlyDuesTotal",
    "duesPerLocBillable", "payingLocations", "zeroBillCompanies",
    "duesPerLocBillableExclCStores", "payingLocationsExclCStores",
    "monthlyDuesTotalExclCStores", "cstoreExcludedCompanies",
    "cstoreExcludedLocations", "cstoreExcludedDues",
    "statusCounts", "onboarding", "offboarding",
}

MONTHS = ["January", "February", "March", "April", "May", "June", "July",
          "August", "September", "October", "November", "December"]


# ---------------------------------------------------------------- CSV reading

def resolve_columns(path, fieldnames, spec):
    """Map canonical column names onto whatever this export actually calls them."""
    present = {(f or "").strip(): (f or "") for f in (fieldnames or [])}
    mapping, missing = {}, []
    for canon, (aliases, required) in spec.items():
        hit = next((present[a] for a in aliases if a in present), None)
        if hit is None and required:
            missing.append("%s (any of: %s)" % (canon, ", ".join(aliases)))
        mapping[canon] = hit
    if missing:
        sys.exit("%s is missing required column(s):\n  %s\nColumns found: %s"
                 % (path, "\n  ".join(missing), ", ".join(present) or "(none)"))
    return mapping


def cell(row, cols, canon):
    col = cols.get(canon)
    return (row.get(col) or "").strip() if col else ""


def is_junk(company):
    c = company.strip().lower()
    return c in EXCLUDE_COMPANIES or bool(EXCLUDE_COMPANY_RE.match(c))


def classify(group, rtype):
    if group == "Roady's Lite":
        return "lite"
    return TYPE_TO_KEY.get(rtype.lower())


def read_locations(path):
    counts, status, ptp_tagged = Counter(), Counter(), Counter()
    dropped, unclassified, names = [], [], set()
    # Company -> set of real Types among its ACTIVE locations, lowercased.
    # This is what the C-Stores dues-average fix (read_billing) uses to tell
    # a company whose billing line is unambiguously C-Store revenue (every
    # active location is a C-Store) from one that blends C-Store with
    # another type under one billing figure with no per-location split --
    # the latter is never excluded, since excluding it would mean inventing
    # an allocation the source data does not support.
    company_types = defaultdict(set)
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rdr = csv.DictReader(fh)
        cols = resolve_columns(path, rdr.fieldnames, LOCATION_COLUMNS)
        for row in rdr:
            company = cell(row, cols, "Company")
            if company:
                names.add(company)
            st = cell(row, cols, "Status").lower()
            if is_junk(company):
                dropped.append((cell(row, cols, "ID"), company,
                                cell(row, cols, "Name"), st))
                continue
            status[st] += 1
            if st == "active":
                company_types[company].add(cell(row, cols, "Type").strip().lower())
            # Counted AFTER the junk filter above, so these are real sites.
            # Worth stating because the arithmetic is a trap: the Oct 29 export
            # has 10 raw onboarding rows, 3 of them test/demo, leaving 7 -- and
            # 7 is exactly what the PREVIOUS config carried as its raw count
            # before that hand correction to 4. A reader comparing the two
            # could reasonably conclude the exclusion stopped working and
            # "re-fix" 7 back to 4. It is working; the figure moved because the
            # data did.
            if st != "active":
                continue
            group = cell(row, cols, "Group")
            key = classify(group, cell(row, cols, "Type"))
            # PTP no longer changes the bucket (see TYPE_TO_KEY's comment), but
            # the real count of PTP-tagged active rows is still worth printing
            # every refresh -- it's the reconciliation check for the hand-
            # maintained ptpHeldCount field, which this script never touches.
            # Tagged BEFORE the unclassified check below, not after: a
            # PTP-tagged row with an unrecognised Type is exactly the row
            # most likely to be wrong, so it must not silently disappear
            # from this count the same way it disappears from `counts`.
            if group == "PTP":
                ptp_tagged[key if key is not None else "(unclassified)"] += 1
            if key is None:
                unclassified.append((cell(row, cols, "ID"), group,
                                     cell(row, cols, "Type")))
                continue
            counts[key] += 1
    return counts, status, dropped, unclassified, names, ptp_tagged, company_types


def money(s):
    return float((s or "0").replace(",", "").replace("$", "").strip() or 0)


def read_billing(path, company_types):
    companies = locations = paying_locations = zero_companies = 0
    dues = 0.0
    # A PURE C-Store company -- every active location of its company_types
    # set is "c-store" -- bills one figure that is unambiguously C-Store
    # revenue, so it is cleanly removable from both halves of the average.
    # A company that BLENDS C-Store with another type (Truck Stop, PPO, Fuel
    # Stop) bills one dollar figure for the whole company with no
    # per-location split in this source data -- the owner's explicit
    # decision (2026-10-30) is to leave those locations and that dues figure
    # IN the average rather than guess an allocation the data cannot support.
    cstore_excl_companies = cstore_excl_locations = 0
    cstore_excl_dues = 0.0
    # Billing rows whose Company has NO entry at all in company_types --
    # i.e. the location-list CSV has no active row for that company name.
    # company_types.get(name) returns None for these, which silently takes
    # the "not pure C-Store" branch below exactly as if the company really
    # were a mix of types -- identical outcome, opposite reason, and no
    # signal either way that the join missed. A case/punctuation mismatch
    # between the two exports would produce this same silent non-exclusion,
    # which is precisely the under-exclusion risk "2026-10-30 EXCEPTION #2"
    # already accepts for the vintage gap -- it must not ALSO hide inside a
    # name-join nobody is watching.
    unmatched_billing_companies = []
    names = set()
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rdr = csv.DictReader(fh)
        cols = resolve_columns(path, rdr.fieldnames, BILLING_COLUMNS)
        for row in rdr:
            name = cell(row, cols, "Company")
            if name:
                names.add(name)
            if name and name not in company_types:
                unmatched_billing_companies.append(name)
            companies += 1
            n = int(money(cell(row, cols, "Locations")))
            locations += n
            amount = money(cell(row, cols, "Dues"))
            dues += amount
            if amount > 0:
                paying_locations += n
                # Only a PAYING pure C-Store company is subtracted -- a
                # zero-bill one already contributes nothing to
                # paying_locations/dues, so subtracting it again would
                # double-remove locations that were never in this total.
                if company_types.get(name) == {"c-store"}:
                    cstore_excl_companies += 1
                    cstore_excl_locations += n
                    cstore_excl_dues += amount
            else:
                zero_companies += 1
    paying_locations_excl = paying_locations - cstore_excl_locations
    dues_excl = dues - cstore_excl_dues
    return {
        "unmatchedBillingCompanies": unmatched_billing_companies,
        "companies": companies,
        "locations": locations,
        "monthlyDuesTotal": int(round(dues)),
        # Paying locations, NOT all locations. A realization ratio answers
        # "of what we could bill, how much do we model collecting", so the
        # locations at companies billing $0.00 do not belong in the
        # denominator. Dividing by `locations` here published a 98.7%
        # realization where the honest figure is 94.6%.
        "duesPerLocBillable": (round(dues / paying_locations, 2)
                               if paying_locations else 0.0),
        "payingLocations": paying_locations,
        "zeroBillCompanies": zero_companies,
        # The true-stop-only pair: C-Stores' legitimately low $100-250
        # membership fees drag down a per-location average that is meant to
        # read as "what a truck stop / PPO / etc. location bills", so this
        # pair excludes the unambiguous (pure C-Store) slice from both the
        # numerator and the denominator. monthlyDuesTotal/companies/
        # locations/payingLocations above are UNCHANGED -- C-Stores' own
        # dues revenue still appears in full everywhere else (Starting
        # Membership, overall company dues revenue); only this specific
        # per-location comparison excludes it.
        "duesPerLocBillableExclCStores": (round(dues_excl / paying_locations_excl, 2)
                                          if paying_locations_excl else 0.0),
        "payingLocationsExclCStores": paying_locations_excl,
        "monthlyDuesTotalExclCStores": int(round(dues_excl)),
        "cstoreExcludedCompanies": cstore_excl_companies,
        "cstoreExcludedLocations": cstore_excl_locations,
        "cstoreExcludedDues": int(round(cstore_excl_dues)),
    }, names


# ------------------------------------------------- existing-config extraction

def check_sentinels(text):
    """A partial write to a public repo's committed config cannot be undone by
    re-running, so every sentinel defect is fatal before anything is built."""
    for label, sentinel in (("START", START), ("END", END)):
        n = text.count(sentinel)
        if n == 0:
            sys.exit("%s sentinel not found in %s. Refusing to write."
                     % (label, CONFIG))
        if n > 1:
            sys.exit("%s sentinel appears %d times in %s; it must appear exactly "
                     "once. Refusing to write." % (label, n, CONFIG))
    s, e = text.find(START), text.find(END)
    if e < s:
        sys.exit("The closing sentinel precedes the opening one in %s. Refusing "
                 "to write." % CONFIG)
    return s, e


def carried_span(text):
    """Lift ptpNote/history/monthlyHistory out of the old config verbatim, as one
    contiguous span, so a CSV refresh cannot clobber spreadsheet-sourced data and
    cannot reflow the comments that sit between them either."""
    for name in CARRIED:
        n = len(re.findall(r"^    %s:" % name, text, re.M))
        if n != 1:
            sys.exit("Found %d `%s:` blocks in %s (expected exactly 1). Refusing "
                     "to write." % (n, name, CONFIG))
    first = re.search(r"^    %s:" % CARRIED[0], text, re.M)
    last = re.search(r"(^    %s:.*?)(?=\n  \};)" % CARRIED[-1], text, re.M | re.S)
    if not last:
        sys.exit("Could not find the end of the `%s` block (no closing `  };` for "
                 "`var DATA`). Refusing to write." % CARRIED[-1])
    # One leading newline only: build_block joins its lines with "\n", so this
    # reproduces exactly the one blank line the config keeps above `ptpNote`.
    span = "\n" + text[first.start():last.end()]
    # Nothing but the carried properties may ride along: a future reordering of
    # the config must not silently drag `labels` or an assumption block in here.
    stray = [k for k in re.findall(r"^    ([A-Za-z_]\w*):", span, re.M)
             if k not in CARRIED]
    if stray:
        sys.exit("Unexpected propert%s inside the carried span: %s. The carried "
                 "blocks must be the last properties of `var DATA`. Refusing to "
                 "write." % ("y" if len(stray) == 1 else "ies", ", ".join(stray)))
    return span


def previous_total(text):
    m = re.search(r"groups:\s*\[(.*?)\]", text, re.S)
    if not m:
        return None
    return sum(int(x) for x in re.findall(r"count:\s*(\d+)", m.group(1))) or None


# ------------------------------------------------------------- block assembly

def js_str(s):
    return '"%s"' % s if "'" in s else "'%s'" % s


def plural(n, one, many):
    return "%d %s" % (n, one if n == 1 else many)


def with_comment(code, col, comment):
    return code + " " * max(1, col - len(code)) + "// " + comment


def group_lines(counts):
    keys = ["'%s'," % k for k, _ in GROUPS]
    labels = ["%s," % js_str(label) for _, label in GROUPS]
    # No +1: the format string below supplies the separating space, so the
    # padded field width is the longest field exactly. +1 drifts every line
    # one column right of the hand-written config.
    kw, lw = max(map(len, keys)), max(map(len, labels))
    out = []
    for i, (k, _label) in enumerate(GROUPS):
        tail = "" if i == len(GROUPS) - 1 else ","
        out.append("      { key: %s label: %s count: %d }%s"
                   % (keys[i].ljust(kw), labels[i].ljust(lw),
                      counts.get(k, 0), tail))
    return "\n".join(out)


def source_lines(loc_path, bill_path, active_total):
    files = [os.path.basename(loc_path), os.path.basename(bill_path),
             HISTORY_SOURCE]
    width = max(map(len, files)) + 1
    notes = ["group counts, %d active" % active_total,
             "billing aggregates",
             "annual + monthly history"]
    return "\n".join("  //   %s— %s" % (f.ljust(width), n)
                     for f, n in zip(files, notes))


def build_block(args, counts, status, billing, dropped, carried,
                asof_date, asof_month):
    total = sum(counts.values())
    year = asof_date.year if asof_date else dt.date.today().year
    verified = asof_date.isoformat() if asof_date else args.asof
    zero_locs = billing["locations"] - billing["payingLocations"]
    excl_1 = ('  // Excluded from the active count: company '
              '"Roady\'s Corporate Office"')
    excl_2 = '  // (Fuelman/RCheck payment records, not locations), company "Demo Truck'
    excl_3 = '  // Stops", and any "Test Company #*" row.'
    return "\n".join([
        START,
        "  // Regenerated by tools/refresh-membership-config.py. Hand edits here are",
        "  // overwritten; put wording changes in the `labels` / `report` blocks below,",
        "  // which the script never touches.",
        "  // Last refresh: %s; %d rows dropped as non-locations."
        % (dt.date.today().isoformat(), len(dropped)),
        "  //",
        "  // Sources, all verified %s:" % verified,
        source_lines(args.locations, args.billing, total),
        excl_1,
        excl_2,
        excl_3,
        "  var DATA = {",
        "    DATA_ASOF: '%s'," % args.asof,
        "    CURRENT_YEAR: %d," % year,
        with_comment("    ASOF_MONTH: %d," % asof_month, 29,
                     "data is current through %s" % MONTHS[asof_month - 1]),
        "    HORIZON_YEARS: 3,",
        "",
        "    groups: [",
        group_lines(counts),
        "    ],",
        "",
        "    billing: {",
        "      companies: %d," % billing["companies"],
        with_comment("      locations: %d," % billing["locations"], 31,
                     "locations the billing report covers"),
        "      monthlyDuesTotal: %d," % billing["monthlyDuesTotal"],
        # Emitted, not hand-written, because this comment sits inside the
        # regenerated region: a refresh would otherwise silently delete the one
        # sentence that keeps the field's name and its arithmetic together.
        "      // Divided by PAYING locations, not all %d: the %d locations at"
        % (billing["locations"], zero_locs),
        "      // companies billing $0.00 belong in neither half of a "
        "realization ratio.",
        "      duesPerLocBillable: %.2f," % billing["duesPerLocBillable"],
        with_comment("      payingLocations: %d," % billing["payingLocations"], 31,
                     "%s / %s bill $0.00"
                     % (plural(billing["zeroBillCompanies"], "company", "companies"),
                        plural(zero_locs, "location", "locations"))),
        "      zeroBillCompanies: %d," % billing["zeroBillCompanies"],
        "",
        "      // True-stop-only pair: a C-Store's legitimately low $100-250",
        "      // membership fee drags down a per-location average meant to read",
        "      // as \"what a truck stop / PPO / etc. location bills\". Excludes",
        "      // only the %s whose billing line is unambiguously"
        % plural(billing["cstoreExcludedCompanies"], "company", "companies"),
        "      // C-Store revenue (%s, $%d/mo) -- a company blending"
        % (plural(billing["cstoreExcludedLocations"], "location", "locations"),
           billing["cstoreExcludedDues"]),
        "      // C-Store with another type stays in both totals above, since this",
        "      // source data carries no per-location split to exclude it by. See",
        "      // membershipModel.js's duesRealization for where this pair is used.",
        "      duesPerLocBillableExclCStores: %.2f,"
        % billing["duesPerLocBillableExclCStores"],
        "      payingLocationsExclCStores: %d,"
        % billing["payingLocationsExclCStores"],
        "      monthlyDuesTotalExclCStores: %d,"
        % billing["monthlyDuesTotalExclCStores"],
        "      cstoreExcludedCompanies: %d," % billing["cstoreExcludedCompanies"],
        "      cstoreExcludedLocations: %d," % billing["cstoreExcludedLocations"],
        "      cstoreExcludedDues: %d" % billing["cstoreExcludedDues"],
        "    },",
        "",
        "    statusCounts: { onboarding: %d, offboarding: %d },"
        % (status.get("onboarding", 0), status.get("offboarding", 0)),
        carried,
        "  };",
        "  " + END,
    ])


# ---------------------------------------------------------------- privacy gate

def strip_comments(src):
    return "\n".join(line.split("//", 1)[0] for line in src.split("\n"))


def privacy_guard(block, carried, names, args, counts, billing, status,
                  asof_month):
    """The only thing between private CSVs and a public repo. Not waivable --
    there is deliberately no --force path through this function."""
    generated = block.replace(carried, "")

    # (a) Member business names. Mask the strings the block legitimately
    # contains first, so a member whose name collides with a group label or an
    # excluded non-member entity cannot be mistaken for a leak -- and so a real
    # leak cannot hide behind one.
    masked = generated
    for lit in ([label for _, label in GROUPS] + [k for k, _ in GROUPS]
                + ["Roady's Corporate Office", "Demo Truck Stops",
                   "Test Company #*", "Fuelman/RCheck", HISTORY_SOURCE,
                   args.asof, os.path.basename(args.locations),
                   os.path.basename(args.billing)]):
        masked = masked.replace(lit, " " * len(lit))
    for name in sorted(names):
        if len(name) < 3:
            continue
        if re.search(r"(?<![0-9A-Za-z])%s(?![0-9A-Za-z])" % re.escape(name),
                     masked, re.I):
            sys.exit("REFUSING TO WRITE: the generated block contains the member "
                     "business name %r, which came from one of the source CSVs. "
                     "This repo is public." % name)

    # (b) The same scan over the carried-forward span. It is verbatim text that
    # is already committed, so the script cannot fix it -- but it can refuse to
    # re-publish it, and the fix (scrub the comment) is the operator's.
    for name in sorted(n for n in names if len(n) >= 4):
        if re.search(r"(?<![0-9A-Za-z])%s(?![0-9A-Za-z])" % re.escape(name),
                     carried, re.I):
            sys.exit("REFUSING TO WRITE: the carried-forward ptpNote/history/"
                     "monthlyHistory text in %s mentions the member business name "
                     "%r. That text is already committed to this public repo; "
                     "remove the name from %s by hand, then re-run."
                     % (CONFIG, name, CONFIG))

    # (c) P&L vocabulary.
    low = generated.lower()
    for term in BANNED_TERMS:
        if term.lower() in low:
            sys.exit("REFUSING TO WRITE: the generated block contains the banned "
                     "P&L term %r. P&L actuals are auth-gated and never committed."
                     % term)

    # (d) Only the expected keys, and (e) only the expected numbers. Together
    # these are what stop a per-location figure: anything the script did not
    # compute as an aggregate has no key to live under and no value it may hold.
    code = strip_comments(generated)
    unexpected = sorted({k for k in re.findall(r"([A-Za-z_]\w*)\s*:", code)
                         if k not in ALLOWED_KEYS})
    if unexpected:
        sys.exit("REFUSING TO WRITE: unexpected field(s) in the generated block: "
                 "%s. Only group counts, billing aggregates and the as-of fields "
                 "may be emitted." % ", ".join(unexpected))

    allowed_numbers = {str(counts.get(k, 0)) for k, _ in GROUPS}
    allowed_numbers |= {str(billing["companies"]), str(billing["locations"]),
                        str(billing["monthlyDuesTotal"]),
                        "%.2f" % billing["duesPerLocBillable"],
                        str(billing["payingLocations"]),
                        str(billing["zeroBillCompanies"]),
                        str(billing["monthlyDuesTotalExclCStores"]),
                        "%.2f" % billing["duesPerLocBillableExclCStores"],
                        str(billing["payingLocationsExclCStores"]),
                        str(billing["cstoreExcludedCompanies"]),
                        str(billing["cstoreExcludedLocations"]),
                        str(billing["cstoreExcludedDues"]),
                        str(status.get("onboarding", 0)),
                        str(status.get("offboarding", 0)),
                        str(asof_month), "3"}
    allowed_numbers |= set(re.findall(r"\d+", args.asof))          # as-of date
    allowed_numbers |= {str(dt.date.today().year)}
    for tok in re.findall(r"\d+(?:\.\d+)?", code):
        if tok not in allowed_numbers:
            sys.exit("REFUSING TO WRITE: the generated block contains the number "
                     "%s, which is not one of the aggregates this script computed. "
                     "A per-location figure must never reach the config." % tok)


# ----------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--locations", required=True)
    ap.add_argument("--billing", required=True)
    ap.add_argument("--asof", required=True, help='e.g. "Nov 30, 2026"')
    ap.add_argument("--asof-month", type=int, default=None,
                    help="1-12; defaults to the month parsed from --asof")
    ap.add_argument("--threshold", type=float, default=0.05,
                    help="refuse if the active total moves more than this fraction")
    ap.add_argument("--force", action="store_true",
                    help="bypass the movement threshold and the unclassified-row "
                         "stop. Never bypasses the privacy guard.")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    counts, status, dropped, unclassified, loc_names, ptp_tagged, company_types = \
        read_locations(args.locations)
    billing, bill_names = read_billing(args.billing, company_types)
    names = loc_names | bill_names
    total = sum(counts.values())

    print("Active locations: %d" % total)
    for key, label in GROUPS:
        print("  %-28s %d" % (label, counts.get(key, 0)))
    ptp_total = sum(ptp_tagged.values())
    print("PTP-tagged active rows: %d (reconciliation check for the hand-"
          "maintained ptpHeldCount field in membershipModelConfig.js -- "
          "this script never writes it)" % ptp_total)
    for key, label in GROUPS:
        if ptp_tagged.get(key, 0):
            print("  %-28s %d" % (label, ptp_tagged[key]))
    if ptp_tagged.get("(unclassified)", 0):
        print("  %-28s %d  (also counted above under the unclassified-rows "
              "warning, if any -- excluded from Active locations)"
              % ("(unclassified)", ptp_tagged["(unclassified)"]))
    print("C-Stores excluded from the true-stop-only dues average: %d companies, "
          "%d locations, $%d/mo (pure C-Store billing lines only -- a company "
          "blending C-Store with another type is left in, no split guessed)"
          % (billing["cstoreExcludedCompanies"], billing["cstoreExcludedLocations"],
             billing["cstoreExcludedDues"]))
    print("  duesPerLocBillable          $%.2f  ->  $%.2f excl. C-Stores"
          % (billing["duesPerLocBillable"], billing["duesPerLocBillableExclCStores"]))
    unmatched = billing["unmatchedBillingCompanies"]
    if unmatched:
        print("\n!! %d billing compan%s with NO matching active row in the location-list "
              "CSV (name mismatch -- case, punctuation, a closed location, or a genuine "
              "gap) -- NOT excluded from the true-stop-only average even if actually a "
              "pure C-Store, since there is no location-list evidence either way:"
              % (len(unmatched), "y" if len(unmatched) == 1 else "ies"))
        for name in unmatched:
            print("  %s" % name)
    print("Onboarding: %d   Offboarding: %d"
          % (status.get("onboarding", 0), status.get("offboarding", 0)))
    print("Dropped %d non-location rows:" % len(dropped))
    for d in dropped:
        print("  %-8s %s / %s [%s]" % (d[0] or "(no id)", d[1], d[2], d[3]))
    refusals = []
    if unclassified:
        print("\n!! %d active rows matched no group and were skipped:"
              % len(unclassified))
        for u in unclassified:
            print("  %s Group=%r Type=%r" % u)
        if not args.force:
            refusals.append("Refusing to write with unclassified rows. Fix the "
                            "mapping or pass --force.")
    print("\nBilling: %d companies, %d locations, $%s/mo, %d paying locations, "
          "%d zero-bill companies"
          % (billing["companies"], billing["locations"],
             format(billing["monthlyDuesTotal"], ","),
             billing["payingLocations"], billing["zeroBillCompanies"]))
    print("duesPerLocBillable: $%.2f  =  $%s / %d PAYING locations "
          "(not / %d total -- the %d locations at $0.00 companies are not billable)"
          % (billing["duesPerLocBillable"], format(billing["monthlyDuesTotal"], ","),
             billing["payingLocations"], billing["locations"],
             billing["locations"] - billing["payingLocations"]))

    if not os.path.exists(CONFIG):
        sys.exit("%s not found. Run this from the repo root." % CONFIG)
    with open(CONFIG, encoding="utf-8") as fh:
        text = fh.read()
    s, e = check_sentinels(text)
    carried = carried_span(text)

    prev_total = previous_total(text)
    if prev_total and not args.force:
        move = abs(total - prev_total) / prev_total
        if move > args.threshold:
            # %g, not %.0f: a --threshold of 0.001 printed as "over the 0%
            # threshold", which reads as a bug in the guard rather than a
            # deliberately tight bound.
            refusals.append("Active total moved %.1f%% (%d -> %d), over the %g%% "
                            "threshold. Check the export, then pass --force if it "
                            "is right."
                            % (move * 100, prev_total, total, args.threshold * 100))

    # A refusal stops a write outright. Under --dry-run it does not stop the
    # block being PRINTED first: the message says "check the export", and the
    # dry run is how you check it. Blocking the inspection with the same guard
    # that demands the inspection would leave --force as the only way forward.
    if refusals and not args.dry_run:
        sys.exit("\n".join(refusals))

    asof_date = None
    try:
        asof_date = dt.datetime.strptime(args.asof, "%b %d, %Y").date()
    except ValueError:
        pass
    asof_month = args.asof_month or (asof_date.month if asof_date else None)
    if asof_month is None:
        sys.exit("Could not parse --asof; pass --asof-month explicitly.")
    if not 1 <= asof_month <= 12:
        sys.exit("--asof-month must be 1-12, got %d." % asof_month)

    block = build_block(args, counts, status, billing, dropped, carried,
                        asof_date, asof_month)
    privacy_guard(block, carried, names, args, counts, billing, status, asof_month)

    out = text[:s] + block + text[e + len(END):]
    if args.dry_run:
        print("\n--- dry run, not written ---\n")
        print(block)
        if refusals:
            sys.exit("\n--- dry run: nothing written. A real run would REFUSE ---\n"
                     + "\n".join(refusals))
        return
    with open(CONFIG, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(out)
    print("\nWrote %s. Run `node --test membershipModel.test.js` now -- the "
          "group-total assertion will need updating to %d." % (CONFIG, total))


if __name__ == "__main__":
    main()
